import type { SceneDocument, SceneNode } from "./scene/types";

export type { SceneDocument, SceneNode };
export type {
  SceneNodeType,
  SceneNodeData,
  Transform2D,
  TileMapNodeData,
  TileMapChunk,
  TileMapCell,
  TileMapProjection,
  StaggerAxis,
  StaggerIndex,
  SpriteNodeData,
  CollisionShapeNodeData,
  AreaNodeData,
  Light2DNodeData,
  RootNodeData,
  Node2DData,
  CollisionShapeKind,
  AreaShapeKind,
  Light2DVariant,
} from "./scene/types";

export type PotSize = 64 | 128 | 256 | 512 | 1024;

export type WorkspaceMode = "atlas" | "tileset" | "level" | "animation";
export type SliceKind = "sprite" | "tile" | "both";
export type LevelTool =
  | "brush"
  | "terrain"
  | "erase"
  | "rect"
  | "bucket"
  | "select"
  | "hand"
  | "objectPlace"
  | "objectSelect"
  | "light";
export type SlicerMode = "grid" | "manual";
export type AutotileMode = "cardinal" | "subtile" | "blob47" | "rpgmaker";

export interface BuildOptions {
  maxPageSize: PotSize;
  allowRotation: boolean;
  padding: number;
  extrusion: number;
  includeHashTable: boolean;
  includeDebugJson: boolean;
}

export interface SourceImageAsset {
  id: string;
  fileName: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface SliceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManualSliceRect extends SliceRect {
  name: string;
}

export interface SliceAsset {
  id: string;
  sourceImageId: string;
  name: string;
  kind: SliceKind;
  sourceRect: SliceRect;
  trimmedRect: SliceRect;
  sourceWidth: number;
  sourceHeight: number;
  pivotX: number;
  pivotY: number;
}

export interface SpriteAsset {
  id: number;
  sliceId: string;
  name: string;
  nameHash: number;
  includeInAtlas: boolean;
}

export interface TilesetTileAsset {
  tileId: number;
  sliceId: string;
  spriteId: number;
  name: string;
}

export interface TilesetAsset {
  id: number;
  name: string;
  nameHash: number;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  flags: number;
  firstTileId: number;
  firstAtlasSpriteId: number;
  tileCount: number;
  tileIds: number[];
}

export interface AnimationFrame {
  sliceId: string;
  durationMs: number;
}

export interface SpriteAnimation {
  id: number;
  name: string;
  nameHash: number;
  loop: boolean;
  frames: AnimationFrame[];
}

export interface AnimatedTileFrame {
  sliceId: string;
  durationMs: number;
}

export interface AnimatedTileAsset {
  id: number;
  name: string;
  baseTileId: number;
  frames: AnimatedTileFrame[];
}

export type TerrainSetSlots = Record<number, number>;

export interface TerrainSet {
  id: number;
  name: string;
  tilesetId: number;
  sceneNodeId?: string;
  slots: TerrainSetSlots;
  mode: AutotileMode;
  blobMap?: Record<number, number>;
}

export interface IdCounters {
  sourceImage: number;
  slice: number;
  sprite: number;
  tileset: number;
  tile: number;
  scene: number;
  node: number;
  terrainSet: number;
  spriteAnimation: number;
  animatedTile: number;
}

export interface ProjectDocument {
  version: number;
  name: string;
  sourceImages: SourceImageAsset[];
  slices: SliceAsset[];
  sprites: SpriteAsset[];
  tiles: TilesetTileAsset[];
  tilesets: TilesetAsset[];
  terrainSets: TerrainSet[];
  spriteAnimations: SpriteAnimation[];
  animatedTiles: AnimatedTileAsset[];
  scenes: SceneDocument[];
  atlasSettings: BuildOptions;
  idCounters: IdCounters;
}

export interface GridSliceOptions {
  frameWidth: number;
  frameHeight: number;
  spacingX: number;
  spacingY: number;
  marginX: number;
  marginY: number;
  endOffsetX: number;
  endOffsetY: number;
  keepEmpty: boolean;
  namePrefix: string;
  sliceKind: SliceKind;
}

export interface TilesetDraft {
  name: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
}

export type LevelPickerTab = "slices" | "tiles" | "terrain" | "animated";

export interface TileBrush {
  id: number;
  name: string;
  width: number;
  height: number;
  tiles: number[];
}

export interface EditorState {
  workspace: WorkspaceMode;
  selectedSourceImageId: string | null;
  selectedSliceIds: string[];
  selectedTilesetId: number | null;
  selectedTerrainSetId: number | null;
  selectedSpriteAnimationId: number | null;
  selectedAnimatedTileId: number | null;
  animCurrentFrame: number;
  animIsPlaying: boolean;
  selectedSceneId: string | null;
  selectedNodeId: string | null;
  atlasHoveredSpriteId: number | null;
  levelTool: LevelTool;
  levelPickerTab: LevelPickerTab;
  gridVisible: boolean;
  chunkOverlayVisible: boolean;
  cullingOverlayVisible: boolean;
  levelZoom: number;
  levelPanX: number;
  levelPanY: number;
  slicerZoom: number;
  slicerMode: SlicerMode;
  tilesetDraft: TilesetDraft;
  savedBrushes: TileBrush[];
  activeBrushId: number | null;
  nextBrushId: number;
}

export interface AppState {
  project: ProjectDocument;
  editor: EditorState;
  error: string | null;
  busy: boolean;
  undoStack: SceneHistorySnapshot[];
  redoStack: SceneHistorySnapshot[];
}

export interface SceneHistorySnapshot {
  sceneId: string;
  previousRoot: SceneNode;
  nextRoot: SceneNode;
}

export interface SheetSlicePreview {
  name: string;
  kind: SliceKind;
  rect: SliceRect;
}

export interface ImportSprite {
  id: number;
  nameHash: number;
  fileName: string;
  sourceWidth: number;
  sourceHeight: number;
  trimmedWidth: number;
  trimmedHeight: number;
  trimX: number;
  trimY: number;
  pivotX: number;
  pivotY: number;
  bitmap: ImageData;
}

export interface PreparedSprite extends ImportSprite {
  rotated: boolean;
  frameWidth: number;
  frameHeight: number;
  packedWidth: number;
  packedHeight: number;
  contentWidth: number;
  contentHeight: number;
}

export interface AtlasPlacement {
  sprite: PreparedSprite;
  pageIndex: number;
  frameX: number;
  frameY: number;
}

export interface AtlasPageResult {
  index: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  blobUrl: string;
  blob: Blob;
}

export interface PackedAtlas {
  pages: AtlasPageResult[];
  placements: AtlasPlacement[];
  atlasBin: Uint8Array;
  atlasMetaBin: Uint8Array;
  atlasDebugJson: string;
}

export type ProjectAction =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "setWorkspace"; workspace: WorkspaceMode }
  | { type: "setError"; error: string | null }
  | { type: "setBusy"; busy: boolean }
  | { type: "setSelectedSourceImage"; sourceImageId: string | null }
  | { type: "setSelectedSlices"; sliceIds: string[] }
  | { type: "toggleSliceSelection"; sliceId: string }
  | { type: "setSelectedTileset"; tilesetId: number | null }
  | { type: "setSelectedTerrainSet"; terrainSetId: number | null }
  | { type: "setLevelTool"; tool: LevelTool }
  | { type: "setSlicerZoom"; zoom: number }
  | { type: "setLevelZoom"; zoom: number }
  | { type: "panLevel"; deltaX: number; deltaY: number }
  | { type: "setSlicerMode"; mode: SlicerMode }
  | { type: "setTilesetDraft"; draft: Partial<TilesetDraft> }
  | { type: "toggleGrid" }
  | { type: "toggleChunkOverlay" }
  | { type: "toggleCullingOverlay" }
  | { type: "replaceProject"; project: ProjectDocument }
  | { type: "updateAtlasSettings"; patch: Partial<BuildOptions> }
  | { type: "addSourceImages"; sources: SourceImageAsset[] }
  | { type: "removeSourceImage"; sourceImageId: string }
  | { type: "addSlices"; slices: SliceAsset[]; sprites?: SpriteAsset[] }
  | { type: "addSlicesToAtlas"; sliceIds: string[] }
  | { type: "addSceneTiles"; sceneId: string; nodeId: string; sliceIds: string[] }
  | { type: "removeSlicesFromAtlas"; sliceIds: string[] }
  | { type: "updateSliceKinds"; sliceIds: string[]; kind: SliceKind }
  | { type: "publishTileset"; tileset: TilesetAsset; tiles: TilesetTileAsset[]; sprites: SpriteAsset[] }
  | { type: "upsertTerrainSet"; terrainSet: TerrainSet }
  | { type: "removeTerrainSet"; terrainSetId: number }
  | { type: "upsertSpriteAnimation"; animation: SpriteAnimation }
  | { type: "removeSpriteAnimation"; animationId: number }
  | { type: "setSelectedSpriteAnimation"; animationId: number | null }
  | { type: "upsertAnimatedTile"; animatedTile: AnimatedTileAsset }
  | { type: "removeAnimatedTile"; animatedTileId: number }
  | { type: "setSelectedAnimatedTile"; animatedTileId: number | null }
  | { type: "setAnimFrame"; frame: number }
  | { type: "setAnimPlaying"; playing: boolean }
  | { type: "setLevelPickerTab"; tab: LevelPickerTab }
  | { type: "reorderSprites"; fromIndex: number; toIndex: number }
  | { type: "setAtlasHoveredSprite"; spriteId: number | null }
  | { type: "saveBrush"; brush: Omit<TileBrush, "id"> }
  | { type: "deleteBrush"; brushId: number }
  | { type: "setActiveBrush"; brushId: number | null }
  // Scene graph actions
  | { type: "selectScene"; sceneId: string | null }
  | { type: "selectNode"; nodeId: string | null }
  | { type: "addScene"; scene: SceneDocument }
  | { type: "removeScene"; sceneId: string }
  | { type: "renameScene"; sceneId: string; name: string }
  | { type: "addChildNode"; sceneId: string; parentId: string; node: SceneNode; index?: number }
  | { type: "removeNode"; sceneId: string; nodeId: string }
  | { type: "duplicateNode"; sceneId: string; nodeId: string }
  | { type: "moveNode"; sceneId: string; nodeId: string; newParentId: string; index: number }
  | { type: "reorderNode"; sceneId: string; parentId: string; nodeId: string; toIndex: number }
  | { type: "updateSceneNode"; sceneId: string; nodeId: string; patch: Partial<SceneNode> }
  | { type: "updateSceneNodeData"; sceneId: string; nodeId: string; data: SceneNode["data"] }
  | { type: "updateSceneNodeSilent"; sceneId: string; nodeId: string; patch: Partial<SceneNode> }
  | { type: "updateSceneNodeDataSilent"; sceneId: string; nodeId: string; data: SceneNode["data"] }
  | { type: "commitSceneStroke"; sceneId: string; baseRoot: SceneNode; currentRoot: SceneNode };
