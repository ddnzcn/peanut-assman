import { buildAtlas } from "../atlas";
import type {
  AppState,
  ImportSprite,
  LevelDocument,
  LevelLayer,
  PackedAtlas,
  SliceAsset,
  SpriteAsset,
  TerrainSet,
  TileChunk,
  TilesetAsset,
} from "../types";
import { chunkKey, fnv1a32 } from "../utils";

const sourceCache = new Map<string, Promise<ImageData>>();

export function getSelectedLevel(state: AppState): LevelDocument | null {
  return (
    state.project.levels.find((level) => level.id === state.editor.selectedLevelId) ??
    state.project.levels[0] ??
    null
  );
}

export function getSelectedLayer(state: AppState): LevelLayer | null {
  const level = getSelectedLevel(state);
  if (!level) {
    return null;
  }
  if (!state.editor.selectedLayerId) {
    return null;
  }
  return level.layers.find((layer) => layer.id === state.editor.selectedLayerId) ?? null;
}

export function getSelectedTileset(state: AppState): TilesetAsset | null {
  return (
    state.project.tilesets.find((tileset) => tileset.id === state.editor.selectedTilesetId) ??
    state.project.tilesets[0] ??
    null
  );
}

export function getSelectedTerrainSet(state: AppState): TerrainSet | null {
  return (
    state.project.terrainSets.find((terrainSet) => terrainSet.id === state.editor.selectedTerrainSetId) ??
    state.project.terrainSets.find((terrainSet) => terrainSet.tilesetId === state.editor.selectedTilesetId) ??
    null
  );
}

export function getTileChunk(
  level: LevelDocument,
  layerId: string,
  chunkX: number,
  chunkY: number,
): TileChunk | null {
  return level.chunks[chunkKey(layerId, chunkX, chunkY)] ?? null;
}

export function getSpriteForSlice(project: AppState["project"], sliceId: string): SpriteAsset | null {
  return project.sprites.find((sprite) => sprite.sliceId === sliceId) ?? null;
}

export function getTileById(project: AppState["project"], tileId: number) {
  return project.tiles.find((tile) => tile.tileId === tileId) ?? null;
}

export async function buildAtlasFromProject(project: AppState["project"]): Promise<PackedAtlas | null> {
  const imports = await collectAtlasImports(project);
  if (!imports.length) {
    return null;
  }
  return buildAtlas(imports, project.atlasSettings);
}

async function collectAtlasImports(project: AppState["project"]): Promise<ImportSprite[]> {
  const sliceById = new Map(project.slices.map((slice) => [slice.id, slice]));
  const sourcesById = new Map(project.sourceImages.map((source) => [source.id, source]));
  const sprites = [...project.sprites]
    .filter((sprite) => sprite.includeInAtlas);
  const imports: ImportSprite[] = [];

  for (const sprite of sprites) {
    const slice = sliceById.get(sprite.sliceId);
    if (!slice) {
      continue;
    }
    const source = sourcesById.get(slice.sourceImageId);
    if (!source) {
      continue;
    }
    const image = await decodeCachedSource(source.id, source.dataUrl);
    imports.push(createImportSpriteFromSlice(sprite.name, slice, image));
  }

  return imports;
}

async function decodeCachedSource(sourceId: string, dataUrl: string): Promise<ImageData> {
  let promise = sourceCache.get(sourceId);
  if (!promise) {
    promise = decodeImageData(dataUrl);
    sourceCache.set(sourceId, promise);
  }
  return promise;
}

async function decodeImageData(dataUrl: string): Promise<ImageData> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Unable to decode source image.");
  }
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function createImportSpriteFromSlice(fileName: string, slice: SliceAsset, image: ImageData): ImportSprite {
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
    fileName,
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

export function buildNameHash(name: string): number {
  return fnv1a32(name);
}
