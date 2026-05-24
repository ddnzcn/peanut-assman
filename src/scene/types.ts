export type SceneNodeType =
  | "Root"
  | "Node2D"
  | "Sprite"
  | "TileMap"
  | "CollisionShape"
  | "Area"
  | "Light2D";

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

export interface Light2DNodeData {
  type: "Light2D";
  radius: number;
  color: string;
  intensity: number;
  falloff: number;
}

export type SceneNodeData =
  | RootNodeData
  | Node2DData
  | SpriteNodeData
  | TileMapNodeData
  | CollisionShapeNodeData
  | AreaNodeData
  | Light2DNodeData;

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
  scriptId: string;
  scriptData: Record<string, string>;
  children: SceneNode[];
}

export interface SceneDocument {
  id: string;
  name: string;
  root: SceneNode;
}
