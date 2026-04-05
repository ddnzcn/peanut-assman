import type {
  BuildOptions,
  EditorState,
  IdCounters,
  LevelDocument,
  LevelLayer,
  ProjectDocument,
  TilesetDraft,
} from "../types";

export const DEFAULT_ATLAS_OPTIONS: BuildOptions = {
  maxPageSize: 1024,
  allowRotation: true,
  padding: 2,
  extrusion: 2,
  includeHashTable: true,
  includeDebugJson: true,
};

export const DEFAULT_TILESET_DRAFT: TilesetDraft = {
  name: "tileset_01",
  tileWidth: 16,
  tileHeight: 16,
  columns: 8,
};

export const DEFAULT_EDITOR_STATE: EditorState = {
  workspace: "atlas",
  selectedSourceImageId: null,
  selectedSliceIds: [],
  selectedTilesetId: null,
  selectedTerrainSetId: null,
  selectedSpriteAnimationId: null,
  selectedAnimatedTileId: null,
  animCurrentFrame: 0,
  animIsPlaying: false,
  selectedLevelId: "level-1",
  selectedLayerId: "layer-1",
  selectedCollisionId: null,
  selectedMarkerId: null,
  atlasHoveredSpriteId: null,
  levelTool: "brush",
  levelPickerTab: "tiles",
  gridVisible: true,
  chunkOverlayVisible: true,
  cullingOverlayVisible: true,
  levelZoom: 2,
  levelPanX: 0,
  levelPanY: 0,
  slicerZoom: 1,
  slicerMode: "grid",
  tilesetDraft: DEFAULT_TILESET_DRAFT,
  savedBrushes: [],
  activeBrushId: null,
  nextBrushId: 1,
};

export function createDefaultIdCounters(): IdCounters {
  return {
    sourceImage: 1,
    slice: 1,
    sprite: 1,
    tileset: 1,
    tile: 1,
    level: 2,
    layer: 4,
    collision: 1,
    marker: 1,
    terrainSet: 1,
    spriteAnimation: 1,
    animatedTile: 1,
  };
}

export function createLevelLayer(
  id: string,
  name: string,
  widthTiles: number,
  heightTiles: number,
  capabilities: Partial<Pick<LevelLayer, "hasTiles" | "hasCollision" | "hasMarkers">> = { hasTiles: true },
): LevelLayer {
  return {
    id,
    name,
    visible: true,
    locked: false,
    repeatX: false,
    repeatY: false,
    foreground: false,
    hasTiles: Boolean(capabilities.hasTiles),
    hasCollision: Boolean(capabilities.hasCollision),
    hasMarkers: Boolean(capabilities.hasMarkers),
    parallaxX: 1,
    parallaxY: 1,
    offsetX: 0,
    offsetY: 0,
    widthTiles,
    heightTiles,
  };
}

export function createDefaultLevel(): LevelDocument {
  return {
    id: "level-1",
    name: "level01",
    mapWidthTiles: 64,
    mapHeightTiles: 36,
    tileWidth: 16,
    tileHeight: 16,
    chunkWidthTiles: 16,
    chunkHeightTiles: 16,
    tileIds: [],
    tilesetIds: [],
    layers: [
      createLevelLayer("layer-1", "Ground", 64, 36, { hasTiles: true }),
      createLevelLayer("layer-2", "Gameplay", 64, 36, { hasCollision: true, hasMarkers: true }),
      createLevelLayer("layer-3", "Foreground", 64, 36, { hasTiles: true }),
    ],
    chunks: {},
    collisions: [],
    markers: [],
  };
}

export function createEmptyProject(): ProjectDocument {
  return {
    version: 1,
    name: "Atlas Project",
    sourceImages: [],
    slices: [],
    sprites: [],
    tiles: [],
    tilesets: [],
    terrainSets: [],
    spriteAnimations: [],
    animatedTiles: [],
    levels: [createDefaultLevel()],
    atlasSettings: DEFAULT_ATLAS_OPTIONS,
    idCounters: createDefaultIdCounters(),
  };
}
