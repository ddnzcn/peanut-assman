export type SceneNodeType =
  | "Root"
  | "Node2D"
  | "Sprite"
  | "TileMap"
  | "CollisionShape"
  | "Area"
  | "Light2D"
  | "AnimatedSprite"
  | "Camera2D"
  | "Spawner"
  | "Timer"
  | "VisibilityNotifier"
  | "Decal"
  | "Path2D"
  | "PathFollow2D"
  | "NavRegion2D";

export type TileMapProjection =
  | "orthogonal"
  | "isometric-diamond"
  | "isometric-staggered";

export type StaggerAxis = "x" | "y";
export type StaggerIndex = "even" | "odd";

export type CollisionShapeKind = "rect" | "circle" | "polygon";
export type AreaShapeKind = "point" | "rect";

export interface Transform2D {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface RootNodeData {
  type: "Root";
}

export interface Node2DData {
  type: "Node2D";
}

export interface SpriteNodeData {
  type: "Sprite";
  sliceId: string;
  flipH: boolean;
  flipV: boolean;
  tintColor: string;
}

export interface TileMapChunk {
  chunkX: number;
  chunkY: number;
  tiles: TileMapCell[];
}

export interface TileMapCell {
  tileId: number;
  flags: number;
}

export interface TileMapNodeData {
  type: "TileMap";
  tileWidth: number;
  tileHeight: number;
  chunkWidthTiles: number;
  chunkHeightTiles: number;
  mapWidthTiles: number;
  mapHeightTiles: number;
  projection: TileMapProjection;
  staggerAxis: StaggerAxis;
  staggerIndex: StaggerIndex;
  tileIds: number[];
  tilesetIds: number[];
  chunks: Record<string, TileMapChunk>;
}

export interface CollisionShapeNodeData {
  type: "CollisionShape";
  shape: CollisionShapeKind;
  width: number;
  height: number;
  radius: number;
}

export interface AreaNodeData {
  type: "Area";
  shape: AreaShapeKind;
  width: number;
  height: number;
  areaTag: string;
}

export type Light2DVariant = "omni" | "directional";

export interface Light2DNodeData {
  type: "Light2D";
  variant: Light2DVariant;
  radius: number;
  color: string;
  intensity: number;
  falloff: number;
  directionAngle: number;
  coneAngle: number;
}

export interface AnimatedSpriteNodeData {
  type: "AnimatedSprite";
  spriteAnimationIds: number[];
  flipH: boolean;
  flipV: boolean;
  tintColor: string;
}

export interface Camera2DNodeData {
  type: "Camera2D";
  zoom: number;
  smoothingSpeed: number;
  isCurrent: boolean;
  useBounds: boolean;
  boundsLeft: number;
  boundsTop: number;
  boundsRight: number;
  boundsBottom: number;
  followTargetName: string;
}

export interface SpawnerNodeData {
  type: "Spawner";
  sceneName: string;
  spawnIntervalMs: number;
  maxAlive: number;
  autoStart: boolean;
  spawnAreaRadius: number;
}

export interface TimerNodeData {
  type: "Timer";
  waitTimeMs: number;
  oneShot: boolean;
  autoStart: boolean;
  eventName: string;
}

export interface VisibilityNotifierNodeData {
  type: "VisibilityNotifier";
  width: number;
  height: number;
  enterEventName: string;
  exitEventName: string;
}

export type DecalBlendMode = "alpha" | "additive" | "multiply";

export interface DecalNodeData {
  type: "Decal";
  sliceId: string;
  blendMode: DecalBlendMode;
  sortOffset: number;
  flipH: boolean;
  flipV: boolean;
  tintColor: string;
}

export interface PathPoint {
  x: number;
  y: number;
}

export interface Path2DNodeData {
  type: "Path2D";
  points: PathPoint[];
  closed: boolean;
  color: string;
}

export interface PathFollow2DNodeData {
  type: "PathFollow2D";
  pathNodeName: string;
  progress: number;
  loop: boolean;
  rotateToPath: boolean;
  cubicInterp: boolean;
  loopOffsetMs: number;
}

export interface NavRegion2DNodeData {
  type: "NavRegion2D";
  points: PathPoint[];
  navLayer: number;
}

export type SceneNodeData =
  | RootNodeData
  | Node2DData
  | SpriteNodeData
  | TileMapNodeData
  | CollisionShapeNodeData
  | AreaNodeData
  | Light2DNodeData
  | AnimatedSpriteNodeData
  | Camera2DNodeData
  | SpawnerNodeData
  | TimerNodeData
  | VisibilityNotifierNodeData
  | DecalNodeData
  | Path2DNodeData
  | PathFollow2DNodeData
  | NavRegion2DNodeData;

export interface SceneNode {
  id: string;
  name: string;
  data: SceneNodeData;
  transform: Transform2D;
  visible: boolean;
  locked: boolean;
  renderLayer: number;
  collisionLayer: number;
  collisionMask: number;
  parallaxX: number;
  parallaxY: number;
  scriptId: string;
  scriptData: Record<string, string>;
  children: SceneNode[];
}

export interface SceneDocument {
  id: string;
  name: string;
  root: SceneNode;
}
