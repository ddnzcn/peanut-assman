import { getTileAt } from "./level/editor";
import type { LevelDocument, LevelLayer, TerrainSet } from "./types";

export function calculateBlob47Mask(
  n: boolean,
  s: boolean,
  w: boolean,
  e: boolean,
  nw: boolean,
  ne: boolean,
  sw: boolean,
  se: boolean,
) {
  let mask = 0;
  if (n) mask |= 1;
  if (s) mask |= 2;
  if (w) mask |= 4;
  if (e) mask |= 8;
  if (n && w && nw) mask |= 16;
  if (n && e && ne) mask |= 32;
  if (s && w && sw) mask |= 64;
  if (s && e && se) mask |= 128;
  return mask;
}

export function getTerrainSetMarkerTileId(terrainSet: TerrainSet): number {
  if (terrainSet.mode === "subtile" || terrainSet.mode === "rpgmaker") {
    const fillSlots = [4, 9, 14, 19];
    for (const slot of fillSlots) {
      const tileId = terrainSet.slots[slot];
      if (tileId) {
        return tileId;
      }
    }
  } else {
    const centerTileId = terrainSet.slots[15];
    if (centerTileId) {
      return centerTileId;
    }
  }

  const firstAssignedTileId = Object.values(terrainSet.slots).find((tileId) => tileId);
  return firstAssignedTileId || 0;
}

export function buildTerrainTileToSetMap(terrainSets: TerrainSet[]) {
  const map = new Map<number, TerrainSet>();
  terrainSets.forEach((terrainSet) => {
    Object.values(terrainSet.slots).forEach((tileId) => {
      if (tileId) {
        map.set(tileId, terrainSet);
      }
    });
  });
  return map;
}

export function getSubtileVariantTileIds(
  level: LevelDocument,
  layer: LevelLayer,
  tileX: number,
  tileY: number,
  terrainSet: TerrainSet,
  terrainTileToSet: Map<number, TerrainSet>,
) {
  const isTerrainAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= layer.widthTiles || y >= layer.heightTiles) {
      return false;
    }
    const tileId = getTileAt(level, layer, x, y).tileId;
    return terrainTileToSet.get(tileId)?.id === terrainSet.id;
  };

  const n = isTerrainAt(tileX, tileY - 1);
  const s = isTerrainAt(tileX, tileY + 1);
  const w = isTerrainAt(tileX - 1, tileY);
  const e = isTerrainAt(tileX + 1, tileY);
  const nw = isTerrainAt(tileX - 1, tileY - 1);
  const ne = isTerrainAt(tileX + 1, tileY - 1);
  const sw = isTerrainAt(tileX - 1, tileY + 1);
  const se = isTerrainAt(tileX + 1, tileY + 1);

  const resolveQuadrant = (qIdx: number, n1: boolean, n2: boolean, diag: boolean) => {
    let state = 0;
    if (n1 && n2) state = diag ? 4 : 3;
    else if (n1) state = 1;
    else if (n2) state = 2;
    return terrainSet.slots[qIdx * 5 + state] || 0;
  };

  return [
    resolveQuadrant(0, n, w, nw),
    resolveQuadrant(1, n, e, ne),
    resolveQuadrant(2, s, w, sw),
    resolveQuadrant(3, s, e, se),
  ] as const;
}

export function getSubtileVariantKey(terrainSet: TerrainSet, quadrantTileIds: readonly number[]) {
  return `terrain:${terrainSet.id}:${quadrantTileIds.join(",")}`;
}
