import type {
  CollisionObject,
  LevelDocument,
  LevelLayer,
  MarkerObject,
  MarkerShapeName,
  TileBrush,
  TileCell,
  TileChunk,
} from "../types";
import { chunkKey, mod } from "../utils";

export function paintTile(
  level: LevelDocument,
  layer: LevelLayer,
  tileX: number,
  tileY: number,
  tileId: number,
  flags = 0,
): LevelDocument {
  if (!layer.hasTiles || tileX < 0 || tileY < 0 || tileX >= layer.widthTiles || tileY >= layer.heightTiles) {
    return level;
  }
  const { chunkX, chunkY, localIndex } = getChunkLocation(level, tileX, tileY);
  const key = chunkKey(layer.id, chunkX, chunkY);
  const tileCount = level.chunkWidthTiles * level.chunkHeightTiles;
  const existing = level.chunks[key];
  const tiles = existing ? existing.tiles.map((tile) => ({ ...tile })) : createEmptyTiles(tileCount);
  tiles[localIndex] = { tileId, flags };
  const chunk = { layerId: layer.id, chunkX, chunkY, tiles };
  const nextChunks = { ...level.chunks };
  if (chunk.tiles.every((tile) => tile.tileId === 0 && tile.flags === 0)) {
    delete nextChunks[key];
  } else {
    nextChunks[key] = chunk;
  }
  return { ...level, chunks: nextChunks };
}

export function fillRect(
  level: LevelDocument,
  layer: LevelLayer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tileId: number,
): LevelDocument {
  let next = level;
  const minX = Math.max(0, Math.min(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxX = Math.min(layer.widthTiles - 1, Math.max(x0, x1));
  const maxY = Math.min(layer.heightTiles - 1, Math.max(y0, y1));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      next = paintTile(next, layer, x, y, tileId);
    }
  }
  return next;
}

export function paintBrush(
  level: LevelDocument,
  layer: LevelLayer,
  originX: number,
  originY: number,
  brush: TileBrush,
): LevelDocument {
  let next = level;
  for (let by = 0; by < brush.height; by++) {
    for (let bx = 0; bx < brush.width; bx++) {
      const tileId = brush.tiles[by * brush.width + bx];
      if (tileId) next = paintTile(next, layer, originX + bx, originY + by, tileId);
    }
  }
  return next;
}

export function sampleBrushFromLevel(
  level: LevelDocument,
  layer: LevelLayer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { width: number; height: number; tiles: number[] } {
  const minX = Math.max(0, Math.min(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxX = Math.min(layer.widthTiles - 1, Math.max(x0, x1));
  const maxY = Math.min(layer.heightTiles - 1, Math.max(y0, y1));
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const tiles: number[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      tiles.push(getTileAt(level, layer, x, y).tileId);
    }
  }
  return { width, height, tiles };
}

export function bucketFill(level: LevelDocument, layer: LevelLayer, startX: number, startY: number, tileId: number): LevelDocument {
  const target = getTileAt(level, layer, startX, startY).tileId;
  if (target === tileId) {
    return level;
  }
  const queue: Array<[number, number]> = [[startX, startY]];
  const seen = new Set<string>();
  let next = level;
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const key = `${x}:${y}`;
    if (seen.has(key) || x < 0 || y < 0 || x >= layer.widthTiles || y >= layer.heightTiles) {
      continue;
    }
    seen.add(key);
    if (getTileAt(next, layer, x, y).tileId !== target) {
      continue;
    }
    next = paintTile(next, layer, x, y, tileId);
    queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  return next;
}

export function getTileAt(level: LevelDocument, layer: LevelLayer, tileX: number, tileY: number): TileCell {
  const { chunkX, chunkY, localIndex } = getChunkLocation(level, tileX, tileY);
  const chunk = level.chunks[chunkKey(layer.id, chunkX, chunkY)];
  return chunk?.tiles[localIndex] ?? { tileId: 0, flags: 0 };
}

export function getChunkLocation(level: LevelDocument, tileX: number, tileY: number) {
  const chunkX = Math.floor(tileX / level.chunkWidthTiles);
  const chunkY = Math.floor(tileY / level.chunkHeightTiles);
  const localX = mod(tileX, level.chunkWidthTiles);
  const localY = mod(tileY, level.chunkHeightTiles);
  const localIndex = localY * level.chunkWidthTiles + localX;
  return { chunkX, chunkY, localIndex };
}

export function createEmptyTiles(tileCount: number): TileCell[] {
  return Array.from({ length: tileCount }, () => ({ tileId: 0, flags: 0 }));
}

export function addCollision(level: LevelDocument, collision: CollisionObject): LevelDocument {
  return { ...level, collisions: [...level.collisions, collision] };
}

export function addMarker(level: LevelDocument, marker: MarkerObject): LevelDocument {
  return { ...level, markers: [...level.markers, marker] };
}

export function getVisibleChunks(level: LevelDocument, layer: LevelLayer) {
  return Object.values(level.chunks).filter((chunk) => chunk.layerId === layer.id);
}

export function buildMarker(
  id: number,
  layerId: string,
  shape: MarkerShapeName,
  tileX: number,
  tileY: number,
  tileWidth: number,
  tileHeight: number,
): MarkerObject {
  return {
    id,
    layerId,
    shape,
    flags: 0,
    x: tileX * tileWidth,
    y: tileY * tileHeight,
    w: shape === "Point" ? 0 : tileWidth,
    h: shape === "Point" ? 0 : tileHeight,
    type: "spawn",
    event: "",
    name: `marker_${id}`,
    userData0: 0,
    userData1: 0,
    properties: {},
  };
}
