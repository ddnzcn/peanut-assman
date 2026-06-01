import { DEFAULT_ATLAS_OPTIONS, createDefaultIdCounters } from "./project";
import { tileMapChunkKey, fnv1a32 } from "../utils";
import { createNode } from "../scene/helpers";
import type {
  ProjectDocument,
  SceneDocument,
  SliceAsset,
  SourceImageAsset,
  SpriteAsset,
  TileMapCell,
  TileMapChunk,
  TileMapNodeData,
  TerrainSet,
  TilesetAsset,
  TilesetTileAsset,
} from "../types";

const TILE_WIDTH = 16;
const TILE_HEIGHT = 16;
const MAP_WIDTH_TILES = 32;
const MAP_HEIGHT_TILES = 24;
const CHUNK_WIDTH_TILES = 16;
const CHUNK_HEIGHT_TILES = 16;

export function createExampleProject(): ProjectDocument {
  const source = createExampleSourceImage();
  const slices = createExampleSlices(source.id);
  const sprites = createExampleSprites(slices);
  const tiles = createExampleTilesetTiles(slices, sprites);
  const tileset = createExampleTileset(tiles, sprites);
  const scene = createExampleScene(tileset.id, tiles);
  const terrainSet = createExampleTerrainSet(tileset.id, tiles);

  return {
    version: 1,
    name: "Example Integrated Project",
    sourceImages: [source],
    slices,
    sprites,
    tiles,
    tilesets: [tileset],
    terrainSets: [terrainSet],
    scenes: [scene],
    spriteAnimations: [],
    animatedTiles: [],
    atlasSettings: DEFAULT_ATLAS_OPTIONS,
    idCounters: {
      ...createDefaultIdCounters(),
      sourceImage: 2,
      slice: slices.length + 1,
      sprite: sprites.length + 1,
      tileset: 2,
      tile: tiles.length + 1,
      scene: 2,
      node: 10,
      terrainSet: 2,
    },
  };
}

function createExampleSourceImage(): SourceImageAsset {
  const width = 64;
  const height = 64;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create example source image.");

  context.fillStyle = "#16212d";
  context.fillRect(0, 0, width, height);

  const colors = ["#f8d66d", "#7bd389", "#6bb7ff", "#ff7f7f"];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      context.fillStyle = colors[(row + column) % colors.length];
      context.fillRect(column * 16 + 1, row * 16 + 1, 14, 14);
      context.fillStyle = "rgba(255,255,255,0.18)";
      context.fillRect(column * 16 + 3, row * 16 + 3, 4, 4);
    }
  }

  return {
    id: "source-1",
    fileName: "example_tilesheet.png",
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
  };
}

function createExampleSlices(sourceImageId: string): SliceAsset[] {
  const names = ["grass_top", "grass_mid", "stone_block", "water"];
  return names.map((name, index) => {
    const x = (index % 2) * 16;
    const y = Math.floor(index / 2) * 16;
    return {
      id: `slice-${index + 1}`,
      sourceImageId,
      name,
      kind: "both",
      sourceRect: { x, y, width: 16, height: 16 },
      trimmedRect: { x, y, width: 16, height: 16 },
      sourceWidth: 16,
      sourceHeight: 16,
      pivotX: 8,
      pivotY: 8,
    };
  });
}

function createExampleSprites(slices: SliceAsset[]): SpriteAsset[] {
  return slices.map((slice, index) => {
    const spriteName = `${slice.name}.png`;
    return {
      id: index + 1,
      sliceId: slice.id,
      name: spriteName,
      nameHash: fnv1a32(spriteName),
      includeInAtlas: false,
    };
  });
}

function createExampleTilesetTiles(slices: SliceAsset[], sprites: SpriteAsset[]): TilesetTileAsset[] {
  return slices.map((slice, index) => ({
    tileId: index + 1,
    sliceId: slice.id,
    spriteId: sprites[index].id,
    name: slice.name,
  }));
}

function createExampleTileset(tiles: TilesetTileAsset[], sprites: SpriteAsset[]): TilesetAsset {
  return {
    id: 1,
    name: "terrain_tiles",
    nameHash: fnv1a32("terrain_tiles"),
    tileWidth: TILE_WIDTH,
    tileHeight: TILE_HEIGHT,
    columns: 4,
    flags: 0,
    firstTileId: 1,
    firstAtlasSpriteId: sprites[0]?.id ?? 1,
    tileCount: tiles.length,
    tileIds: tiles.map((tile) => tile.tileId),
  };
}

function createExampleScene(tilesetId: number, tiles: TilesetTileAsset[]): SceneDocument {
  const root = createNode("Root", "Root", "node-scene-1-0");

  const tileMapNode = createNode("TileMap", "TileMap", "node-scene-1-1");
  const tileMapData: TileMapNodeData = {
    type: "TileMap",
    tileWidth: TILE_WIDTH,
    tileHeight: TILE_HEIGHT,
    chunkWidthTiles: CHUNK_WIDTH_TILES,
    chunkHeightTiles: CHUNK_HEIGHT_TILES,
    mapWidthTiles: MAP_WIDTH_TILES,
    mapHeightTiles: MAP_HEIGHT_TILES,
    projection: "orthogonal",
    staggerAxis: "y",
    staggerIndex: "odd",
    tileIds: tiles.map((t) => t.tileId),
    tilesetIds: [tilesetId],
    chunks: {
      [tileMapChunkKey(0, 0)]: createChunk(0, 0, createPatternTiles()),
    },
  };
  tileMapNode.data = tileMapData;

  const collisionNode = createNode("CollisionShape", "Ground Collision", "node-scene-1-2");
  collisionNode.transform = { x: 48, y: 192, rotation: 0, scaleX: 1, scaleY: 1 };
  if (collisionNode.data.type === "CollisionShape") {
    collisionNode.data.width = 160;
    collisionNode.data.height = 32;
  }

  const spawnNode = createNode("Area", "Player Spawn", "node-scene-1-3");
  spawnNode.transform = { x: 64, y: 160, rotation: 0, scaleX: 1, scaleY: 1 };
  if (spawnNode.data.type === "Area") {
    spawnNode.data.shape = "point";
    spawnNode.data.areaTag = "player_spawn";
  }
  spawnNode.scriptId = "spawn_intro";
  spawnNode.scriptData = { facing: "right" };

  root.children = [tileMapNode, collisionNode, spawnNode];

  return { id: "scene-1", name: "example_scene", root };
}

function createExampleTerrainSet(tilesetId: number, tiles: TilesetTileAsset[]): TerrainSet {
  const slots: Record<number, number> = {};
  for (let i = 0; i < 16; i++) {
    slots[i] = tiles[0]?.tileId ?? 0;
  }
  return {
    id: 1,
    name: "terrain_basic",
    tilesetId,
    slots,
    mode: "cardinal",
  };
}

function createChunk(chunkX: number, chunkY: number, tileIds: number[]): TileMapChunk {
  const tiles: TileMapCell[] = tileIds.map((tileId) => ({ tileId, flags: 0 }));
  return { chunkX, chunkY, tiles };
}

function createPatternTiles(): number[] {
  const tiles: number[] = [];
  for (let row = 0; row < CHUNK_HEIGHT_TILES; row += 1) {
    for (let column = 0; column < CHUNK_WIDTH_TILES; column += 1) {
      const pattern = (row + column) % 5;
      tiles.push(pattern === 0 ? 0 : (pattern % 4) + 1);
    }
  }
  return tiles;
}
