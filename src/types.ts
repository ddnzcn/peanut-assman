export type PotSize = 64 | 128 | 256 | 512 | 1024;

export type WorkspaceMode = "atlas" | "tileset" | "level";
export type SliceKind = "sprite" | "tile" | "both";
export type LevelTool =
  | "brush"
  | "terrain"
  | "erase"
  | "rect"
  | "bucket"
  | "select"
  | "hand"
  | "collisionRect"
  | "markerPoint"
  | "markerRect";
export type SlicerMode = "grid" | "manual";
export type CollisionTypeName = "Solid" | "OneWay" | "Trigger" | "Hurt";
export type MarkerShapeName = "Point" | "Rect";

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

export interface TerrainSetSlots {
  center: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
}

export interface TerrainSet {
  id: number;
  name: string;
  tilesetId: number;
  slots: TerrainSetSlots;
}

export interface TileCell {
  tileId: number;
  flags: number;
}

export interface TileChunk {
  layerId: string;
  chunkX: number;
  chunkY: number;
  tiles: TileCell[];
}

export interface CollisionObject {
  id: number;
  layerId: string;
  type: CollisionTypeName;
  flags: number;
  x: number;
  y: number;
  w: number;
  h: number;
  userData0: number;
  userData1: number;
}

export interface MarkerObject {
  id: number;
  layerId: string;
  shape: MarkerShapeName;
  flags: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: string;
  event: string;
  name: string;
  userData0: number;
  userData1: number;
  properties: Record<string, string>;
}

export interface LevelLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  repeatX: boolean;
  repeatY: boolean;
  foreground: boolean;
  hasTiles: boolean;
  hasCollision: boolean;
  hasMarkers: boolean;
  parallaxX: number;
  parallaxY: number;
  offsetX: number;
  offsetY: number;
  widthTiles: number;
  heightTiles: number;
}

export interface LevelDocument {
  id: string;
  name: string;
  mapWidthTiles: number;
  mapHeightTiles: number;
  tileWidth: number;
  tileHeight: number;
  chunkWidthTiles: number;
  chunkHeightTiles: number;
  tilesetIds: number[];
  layers: LevelLayer[];
  chunks: Record<string, TileChunk>;
  collisions: CollisionObject[];
  markers: MarkerObject[];
}

export interface IdCounters {
  sourceImage: number;
  slice: number;
  sprite: number;
  tileset: number;
  tile: number;
  level: number;
  layer: number;
  collision: number;
  marker: number;
  terrainSet: number;
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
  levels: LevelDocument[];
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

export interface EditorState {
  workspace: WorkspaceMode;
  selectedSourceImageId: string | null;
  selectedSliceIds: string[];
  selectedTilesetId: number | null;
  selectedTerrainSetId: number | null;
  selectedLevelId: string | null;
  selectedLayerId: string | null;
  selectedCollisionId: number | null;
  selectedMarkerId: number | null;
  atlasHoveredSpriteId: number | null;
  levelTool: LevelTool;
  gridVisible: boolean;
  chunkOverlayVisible: boolean;
  cullingOverlayVisible: boolean;
  levelZoom: number;
  levelPanX: number;
  levelPanY: number;
  slicerZoom: number;
  slicerMode: SlicerMode;
  tilesetDraft: TilesetDraft;
}

export interface AppState {
  project: ProjectDocument;
  editor: EditorState;
  error: string | null;
  busy: boolean;
}

export interface SheetSlicePreview {
  name: string;
  kind: SliceKind;
  rect: SliceRect;
}

export interface ImportSprite {
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
  id: number;
  nameHash: number;
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
  | { type: "setWorkspace"; workspace: WorkspaceMode }
  | { type: "setError"; error: string | null }
  | { type: "setBusy"; busy: boolean }
  | { type: "setSelectedSourceImage"; sourceImageId: string | null }
  | { type: "setSelectedSlices"; sliceIds: string[] }
  | { type: "toggleSliceSelection"; sliceId: string }
  | { type: "setSelectedTileset"; tilesetId: number | null }
  | { type: "setSelectedTerrainSet"; terrainSetId: number | null }
  | { type: "setSelectedLevel"; levelId: string | null }
  | { type: "setSelectedLayer"; layerId: string | null }
  | { type: "setSelectedCollision"; collisionId: number | null }
  | { type: "setSelectedMarker"; markerId: number | null }
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
  | { type: "addSlices"; slices: SliceAsset[]; sprites?: SpriteAsset[] }
  | { type: "addSlicesToAtlas"; sliceIds: string[] }
  | { type: "removeSlicesFromAtlas"; sliceIds: string[] }
  | { type: "updateSliceKinds"; sliceIds: string[]; kind: SliceKind }
  | { type: "publishTileset"; tileset: TilesetAsset; tiles: TilesetTileAsset[]; sprites: SpriteAsset[] }
  | { type: "upsertTerrainSet"; terrainSet: TerrainSet }
  | { type: "removeTerrainSet"; terrainSetId: number }
  | { type: "reorderSprites"; fromIndex: number; toIndex: number }
  | { type: "addLevel"; level: LevelDocument }
  | { type: "removeLevel"; levelId: string }
  | { type: "addLayer"; levelId: string; layer: LevelLayer }
  | { type: "reorderLayer"; levelId: string; layerId: string; direction?: "up" | "down"; toIndex?: number }
  | { type: "removeLayer"; levelId: string; layerId: string }
  | { type: "updateLevel"; level: LevelDocument }
  | { type: "replaceLevelChunks"; levelId: string; chunks: Record<string, TileChunk> }
  | { type: "setAtlasHoveredSprite"; spriteId: number | null };
