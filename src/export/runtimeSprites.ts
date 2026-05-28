import { getTileAt } from "../level/editor";
import {
  buildTerrainTileToSetMap,
  getSubtileVariantKey,
  getSubtileVariantTileIds,
} from "../terrain";
import type {
  ImportSprite,
  ProjectDocument,
  SceneNode,
  SliceAsset,
  SourceImageAsset,
  SpriteAsset,
  TerrainSet,
  TileMapNodeData,
  TilesetTileAsset,
} from "../types";
import { fnv1a32 } from "../utils";

export interface RuntimeSpriteCatalog {
  imports: ImportSprite[];
  terrainVariantSpriteIds: Map<string, number>;
}

const imageDataCache = new Map<string, Promise<ImageData>>();
const imageElementCache = new Map<string, Promise<HTMLImageElement>>();

function collectTileMapNodes(root: SceneNode): (SceneNode & { data: TileMapNodeData })[] {
  const result: (SceneNode & { data: TileMapNodeData })[] = [];
  if (root.data.type === "TileMap") {
    result.push(root as SceneNode & { data: TileMapNodeData });
  }
  for (const child of root.children) {
    result.push(...collectTileMapNodes(child));
  }
  return result;
}

export async function buildRuntimeSpriteCatalog(project: ProjectDocument): Promise<RuntimeSpriteCatalog> {
  const sliceById = new Map(project.slices.map((slice) => [slice.id, slice]));
  const sourceById = new Map(project.sourceImages.map((source) => [source.id, source]));
  const tileById = new Map(project.tiles.map((tile) => [tile.tileId, tile]));
  const terrainTileToSet = buildTerrainTileToSetMap(project.terrainSets);

  // Slice IDs referenced by animations/animated tiles must be in the atlas
  // regardless of their includeInAtlas flag, otherwise frames can't render.
  const animationSliceIds = new Set<string>();
  for (const animTile of project.animatedTiles ?? []) {
    for (const frame of animTile.frames) animationSliceIds.add(frame.sliceId);
  }
  for (const anim of project.spriteAnimations ?? []) {
    for (const frame of anim.frames) animationSliceIds.add(frame.sliceId);
  }

  const imports: ImportSprite[] = [];
  const includedSprites = [...project.sprites]
    .filter((sprite) => sprite.includeInAtlas || animationSliceIds.has(sprite.sliceId))
    .sort((left, right) => left.id - right.id);

  for (const sprite of includedSprites) {
    const slice = sliceById.get(sprite.sliceId);
    if (!slice) continue;
    const source = sourceById.get(slice.sourceImageId);
    if (!source) continue;
    const image = await decodeImageData(source);
    imports.push(createImportSpriteFromSlice(sprite, slice, image));
  }

  let nextSyntheticSpriteId =
    Math.max(0, ...project.sprites.map((sprite) => sprite.id)) + 1;
  const terrainVariantSpriteIds = new Map<string, number>();

  for (const scene of project.scenes) {
    const tileMapNodes = collectTileMapNodes(scene.root);
    for (const node of tileMapNodes) {
      const tileMap = node.data;
      const chunks = Object.values(tileMap.chunks)
        .sort((left, right) => left.chunkY - right.chunkY || left.chunkX - right.chunkX);
      for (const chunk of chunks) {
        for (let tileIndex = 0; tileIndex < chunk.tiles.length; tileIndex += 1) {
          const cell = chunk.tiles[tileIndex];
          if (!cell.tileId) continue;
          const terrainSet = terrainTileToSet.get(cell.tileId);
          if (!terrainSet || (terrainSet.mode !== "subtile" && terrainSet.mode !== "rpgmaker")) continue;

          const localX = tileIndex % tileMap.chunkWidthTiles;
          const localY = Math.floor(tileIndex / tileMap.chunkWidthTiles);
          const tileX = chunk.chunkX * tileMap.chunkWidthTiles + localX;
          const tileY = chunk.chunkY * tileMap.chunkHeightTiles + localY;
          if (tileX >= tileMap.mapWidthTiles || tileY >= tileMap.mapHeightTiles) continue;

          const quadrantTileIds = getSubtileVariantTileIds(
            tileMap,
            tileX,
            tileY,
            terrainSet,
            terrainTileToSet,
          );
          if (quadrantTileIds.some((tileId) => !tileId)) continue;

          const key = getSubtileVariantKey(terrainSet, quadrantTileIds);
          if (terrainVariantSpriteIds.has(key)) continue;

          const importSprite = await createTerrainVariantImportSprite(
            nextSyntheticSpriteId,
            key,
            tileMap,
            quadrantTileIds,
            tileById,
            sliceById,
            sourceById,
          );
          if (!importSprite) continue;

          terrainVariantSpriteIds.set(key, nextSyntheticSpriteId);
          imports.push(importSprite);
          nextSyntheticSpriteId += 1;
        }
      }
    }
  }

  imports.sort((left, right) => left.id - right.id);
  return { imports, terrainVariantSpriteIds };
}

export function resolveRuntimeSpriteIdForCell(
  project: ProjectDocument,
  catalog: RuntimeSpriteCatalog,
  tileMap: TileMapNodeData,
  tileX: number,
  tileY: number,
): { spriteId: number; exportKey: string } | null {
  const tileById = new Map(project.tiles.map((tile) => [tile.tileId, tile]));
  const spriteBySliceId = new Map(project.sprites.map((sprite) => [sprite.sliceId, sprite]));
  const terrainTileToSet = buildTerrainTileToSetMap(project.terrainSets);
  const cell = getTileAt(tileMap, tileX, tileY);
  if (!cell.tileId) return null;

  const terrainSet = terrainTileToSet.get(cell.tileId);
  if (terrainSet && (terrainSet.mode === "subtile" || terrainSet.mode === "rpgmaker")) {
    const quadrantTileIds = getSubtileVariantTileIds(
      tileMap,
      tileX,
      tileY,
      terrainSet,
      terrainTileToSet,
    );
    const key = getSubtileVariantKey(terrainSet, quadrantTileIds);
    const spriteId = catalog.terrainVariantSpriteIds.get(key);
    if (spriteId !== undefined) {
      return { spriteId, exportKey: key };
    }
  }

  const animTile = project.animatedTiles?.find((at) => at.id === cell.tileId);
  if (animTile && animTile.frames.length > 0) {
    const firstFrame = animTile.frames[0];
    const sprite = spriteBySliceId.get(firstFrame.sliceId);
    if (sprite) {
      return { spriteId: sprite.id, exportKey: `animtile:${animTile.id}` };
    }
    return null;
  }

  const tile = tileById.get(cell.tileId);
  if (!tile) return null;
  const sprite = spriteBySliceId.get(tile.sliceId);
  return {
    spriteId: sprite?.id ?? tile.spriteId,
    exportKey: `tile:${tile.tileId}`,
  };
}

async function createTerrainVariantImportSprite(
  spriteId: number,
  key: string,
  tileMap: TileMapNodeData,
  quadrantTileIds: readonly number[],
  tileById: Map<number, TilesetTileAsset>,
  sliceById: Map<string, SliceAsset>,
  sourceById: Map<string, SourceImageAsset>,
) {
  const canvas = document.createElement("canvas");
  canvas.width = tileMap.tileWidth;
  canvas.height = tileMap.tileHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Unable to create terrain bake context.");

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  for (let index = 0; index < quadrantTileIds.length; index += 1) {
    const tile = tileById.get(quadrantTileIds[index]);
    const slice = tile ? sliceById.get(tile.sliceId) : null;
    const source = slice ? sourceById.get(slice.sourceImageId) : null;
    if (!tile || !slice || !source) return null;
    const image = await decodeImageElement(source);
    const destX = (index % 2) * (tileMap.tileWidth / 2);
    const destY = Math.floor(index / 2) * (tileMap.tileHeight / 2);
    context.drawImage(
      image,
      slice.sourceRect.x,
      slice.sourceRect.y,
      slice.sourceRect.width,
      slice.sourceRect.height,
      destX,
      destY,
      tileMap.tileWidth / 2,
      tileMap.tileHeight / 2,
    );
  }

  const fullImage = context.getImageData(0, 0, canvas.width, canvas.height);
  const trimmed = trimImageData(fullImage);
  return {
    id: spriteId,
    nameHash: fnv1a32(key),
    fileName: key,
    sourceWidth: canvas.width,
    sourceHeight: canvas.height,
    trimmedWidth: trimmed.bitmap.width,
    trimmedHeight: trimmed.bitmap.height,
    trimX: trimmed.trimX,
    trimY: trimmed.trimY,
    pivotX: 0,
    pivotY: 0,
    bitmap: trimmed.bitmap,
  } satisfies ImportSprite;
}

function trimImageData(image: ImageData) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[(y * image.width + x) * 4 + 3];
      if (alpha === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return { trimX: 0, trimY: 0, bitmap: new ImageData(1, 1) };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const output = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const srcStart = ((minY + row) * image.width + minX) * 4;
    output.set(image.data.subarray(srcStart, srcStart + width * 4), row * width * 4);
  }

  return { trimX: minX, trimY: minY, bitmap: new ImageData(output, width, height) };
}

function createImportSpriteFromSlice(sprite: SpriteAsset, slice: SliceAsset, image: ImageData): ImportSprite {
  const source = cropImageData(
    image,
    slice.sourceRect.x,
    slice.sourceRect.y,
    slice.sourceRect.width,
    slice.sourceRect.height,
  );
  const trimmed = cropImageData(
    image,
    slice.trimmedRect.x,
    slice.trimmedRect.y,
    slice.trimmedRect.width,
    slice.trimmedRect.height,
  );
  return {
    id: sprite.id,
    nameHash: sprite.nameHash,
    fileName: sprite.name,
    sourceWidth: source.width,
    sourceHeight: source.height,
    trimmedWidth: trimmed.width,
    trimmedHeight: trimmed.height,
    trimX: slice.trimmedRect.x - slice.sourceRect.x,
    trimY: slice.trimmedRect.y - slice.sourceRect.y,
    pivotX: slice.pivotX,
    pivotY: slice.pivotY,
    bitmap: trimmed,
  };
}

function cropImageData(image: ImageData, x: number, y: number, width: number, height: number): ImageData {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const srcStart = ((y + row) * image.width + x) * 4;
    output.set(image.data.subarray(srcStart, srcStart + width * 4), row * width * 4);
  }
  return new ImageData(output, width, height);
}

async function decodeImageData(source: SourceImageAsset): Promise<ImageData> {
  let promise = imageDataCache.get(source.id);
  if (!promise) {
    promise = (async () => {
      const image = await decodeImageElement(source);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Unable to decode source image.");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    })();
    imageDataCache.set(source.id, promise);
  }
  return promise;
}

async function decodeImageElement(source: SourceImageAsset): Promise<HTMLImageElement> {
  let promise = imageElementCache.get(source.id);
  if (!promise) {
    promise = (async () => {
      const image = new Image();
      image.src = source.dataUrl;
      await image.decode();
      return image;
    })();
    imageElementCache.set(source.id, promise);
  }
  return promise;
}
