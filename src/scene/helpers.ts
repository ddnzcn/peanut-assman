import type {
  SceneDocument,
  SceneNode,
  SceneNodeData,
  SceneNodeType,
  TileMapNodeData,
  Transform2D,
} from "./types";

export function defaultTransform(): Transform2D {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
}

export function createNode(
  type: SceneNodeType,
  name: string,
  id: string,
): SceneNode {
  return {
    id,
    name,
    data: createDefaultNodeData(type),
    transform: defaultTransform(),
    visible: true,
    locked: false,
    renderLayer: 0,
    collisionLayer: 1,
    collisionMask: 1,
    parallaxX: 1,
    parallaxY: 1,
    scriptId: "",
    scriptData: {},
    children: [],
  };
}

function createDefaultNodeData(type: SceneNodeType): SceneNodeData {
  switch (type) {
    case "Root":
      return { type: "Root" };
    case "Node2D":
      return { type: "Node2D" };
    case "Sprite":
      return { type: "Sprite", sliceId: "", flipH: false, flipV: false, tintColor: "#ffffffff" };
    case "TileMap":
      return createDefaultTileMapData();
    case "CollisionShape":
      return { type: "CollisionShape", shape: "rect", width: 32, height: 32, radius: 16 };
    case "Area":
      return { type: "Area", shape: "rect", width: 32, height: 32, areaTag: "" };
    case "Light2D":
      return { type: "Light2D", radius: 128, color: "#ffffff", intensity: 1, falloff: 1 };
  }
}

export function createDefaultTileMapData(): TileMapNodeData {
  return {
    type: "TileMap",
    tileWidth: 16,
    tileHeight: 16,
    chunkWidthTiles: 16,
    chunkHeightTiles: 16,
    mapWidthTiles: 64,
    mapHeightTiles: 36,
    projection: "orthogonal",
    staggerAxis: "y",
    staggerIndex: "odd",
    tileIds: [],
    tilesetIds: [],
    chunks: {},
  };
}

export function createDefaultScene(id: string): SceneDocument {
  const root = createNode("Root", "Root", `node-${id}-0`);
  const tileMap = createNode("TileMap", "TileMap", `node-${id}-1`);
  root.children = [tileMap];
  return { id, name: `scene_${id}`, root };
}

export function findNode(root: SceneNode, nodeId: string): SceneNode | null {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

export function findNodeParent(
  root: SceneNode,
  nodeId: string,
): { parent: SceneNode; index: number } | null {
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id === nodeId) {
      return { parent: root, index: i };
    }
    const found = findNodeParent(root.children[i], nodeId);
    if (found) return found;
  }
  return null;
}

export function updateNode(
  root: SceneNode,
  nodeId: string,
  updater: (node: SceneNode) => SceneNode,
): SceneNode {
  if (root.id === nodeId) return updater(root);
  const nextChildren = root.children.map((child) => updateNode(child, nodeId, updater));
  if (nextChildren.every((child, i) => child === root.children[i])) return root;
  return { ...root, children: nextChildren };
}

export function removeNode(root: SceneNode, nodeId: string): SceneNode {
  const nextChildren = root.children
    .filter((child) => child.id !== nodeId)
    .map((child) => removeNode(child, nodeId));
  if (
    nextChildren.length === root.children.length &&
    nextChildren.every((child, i) => child === root.children[i])
  ) {
    return root;
  }
  return { ...root, children: nextChildren };
}

export function insertNode(
  root: SceneNode,
  parentId: string,
  node: SceneNode,
  index?: number,
): SceneNode {
  if (root.id === parentId) {
    const children = [...root.children];
    const insertAt = index !== undefined ? Math.min(index, children.length) : children.length;
    children.splice(insertAt, 0, node);
    return { ...root, children };
  }
  const nextChildren = root.children.map((child) => insertNode(child, parentId, node, index));
  if (nextChildren.every((child, i) => child === root.children[i])) return root;
  return { ...root, children: nextChildren };
}

export function moveNode(
  root: SceneNode,
  nodeId: string,
  newParentId: string,
  index: number,
): SceneNode {
  const node = findNode(root, nodeId);
  if (!node) return root;
  const withoutNode = removeNode(root, nodeId);
  return insertNode(withoutNode, newParentId, node, index);
}

export function reorderNode(
  root: SceneNode,
  parentId: string,
  nodeId: string,
  toIndex: number,
): SceneNode {
  return updateNode(root, parentId, (parent) => {
    const fromIndex = parent.children.findIndex((c) => c.id === nodeId);
    if (fromIndex === -1 || fromIndex === toIndex) return parent;
    const children = [...parent.children];
    const [moved] = children.splice(fromIndex, 1);
    children.splice(toIndex, 0, moved);
    return { ...parent, children };
  });
}

export function flattenNodes(root: SceneNode): SceneNode[] {
  const result: SceneNode[] = [root];
  for (const child of root.children) {
    result.push(...flattenNodes(child));
  }
  return result;
}

export function flattenByRenderLayer(root: SceneNode): Map<number, SceneNode[]> {
  const layers = new Map<number, SceneNode[]>();
  for (const node of flattenNodes(root)) {
    if (!node.visible) continue;
    const layer = node.renderLayer;
    const list = layers.get(layer);
    if (list) {
      list.push(node);
    } else {
      layers.set(layer, [node]);
    }
  }
  return layers;
}

export function getWorldTransform(root: SceneNode, nodeId: string): Transform2D {
  const path = getNodePath(root, nodeId);
  if (!path.length) return defaultTransform();

  let x = 0;
  let y = 0;
  let rotation = 0;
  let scaleX = 1;
  let scaleY = 1;

  for (const node of path) {
    const t = node.transform;
    const cos = Math.cos((rotation * Math.PI) / 180);
    const sin = Math.sin((rotation * Math.PI) / 180);
    x += (t.x * cos - t.y * sin) * scaleX;
    y += (t.x * sin + t.y * cos) * scaleY;
    rotation += t.rotation;
    scaleX *= t.scaleX;
    scaleY *= t.scaleY;
  }

  return { x, y, rotation, scaleX, scaleY };
}

function getNodePath(root: SceneNode, nodeId: string): SceneNode[] {
  if (root.id === nodeId) return [root];
  for (const child of root.children) {
    const path = getNodePath(child, nodeId);
    if (path.length) return [root, ...path];
  }
  return [];
}

export function getTileMapNode(
  root: SceneNode,
  nodeId: string,
): (SceneNode & { data: TileMapNodeData }) | null {
  const node = findNode(root, nodeId);
  if (node && node.data.type === "TileMap") {
    return node as SceneNode & { data: TileMapNodeData };
  }
  return null;
}

export function findAncestorTileMap(
  root: SceneNode,
  nodeId: string,
): (SceneNode & { data: TileMapNodeData }) | null {
  const path = getNodePath(root, nodeId);
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].data.type === "TileMap") {
      return path[i] as SceneNode & { data: TileMapNodeData };
    }
  }
  return null;
}

export function findFirstTileMapInScene(root: SceneNode): TileMapNodeData | null {
  if (root.data.type === "TileMap") return root.data;
  for (const child of root.children) {
    const found = findFirstTileMapInScene(child);
    if (found) return found;
  }
  return null;
}

export interface TileMapInstance {
  nodeId: string;
  data: TileMapNodeData;
  worldX: number;
  worldY: number;
}

export function collectTileMapInstances(root: SceneNode): TileMapInstance[] {
  const result: TileMapInstance[] = [];
  function walk(node: SceneNode) {
    if (!node.visible) return;
    if (node.data.type === "TileMap") {
      const wt = getWorldTransform(root, node.id);
      result.push({ nodeId: node.id, data: node.data, worldX: wt.x, worldY: wt.y });
    }
    for (const child of node.children) walk(child);
  }
  walk(root);
  return result;
}

export function computeSceneBounds(root: SceneNode): { width: number; height: number } {
  let maxW = 1024;
  let maxH = 768;
  const instances = collectTileMapInstances(root);
  for (const inst of instances) {
    const right = inst.worldX + inst.data.mapWidthTiles * inst.data.tileWidth;
    const bottom = inst.worldY + inst.data.mapHeightTiles * inst.data.tileHeight;
    if (right > maxW) maxW = right;
    if (bottom > maxH) maxH = bottom;
  }
  return { width: Math.max(maxW, 1024), height: Math.max(maxH, 768) };
}

export function countNodes(root: SceneNode): number {
  let count = 1;
  for (const child of root.children) {
    count += countNodes(child);
  }
  return count;
}
