import type { PointerEvent as ReactPointerEvent } from "react";
import { buildAnimatedTileLookup, resolveAnimatedTileSliceId } from "../../animation/playback";
import { getTileAt } from "../../level/editor";
import { calculateBlob47Mask, getTerrainSetMarkerTileId } from "../../terrain";
import type { LevelDocument, LevelLayer, ProjectDocument, SliceRect, SourceImageAsset, TileChunk } from "../../types";

export function getImagePoint(
  event: ReactPointerEvent<HTMLDivElement>,
  element: HTMLDivElement | null,
  source: SourceImageAsset,
  zoom: number,
) {
  if (!element) {
    return null;
  }
  const bounds = element.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / zoom);
  const y = Math.floor((event.clientY - bounds.top) / zoom);
  if (x < 0 || y < 0 || x >= source.width || y >= source.height) {
    return null;
  }
  return { x, y };
}

export function getCanvasTile(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  level: LevelDocument,
  zoom: number,
) {
  if (!canvas) {
    return null;
  }
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / (level.tileWidth * zoom));
  const y = Math.floor((event.clientY - bounds.top) / (level.tileHeight * zoom));
  if (x < 0 || y < 0 || x >= level.mapWidthTiles || y >= level.mapHeightTiles) {
    return null;
  }
  return { x, y };
}

export function rectStyle(rect: SliceRect, zoom: number) {
  return {
    left: rect.x * zoom,
    top: rect.y * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  };
}

export function normalizeRect(x0: number, y0: number, x1: number, y1: number): SliceRect {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  return {
    x: left,
    y: top,
    width: Math.abs(x1 - x0) + 1,
    height: Math.abs(y1 - y0) + 1,
  };
}

export function pointInRect(x: number, y: number, rect: SliceRect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function layerCapabilityLabel(layer: LevelLayer) {
  const labels: string[] = [];
  if (layer.hasTiles) {
    labels.push("tiles");
  }
  if (layer.hasCollision) {
    labels.push("collision");
  }
  if (layer.hasMarkers) {
    labels.push("markers");
  }
  return labels.join(" + ") || "empty";
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Chunk-based tile rendering — no OffscreenCanvas, no rebuild spikes on zoom
// ---------------------------------------------------------------------------
// Iterates actual chunk tile arrays instead of the full W×H grid, so empty
// positions are skipped entirely. Combined with cached project Maps this is
// fast enough for smooth 60fps animation without any invalidation overhead.

export function renderLevelCanvas(
  canvas: HTMLCanvasElement | null,
  project: ProjectDocument,
  level: LevelDocument | null,
  selectedLayer: LevelLayer | null,
  zoom: number,
  animTimeMs?: number,
  onInvalidate?: () => void,
) {
  if (!canvas || !level) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const tileW = level.tileWidth * zoom;
  const tileH = level.tileHeight * zoom;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#12171c";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const { tileById, sliceById, sourceById, terrainSetsMap, animatedTileLookup, terrainTileToSetId } = getProjectMaps(project);

  // Group chunks by layerId once — O(total_chunks), reused for all layers.
  const chunksByLayer = new Map<string, TileChunk[]>();
  for (const chunk of Object.values(level.chunks) as TileChunk[]) {
    const arr = chunksByLayer.get(chunk.layerId);
    if (arr) arr.push(chunk);
    else chunksByLayer.set(chunk.layerId, [chunk]);
  }

  for (const layer of level.layers) {
    if (!layer.visible || !layer.hasTiles) continue;
    for (const chunk of (chunksByLayer.get(layer.id) ?? [])) {
      for (let i = 0; i < chunk.tiles.length; i++) {
        const cell = chunk.tiles[i];
        if (!cell.tileId) continue;

        const localX = i % level.chunkWidthTiles;
        const localY = Math.floor(i / level.chunkWidthTiles);
        const x = chunk.chunkX * level.chunkWidthTiles + localX;
        const y = chunk.chunkY * level.chunkHeightTiles + localY;

        const animSliceId = animTimeMs !== undefined
          ? resolveAnimatedTileSliceId(animatedTileLookup, cell.tileId, animTimeMs)
          : null;
        const setId = terrainTileToSetId.get(cell.tileId);
        const terrainSet = setId !== undefined ? terrainSetsMap.get(setId) : null;

        if (terrainSet && terrainSet.mode === "blob47") {
          const isTerrainAt = (tx: number, ty: number) => {
            if (tx < 0 || ty < 0 || tx >= layer.widthTiles || ty >= layer.heightTiles) return false;
            return terrainTileToSetId.get(getTileAt(level, layer, tx, ty).tileId) === setId;
          };
          const n = isTerrainAt(x, y - 1); const s = isTerrainAt(x, y + 1);
          const w = isTerrainAt(x - 1, y); const e = isTerrainAt(x + 1, y);
          const nw = isTerrainAt(x - 1, y - 1); const ne = isTerrainAt(x + 1, y - 1);
          const sw = isTerrainAt(x - 1, y + 1); const se = isTerrainAt(x + 1, y + 1);
          const mask = calculateBlob47Mask(n, s, w, e, nw, ne, sw, se);
          const blobTileId = terrainSet.slots[mask] || getTerrainSetMarkerTileId(terrainSet);
          const blobAsset = tileById.get(blobTileId);
          const blobSlice = blobAsset ? sliceById.get(blobAsset.sliceId) : null;
          const blobSource = blobSlice ? sourceById.get(blobSlice.sourceImageId) : null;
          const blobImage = blobSource ? getCachedRenderImage(blobSource.id, blobSource.dataUrl, onInvalidate) : null;
          if (blobSlice && blobImage?.complete && blobImage.naturalWidth) {
            context.drawImage(blobImage, blobSlice.sourceRect.x, blobSlice.sourceRect.y, blobSlice.sourceRect.width, blobSlice.sourceRect.height, x * tileW, y * tileH, tileW, tileH);
          } else {
            context.fillStyle = "#37526a";
            context.fillRect(x * tileW, y * tileH, tileW, tileH);
          }
          continue;
        }

        if (terrainSet && (terrainSet.mode === "subtile" || terrainSet.mode === "rpgmaker")) {
          const isTerrainAt = (tx: number, ty: number) => {
            if (tx < 0 || ty < 0 || tx >= layer.widthTiles || ty >= layer.heightTiles) return false;
            return terrainTileToSetId.get(getTileAt(level, layer, tx, ty).tileId) === setId;
          };
          const n = isTerrainAt(x, y - 1); const s = isTerrainAt(x, y + 1);
          const w = isTerrainAt(x - 1, y); const e = isTerrainAt(x + 1, y);
          const nw = isTerrainAt(x - 1, y - 1); const ne = isTerrainAt(x + 1, y - 1);
          const sw = isTerrainAt(x - 1, y + 1); const se = isTerrainAt(x + 1, y + 1);
          const drawSubtile = (qIdx: number, n1: boolean, n2: boolean, diag: boolean, xOff: number, yOff: number) => {
            let st = 0;
            if (n1 && n2) st = diag ? 4 : 3;
            else if (n1) st = 1;
            else if (n2) st = 2;
            const qTileId = terrainSet.slots[qIdx * 5 + st];
            const qTile = qTileId ? tileById.get(qTileId) : null;
            const qSlice = qTile ? sliceById.get(qTile.sliceId) : null;
            const qSource = qSlice ? sourceById.get(qSlice.sourceImageId) : null;
            const qImage = qSource ? getCachedRenderImage(qSource.id, qSource.dataUrl, onInvalidate) : null;
            if (qSlice && qImage?.complete && qImage.naturalWidth) {
              context.drawImage(qImage, qSlice.sourceRect.x, qSlice.sourceRect.y, qSlice.sourceRect.width, qSlice.sourceRect.height, x * tileW + (xOff * tileW) / 2, y * tileH + (yOff * tileH) / 2, tileW / 2, tileH / 2);
            } else {
              context.fillStyle = "#37526a";
              context.fillRect(x * tileW + (xOff * tileW) / 2, y * tileH + (yOff * tileH) / 2, tileW / 2, tileH / 2);
            }
          };
          drawSubtile(0, n, w, nw, 0, 0);
          drawSubtile(1, n, e, ne, 1, 0);
          drawSubtile(2, s, w, sw, 0, 1);
          drawSubtile(3, s, e, se, 1, 1);
          continue;
        }

        const slice = animSliceId
          ? sliceById.get(animSliceId)
          : (() => { const a = tileById.get(cell.tileId); return a ? sliceById.get(a.sliceId) : null; })();
        const source = slice ? sourceById.get(slice.sourceImageId) : null;
        const image = source ? getCachedRenderImage(source.id, source.dataUrl, onInvalidate) : null;
        if (!slice || !image?.complete || !image.naturalWidth) {
          context.fillStyle = "#37526a";
          context.fillRect(x * tileW, y * tileH, tileW, tileH);
          continue;
        }
        context.drawImage(image, slice.sourceRect.x, slice.sourceRect.y, slice.sourceRect.width, slice.sourceRect.height, x * tileW, y * tileH, tileW, tileH);
      }
    }
  }

  for (const collision of level.collisions) {
    context.strokeStyle = "#ff7c7c";
    context.lineWidth = 2;
    context.strokeRect(collision.x * zoom, collision.y * zoom, collision.w * zoom, collision.h * zoom);
  }
  for (const marker of level.markers) {
    context.strokeStyle = "#77d8ff";
    context.lineWidth = 2;
    if (marker.shape === "Point") {
      context.beginPath();
      context.arc(marker.x * zoom + tileW * 0.5, marker.y * zoom + tileH * 0.5, 5, 0, Math.PI * 2);
      context.stroke();
    } else {
      context.strokeRect(marker.x * zoom, marker.y * zoom, marker.w * zoom, marker.h * zoom);
    }
  }

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= level.mapWidthTiles; x++) {
    context.moveTo(x * tileW, 0);
    context.lineTo(x * tileW, canvas.height);
  }
  for (let y = 0; y <= level.mapHeightTiles; y++) {
    context.moveTo(0, y * tileH);
    context.lineTo(canvas.width, y * tileH);
  }
  context.stroke();

  context.strokeStyle = "rgba(255,200,90,0.3)";
  context.lineWidth = 1.5;
  context.beginPath();
  for (let x = 0; x <= level.mapWidthTiles; x += level.chunkWidthTiles) {
    context.moveTo(x * tileW, 0);
    context.lineTo(x * tileW, canvas.height);
  }
  for (let y = 0; y <= level.mapHeightTiles; y += level.chunkHeightTiles) {
    context.moveTo(0, y * tileH);
    context.lineTo(canvas.width, y * tileH);
  }
  context.stroke();

  if (selectedLayer) {
    context.strokeStyle = "rgba(88,171,255,0.75)";
    context.lineWidth = 2;
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  }
}

const renderImageCache = new Map<string, HTMLImageElement>();

// Cache project-derived lookup maps keyed by project object identity.
// The project reference only changes when Redux state changes, never between animation frames,
// so these maps only get rebuilt when data actually changes — not every 60fps tick.
let _cachedProject: unknown = null;
let _cachedTileById = new Map<number, import("../../types").TilesetTileAsset>();
let _cachedSliceById = new Map<string, import("../../types").SliceAsset>();
let _cachedSourceById = new Map<string, import("../../types").SourceImageAsset>();
let _cachedTerrainSetsMap = new Map<number, import("../../types").TerrainSet>();
let _cachedAnimatedTileLookup = new Map<number, import("../../types").AnimatedTileAsset>();
let _cachedTerrainTileToSetId = new Map<number, number>();

function getProjectMaps(project: ProjectDocument) {
  if (project !== _cachedProject) {
    _cachedProject = project;
    _cachedTileById = new Map(project.tiles.map((e) => [e.tileId, e]));
    _cachedSliceById = new Map(project.slices.map((e) => [e.id, e]));
    _cachedSourceById = new Map(project.sourceImages.map((e) => [e.id, e]));
    _cachedTerrainSetsMap = new Map(project.terrainSets.map((s) => [s.id, s]));
    _cachedAnimatedTileLookup = buildAnimatedTileLookup(project.animatedTiles ?? []);
    _cachedTerrainTileToSetId = new Map<number, number>();
    project.terrainSets.forEach((set) => {
      Object.values(set.slots).forEach((tileId) => {
        if (tileId) _cachedTerrainTileToSetId.set(tileId, set.id);
      });
    });
  }
  return {
    tileById: _cachedTileById,
    sliceById: _cachedSliceById,
    sourceById: _cachedSourceById,
    terrainSetsMap: _cachedTerrainSetsMap,
    animatedTileLookup: _cachedAnimatedTileLookup,
    terrainTileToSetId: _cachedTerrainTileToSetId,
  };
}

function getCachedRenderImage(sourceId: string, dataUrl: string, onInvalidate?: () => void) {
  let image = renderImageCache.get(sourceId);
  if (!image) {
    image = new Image();
    image.src = dataUrl;
    renderImageCache.set(sourceId, image);
  } else if (image.src !== dataUrl) {
    image.src = dataUrl;
  }
  if (onInvalidate && (!image.complete || !image.naturalWidth)) {
    image.addEventListener("load", onInvalidate, { once: true });
  }
  return image;
}
