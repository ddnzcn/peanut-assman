import { DEFAULT_ATLAS_OPTIONS, createDefaultIdCounters, createLevelLayer } from "./project";
import { chunkKey, fnv1a32 } from "../utils";
import type {
  CollisionObject,
  LevelDocument,
  MarkerObject,
  ProjectDocument,
  SliceAsset,
  SourceImageAsset,
  SpriteAsset,
  TileCell,
  TileChunk,
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
  const terrainSet = createExampleTerrainSet(tileset.id, tiles);
  const level = createExampleLevel(tileset.id);

  return {
    version: 1,
    name: "Example Integrated Project",
    sourceImages: [source],
    slices,
    sprites,
    tiles,
    tilesets: [tileset],
    terrainSets: [terrainSet],
    levels: [level],
    atlasSettings: DEFAULT_ATLAS_OPTIONS,
    idCounters: {
      ...createDefaultIdCounters(),
      sourceImage: 2,
      slice: slices.length + 1,
      sprite: sprites.length + 1,
      tileset: 2,
      tile: tiles.length + 1,
      level: 2,
      layer: 4,
      collision: 3,
      marker: 3,
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
  if (!context) {
    throw new Error("Unable to create example source image.");
  }

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

function createExampleTilesetTiles(
  slices: SliceAsset[],
  sprites: SpriteAsset[],
): TilesetTileAsset[] {
  return slices.map((slice, index) => ({
    tileId: index + 1,
    sliceId: slice.id,
    spriteId: sprites[index].id,
    name: slice.name,
  }));
}

function createExampleTileset(
  tiles: TilesetTileAsset[],
  sprites: SpriteAsset[],
): TilesetAsset {
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

function createExampleLevel(tilesetId: number): LevelDocument {
  const groundLayer = createLevelLayer("layer-1", "Ground", MAP_WIDTH_TILES, MAP_HEIGHT_TILES, { hasTiles: true });
  const gameplayLayer = createLevelLayer("layer-2", "Gameplay", MAP_WIDTH_TILES, MAP_HEIGHT_TILES, {
    hasCollision: true,
    hasMarkers: true,
  });
  const foregroundLayer = createLevelLayer("layer-3", "Foreground", MAP_WIDTH_TILES, MAP_HEIGHT_TILES, { hasTiles: true });

  const chunks: Record<string, TileChunk> = {};
  const groundChunk = createChunk("layer-1", 0, 0, createPatternTiles());
  chunks[chunkKey("layer-1", 0, 0)] = groundChunk;

  const collisions: CollisionObject[] = [
    {
      id: 1,
      layerId: "layer-2",
      type: "Solid",
      flags: 4,
      x: 48,
      y: 192,
      w: 160,
      h: 32,
      userData0: 0,
      userData1: 0,
    },
    {
      id: 2,
      layerId: "layer-2",
      type: "OneWay",
      flags: 4,
      x: 208,
      y: 128,
      w: 96,
      h: 16,
      userData0: 1,
      userData1: 0,
    },
  ];

  const markers: MarkerObject[] = [
    {
      id: 1,
      layerId: "layer-2",
      shape: "Point",
      flags: 0,
      x: 64,
      y: 160,
      w: 0,
      h: 0,
      type: "player_spawn",
      event: "spawn_intro",
      name: "spawn_main",
      userData0: 0,
      userData1: 0,
      properties: {
        facing: "right",
      },
    },
    {
      id: 2,
      layerId: "layer-2",
      shape: "Rect",
      flags: 0,
      x: 224,
      y: 96,
      w: 64,
      h: 64,
      type: "camera_zone",
      event: "intro_pan",
      name: "camera_intro",
      userData0: 0,
      userData1: 1,
      properties: {
        target: "boss_room",
      },
    },
  ];

  return {
    id: "level-1",
    name: "example_level",
    mapWidthTiles: MAP_WIDTH_TILES,
    mapHeightTiles: MAP_HEIGHT_TILES,
    tileWidth: TILE_WIDTH,
    tileHeight: TILE_HEIGHT,
    chunkWidthTiles: CHUNK_WIDTH_TILES,
    chunkHeightTiles: CHUNK_HEIGHT_TILES,
    tilesetIds: [tilesetId],
    layers: [groundLayer, gameplayLayer, foregroundLayer],
    chunks,
    collisions,
    markers,
  };
}

function createExampleTerrainSet(tilesetId: number, tiles: TilesetTileAsset[]) {
  return {
    id: 1,
    name: "terrain_basic",
    tilesetId,
    slots: {
      center: tiles[0]?.tileId ?? 0,
      top: tiles[1]?.tileId ?? 0,
      bottom: tiles[1]?.tileId ?? 0,
      left: tiles[2]?.tileId ?? 0,
      right: tiles[2]?.tileId ?? 0,
      topLeft: tiles[3]?.tileId ?? 0,
      topRight: tiles[3]?.tileId ?? 0,
      bottomLeft: tiles[3]?.tileId ?? 0,
      bottomRight: tiles[3]?.tileId ?? 0,
      innerTopLeft: tiles[3]?.tileId ?? 0,
      innerTopRight: tiles[3]?.tileId ?? 0,
      innerBottomLeft: tiles[3]?.tileId ?? 0,
      innerBottomRight: tiles[3]?.tileId ?? 0,
    },
  };
}

function createChunk(
  layerId: string,
  chunkX: number,
  chunkY: number,
  tileIds: number[],
): TileChunk {
  const tiles: TileCell[] = tileIds.map((tileId) => ({
    tileId,
    flags: 0,
  }));
  return { layerId, chunkX, chunkY, tiles };
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
