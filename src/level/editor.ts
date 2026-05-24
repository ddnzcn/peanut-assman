import type {
  TileMapNodeData,
  TileMapCell,
  TileMapChunk,
  TileBrush,
} from "../types";
import { tileMapChunkKey, mod } from "../utils";

export function paintTile(
  tileMap: TileMapNodeData,
  tileX: number,
  tileY: number,
  tileId: number,
  flags = 0,
): TileMapNodeData {
  if (tileX < 0 || tileY < 0 || tileX >= tileMap.mapWidthTiles || tileY >= tileMap.mapHeightTiles) {
    return tileMap;
  }
  const { chunkX, chunkY, localIndex } = getChunkLocation(tileMap, tileX, tileY);
  const key = tileMapChunkKey(chunkX, chunkY);
  const tileCount = tileMap.chunkWidthTiles * tileMap.chunkHeightTiles;
  const existing = tileMap.chunks[key];
  const tiles = existing ? existing.tiles.map((tile) => ({ ...tile })) : createEmptyTiles(tileCount);
  tiles[localIndex] = { tileId, flags };
  const chunk: TileMapChunk = { chunkX, chunkY, tiles };
  const nextChunks = { ...tileMap.chunks };
  if (chunk.tiles.every((tile) => tile.tileId === 0 && tile.flags === 0)) {
    delete nextChunks[key];
  } else {
    nextChunks[key] = chunk;
  }
  return { ...tileMap, chunks: nextChunks };
}

export function fillRect(
  tileMap: TileMapNodeData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tileId: number,
): TileMapNodeData {
  let next = tileMap;
  const minX = Math.max(0, Math.min(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxX = Math.min(tileMap.mapWidthTiles - 1, Math.max(x0, x1));
  const maxY = Math.min(tileMap.mapHeightTiles - 1, Math.max(y0, y1));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      next = paintTile(next, x, y, tileId);
    }
  }
  return next;
}

export function paintBrush(
  tileMap: TileMapNodeData,
  originX: number,
  originY: number,
  brush: TileBrush,
): TileMapNodeData {
  let next = tileMap;
  for (let by = 0; by < brush.height; by++) {
    for (let bx = 0; bx < brush.width; bx++) {
      const tileId = brush.tiles[by * brush.width + bx];
      if (tileId) next = paintTile(next, originX + bx, originY + by, tileId);
    }
  }
  return next;
}

export function sampleBrushFromTileMap(
  tileMap: TileMapNodeData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { width: number; height: number; tiles: number[] } {
  const minX = Math.max(0, Math.min(x0, x1));
  const minY = Math.max(0, Math.min(y0, y1));
  const maxX = Math.min(tileMap.mapWidthTiles - 1, Math.max(x0, x1));
  const maxY = Math.min(tileMap.mapHeightTiles - 1, Math.max(y0, y1));
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const tiles: number[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      tiles.push(getTileAt(tileMap, x, y).tileId);
    }
  }
  return { width, height, tiles };
}

export function bucketFill(
  tileMap: TileMapNodeData,
  startX: number,
  startY: number,
  tileId: number,
): TileMapNodeData {
  const target = getTileAt(tileMap, startX, startY).tileId;
  if (target === tileId) {
    return tileMap;
  }
  const queue: Array<[number, number]> = [[startX, startY]];
  const seen = new Set<string>();
  let next = tileMap;
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const key = `${x}:${y}`;
    if (seen.has(key) || x < 0 || y < 0 || x >= tileMap.mapWidthTiles || y >= tileMap.mapHeightTiles) {
      continue;
    }
    seen.add(key);
    if (getTileAt(next, x, y).tileId !== target) {
      continue;
    }
    next = paintTile(next, x, y, tileId);
    queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  return next;
}

export function getTileAt(tileMap: TileMapNodeData, tileX: number, tileY: number): TileMapCell {
  const { chunkX, chunkY, localIndex } = getChunkLocation(tileMap, tileX, tileY);
  const chunk = tileMap.chunks[tileMapChunkKey(chunkX, chunkY)];
  return chunk?.tiles[localIndex] ?? { tileId: 0, flags: 0 };
}

export function getChunkLocation(tileMap: TileMapNodeData, tileX: number, tileY: number) {
  const chunkX = Math.floor(tileX / tileMap.chunkWidthTiles);
  const chunkY = Math.floor(tileY / tileMap.chunkHeightTiles);
  const localX = mod(tileX, tileMap.chunkWidthTiles);
  const localY = mod(tileY, tileMap.chunkHeightTiles);
  const localIndex = localY * tileMap.chunkWidthTiles + localX;
  return { chunkX, chunkY, localIndex };
}

export function createEmptyTiles(tileCount: number): TileMapCell[] {
  return Array.from({ length: tileCount }, () => ({ tileId: 0, flags: 0 }));
}

export function getVisibleChunks(tileMap: TileMapNodeData): TileMapChunk[] {
  return Object.values(tileMap.chunks);
}
