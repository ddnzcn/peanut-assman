import type { PointerEvent as ReactPointerEvent } from "react";
import { buildAnimatedTileLookup, resolveAnimatedTileSliceId } from "../../animation/playback";
import { getTileAt } from "../../level/editor";
import { calculateBlob47Mask, getTerrainSetMarkerTileId } from "../../terrain";
import type { ProjectDocument, SceneDocument, SceneNode, SliceRect, SourceImageAsset, TileMapChunk, TileMapNodeData } from "../../types";
import { flattenByRenderLayer, getWorldTransform } from "../../scene/helpers";

export function getImagePoint(
  event: ReactPointerEvent<HTMLDivElement>,
  element: HTMLDivElement | null,
  source: SourceImageAsset,
  zoom: number,
) {
  if (!element) return null;
  const bounds = element.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / zoom);
  const y = Math.floor((event.clientY - bounds.top) / zoom);
  if (x < 0 || y < 0 || x >= source.width || y >= source.height) return null;
  return { x, y };
}

export function getCanvasTile(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  tileMap: TileMapNodeData,
  zoom: number,
) {
  if (!canvas) return null;
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / (tileMap.tileWidth * zoom));
  const y = Math.floor((event.clientY - bounds.top) / (tileMap.tileHeight * zoom));
  if (x < 0 || y < 0 || x >= tileMap.mapWidthTiles || y >= tileMap.mapHeightTiles) return null;
  return { x, y };
}

export function getCanvasPixel(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  zoom: number,
): { x: number; y: number } | null {
  if (!canvas) return null;
  const bounds = canvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / zoom;
  const y = (event.clientY - bounds.top) / zoom;
  return { x: Math.round(x), y: Math.round(y) };
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

export function renderLevelCanvas(
  canvas: HTMLCanvasElement | null,
  project: ProjectDocument,
  tileMap: TileMapNodeData | null,
  zoom: number,
  animTimeMs?: number,
  onInvalidate?: () => void,
  skipTiles = false,
) {
  if (!canvas || !tileMap) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const tileW = tileMap.tileWidth * zoom;
  const tileH = tileMap.tileHeight * zoom;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!skipTiles) {
    context.fillStyle = "#12171c";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const { tileById, sliceById, sourceById, terrainSetsMap, animatedTileLookup, terrainTileToSetId } = getProjectMaps(project);

  if (!skipTiles) for (const chunk of Object.values(tileMap.chunks) as TileMapChunk[]) {
    for (let i = 0; i < chunk.tiles.length; i++) {
      const cell = chunk.tiles[i];
      if (!cell.tileId) continue;

      const localX = i % tileMap.chunkWidthTiles;
      const localY = Math.floor(i / tileMap.chunkWidthTiles);
      const x = chunk.chunkX * tileMap.chunkWidthTiles + localX;
      const y = chunk.chunkY * tileMap.chunkHeightTiles + localY;

      const animSliceId = animTimeMs !== undefined
        ? resolveAnimatedTileSliceId(animatedTileLookup, cell.tileId, animTimeMs)
        : null;
      const setId = terrainTileToSetId.get(cell.tileId);
      const terrainSet = setId !== undefined ? terrainSetsMap.get(setId) : null;

      if (terrainSet && terrainSet.mode === "blob47") {
        const isTerrainAt = (tx: number, ty: number) => {
          if (tx < 0 || ty < 0 || tx >= tileMap.mapWidthTiles || ty >= tileMap.mapHeightTiles) return false;
          return terrainTileToSetId.get(getTileAt(tileMap, tx, ty).tileId) === setId;
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
          if (tx < 0 || ty < 0 || tx >= tileMap.mapWidthTiles || ty >= tileMap.mapHeightTiles) return false;
          return terrainTileToSetId.get(getTileAt(tileMap, tx, ty).tileId) === setId;
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

  // Grid
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= tileMap.mapWidthTiles; x++) {
    context.moveTo(x * tileW, 0);
    context.lineTo(x * tileW, canvas.height);
  }
  for (let y = 0; y <= tileMap.mapHeightTiles; y++) {
    context.moveTo(0, y * tileH);
    context.lineTo(canvas.width, y * tileH);
  }
  context.stroke();

  // Chunk boundaries
  context.strokeStyle = "rgba(255,200,90,0.3)";
  context.lineWidth = 1.5;
  context.beginPath();
  for (let x = 0; x <= tileMap.mapWidthTiles; x += tileMap.chunkWidthTiles) {
    context.moveTo(x * tileW, 0);
    context.lineTo(x * tileW, canvas.height);
  }
  for (let y = 0; y <= tileMap.mapHeightTiles; y += tileMap.chunkHeightTiles) {
    context.moveTo(0, y * tileH);
    context.lineTo(canvas.width, y * tileH);
  }
  context.stroke();
}

export function renderSceneNodes(
  canvas: HTMLCanvasElement | null,
  project: ProjectDocument,
  scene: SceneDocument | null,
  selectedNodeId: string | null,
  zoom: number,
  onInvalidate?: () => void,
) {
  if (!canvas || !scene) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const { sliceById, sourceById } = getProjectMaps(project);
  const layers = flattenByRenderLayer(scene.root);
  const sortedKeys = [...layers.keys()].sort((a, b) => a - b);

  for (const layerKey of sortedKeys) {
    const nodes = layers.get(layerKey)!;
    for (const node of nodes) {
      if (node.data.type === "Root" || node.data.type === "Node2D" || node.data.type === "TileMap") continue;

      const wt = getWorldTransform(scene.root, node.id);
      const px = wt.x * zoom;
      const py = wt.y * zoom;

      if (node.data.type === "Sprite") {
        const slice = sliceById.get(node.data.sliceId);
        const source = slice ? sourceById.get(slice.sourceImageId) : null;
        const image = source ? getCachedRenderImage(source.id, source.dataUrl, onInvalidate) : null;
        if (slice && image?.complete && image.naturalWidth) {
          context.save();
          context.translate(px, py);
          if (wt.rotation) context.rotate(wt.rotation * Math.PI / 180);
          context.scale(
            wt.scaleX * (node.data.flipH ? -1 : 1),
            wt.scaleY * (node.data.flipV ? -1 : 1),
          );
          context.drawImage(
            image,
            slice.sourceRect.x, slice.sourceRect.y,
            slice.sourceRect.width, slice.sourceRect.height,
            0, 0,
            slice.sourceRect.width * zoom, slice.sourceRect.height * zoom,
          );
          context.restore();
        } else {
          context.fillStyle = "rgba(135,197,255,0.25)";
          context.fillRect(px, py, 16 * zoom, 16 * zoom);
        }
      } else if (node.data.type === "CollisionShape") {
        context.strokeStyle = "rgba(255,124,124,0.8)";
        context.lineWidth = 2;
        if (node.data.shape === "circle") {
          context.beginPath();
          context.arc(px, py, node.data.radius * zoom, 0, Math.PI * 2);
          context.stroke();
        } else {
          context.strokeRect(px, py, node.data.width * zoom, node.data.height * zoom);
        }
      } else if (node.data.type === "Area") {
        context.strokeStyle = "rgba(119,216,255,0.8)";
        context.lineWidth = 2;
        if (node.data.shape === "point") {
          context.beginPath();
          context.arc(px, py, 5, 0, Math.PI * 2);
          context.stroke();
          context.fillStyle = "rgba(119,216,255,0.3)";
          context.fill();
        } else {
          context.strokeRect(px, py, node.data.width * zoom, node.data.height * zoom);
        }
      } else if (node.data.type === "Light2D") {
        const r = node.data.radius * zoom;
        const gradient = context.createRadialGradient(px, py, 0, px, py, r);
        gradient.addColorStop(0, "rgba(255,224,102,0.3)");
        gradient.addColorStop(1, "rgba(255,224,102,0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(px, py, r, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(255,224,102,0.6)";
        context.lineWidth = 1;
        context.stroke();
      }

      // Selection gizmo is rendered as DOM overlay in workspaces.tsx
    }
  }
}

function getNodeBounds(node: SceneNode): { w: number; h: number } {
  switch (node.data.type) {
    case "CollisionShape": return { w: node.data.width, h: node.data.height };
    case "Area": return { w: node.data.width, h: node.data.height };
    case "Light2D": return { w: node.data.radius * 2, h: node.data.radius * 2 };
    case "Sprite": return { w: 16, h: 16 };
    default: return { w: 16, h: 16 };
  }
}

const renderImageCache = new Map<string, HTMLImageElement>();

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
