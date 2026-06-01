import type {
  BuildOptions,
  EditorState,
  IdCounters,
  ProjectDocument,
  TilesetDraft,
} from "../types";
import { createDefaultScene } from "../scene/helpers";

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
  selectedSceneId: "scene-1",
  selectedNodeId: null,
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
    scene: 2,
    node: 10,
    terrainSet: 1,
    spriteAnimation: 1,
    animatedTile: 1,
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
    scenes: [createDefaultScene("scene-1")],
    atlasSettings: DEFAULT_ATLAS_OPTIONS,
    idCounters: createDefaultIdCounters(),
  };
}
