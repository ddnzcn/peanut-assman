import type { PointerEvent as ReactPointerEvent } from "react";
import { buildAnimatedTileLookup, resolveAnimatedTileSliceId } from "../../animation/playback";
import { getTileAt } from "../../level/editor";
import { calculateBlob47Mask, getTerrainSetMarkerTileId } from "../../terrain";
import type { ProjectDocument, SceneDocument, SceneNode, SliceRect, SourceImageAsset, TileMapChunk, TileMapNodeData } from "../../types";
import { collectTileMapInstances, flattenByRenderLayer, getWorldTransform, type TileMapInstance } from "../../scene/helpers";

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
  offsetX = 0,
  offsetY = 0,
) {
  if (!canvas) return null;
  const bounds = canvas.getBoundingClientRect();
  const px = event.clientX - bounds.left - offsetX * zoom;
  const py = event.clientY - bounds.top - offsetY * zoom;
  const tile = screenToTile(px, py, tileMap, zoom);
  if (tile.x < 0 || tile.y < 0 || tile.x >= tileMap.mapWidthTiles || tile.y >= tileMap.mapHeightTiles) return null;
  return tile;
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

export function tileToScreen(
  tileX: number,
  tileY: number,
  tileMap: TileMapNodeData,
  zoom: number,
): { x: number; y: number } {
  const tw = tileMap.tileWidth * zoom;
  const th = tileMap.tileHeight * zoom;
  if (tileMap.projection === "isometric-diamond") {
    return {
      x: (tileX - tileY) * (tw / 2) + (tileMap.mapHeightTiles * tw / 2),
      y: (tileX + tileY) * (th / 2),
    };
  }
  if (tileMap.projection === "isometric-staggered") {
    return {
      x: tileX * tw + (tileY & 1) * (tw / 2),
      y: tileY * (th / 2),
    };
  }
  return { x: tileX * tw, y: tileY * th };
}

export function screenToTile(
  px: number,
  py: number,
  tileMap: TileMapNodeData,
  zoom: number,
): { x: number; y: number } {
  const tw = tileMap.tileWidth * zoom;
  const th = tileMap.tileHeight * zoom;
  if (tileMap.projection === "isometric-diamond") {
    const adjusted = px - (tileMap.mapHeightTiles * tw / 2);
    const halfW = tw / 2;
    const halfH = th / 2;
    return {
      x: Math.floor((adjusted / halfW + py / halfH) / 2),
      y: Math.floor((py / halfH - adjusted / halfW) / 2),
    };
  }
  if (tileMap.projection === "isometric-staggered") {
    const roughY = Math.floor(py / (th / 2));
    const oddRow = roughY & 1;
    const roughX = Math.floor((px - oddRow * (tw / 2)) / tw);
    return { x: roughX, y: roughY };
  }
  return { x: Math.floor(px / tw), y: Math.floor(py / th) };
}

export function getTileMapPixelBounds(tileMap: TileMapNodeData, zoom: number): { w: number; h: number } {
  const tw = tileMap.tileWidth * zoom;
  const th = tileMap.tileHeight * zoom;
  if (tileMap.projection === "isometric-diamond") {
    return {
      w: (tileMap.mapWidthTiles + tileMap.mapHeightTiles) * (tw / 2),
      h: (tileMap.mapWidthTiles + tileMap.mapHeightTiles) * (th / 2),
    };
  }
  if (tileMap.projection === "isometric-staggered") {
    return {
      w: tileMap.mapWidthTiles * tw + tw / 2,
      h: (tileMap.mapHeightTiles + 1) * (th / 2),
    };
  }
  return { w: tileMap.mapWidthTiles * tw, h: tileMap.mapHeightTiles * th };
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
  scene: SceneDocument | null,
  zoom: number,
  animTimeMs?: number,
  onInvalidate?: () => void,
  skipTiles = false,
  cameraPan?: { x: number; y: number },
) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);

  // Always draw the viewport grid as background
  if (!skipTiles) {
    drawViewportGrid(context, canvas.width, canvas.height, 16 * zoom, zoom);
  }

  if (!scene) return;

  const tileMapInstances = collectTileMapInstances(scene.root);
  if (!tileMapInstances.length) return;

  const { tileById, sliceById, sourceById, terrainSetsMap, animatedTileLookup, terrainTileToSetId } = getProjectMaps(project);

  for (const inst of tileMapInstances) {
    const tileMap = inst.data;
    const pxOffX = cameraPan ? cameraPan.x * (1 - inst.parallaxX) : 0;
    const pxOffY = cameraPan ? cameraPan.y * (1 - inst.parallaxY) : 0;
    const ox = inst.worldX * zoom + pxOffX;
    const oy = inst.worldY * zoom + pxOffY;
    const tileW = tileMap.tileWidth * zoom;
    const tileH = tileMap.tileHeight * zoom;

    const tmBounds = getTileMapPixelBounds(tileMap, zoom);

    if (!skipTiles) {
      context.fillStyle = "rgba(18,23,28,0.85)";
      context.fillRect(ox, oy, tmBounds.w, tmBounds.h);

      for (const chunk of Object.values(tileMap.chunks) as TileMapChunk[]) {
        for (let i = 0; i < chunk.tiles.length; i++) {
          const cell = chunk.tiles[i];
          if (!cell.tileId) continue;

          const localX = i % tileMap.chunkWidthTiles;
          const localY = Math.floor(i / tileMap.chunkWidthTiles);
          const x = chunk.chunkX * tileMap.chunkWidthTiles + localX;
          const y = chunk.chunkY * tileMap.chunkHeightTiles + localY;
          const tileScreen = tileToScreen(x, y, tileMap, zoom);
          const px = ox + tileScreen.x;
          const py = oy + tileScreen.y;

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
            const mask = calculateBlob47Mask(
              isTerrainAt(x, y - 1), isTerrainAt(x, y + 1), isTerrainAt(x - 1, y), isTerrainAt(x + 1, y),
              isTerrainAt(x - 1, y - 1), isTerrainAt(x + 1, y - 1), isTerrainAt(x - 1, y + 1), isTerrainAt(x + 1, y + 1),
            );
            const blobTileId = terrainSet.slots[mask] || getTerrainSetMarkerTileId(terrainSet);
            drawTileToCanvas(context, blobTileId, null, px, py, tileW, tileH, tileById, sliceById, sourceById, onInvalidate);
            continue;
          }

          if (terrainSet && (terrainSet.mode === "subtile" || terrainSet.mode === "rpgmaker")) {
            const isTerrainAt = (tx: number, ty: number) => {
              if (tx < 0 || ty < 0 || tx >= tileMap.mapWidthTiles || ty >= tileMap.mapHeightTiles) return false;
              return terrainTileToSetId.get(getTileAt(tileMap, tx, ty).tileId) === setId;
            };
            const n = isTerrainAt(x, y - 1), s = isTerrainAt(x, y + 1), w2 = isTerrainAt(x - 1, y), e = isTerrainAt(x + 1, y);
            const nw = isTerrainAt(x - 1, y - 1), ne = isTerrainAt(x + 1, y - 1), sw = isTerrainAt(x - 1, y + 1), se = isTerrainAt(x + 1, y + 1);
            const sub = (qi: number, n1: boolean, n2: boolean, diag: boolean, xo: number, yo: number) => {
              let st = 0;
              if (n1 && n2) st = diag ? 4 : 3; else if (n1) st = 1; else if (n2) st = 2;
              drawTileToCanvas(context, terrainSet.slots[qi * 5 + st] || 0, null, px + xo * tileW / 2, py + yo * tileH / 2, tileW / 2, tileH / 2, tileById, sliceById, sourceById, onInvalidate);
            };
            sub(0, n, w2, nw, 0, 0); sub(1, n, e, ne, 1, 0); sub(2, s, w2, sw, 0, 1); sub(3, s, e, se, 1, 1);
            continue;
          }

          drawTileToCanvas(context, cell.tileId, animSliceId, px, py, tileW, tileH, tileById, sliceById, sourceById, onInvalidate);
        }
      }
    }

    // Per-TileMap grid
    if (tileMap.projection === "orthogonal") {
      context.strokeStyle = "rgba(255,255,255,0.06)";
      context.lineWidth = 1;
      context.beginPath();
      for (let gx = 0; gx <= tileMap.mapWidthTiles; gx++) { context.moveTo(ox + gx * tileW, oy); context.lineTo(ox + gx * tileW, oy + tmBounds.h); }
      for (let gy = 0; gy <= tileMap.mapHeightTiles; gy++) { context.moveTo(ox, oy + gy * tileH); context.lineTo(ox + tmBounds.w, oy + gy * tileH); }
      context.stroke();

      context.strokeStyle = "rgba(255,200,90,0.2)";
      context.lineWidth = 1;
      context.beginPath();
      for (let gx = 0; gx <= tileMap.mapWidthTiles; gx += tileMap.chunkWidthTiles) { context.moveTo(ox + gx * tileW, oy); context.lineTo(ox + gx * tileW, oy + tmBounds.h); }
      for (let gy = 0; gy <= tileMap.mapHeightTiles; gy += tileMap.chunkHeightTiles) { context.moveTo(ox, oy + gy * tileH); context.lineTo(ox + tmBounds.w, oy + gy * tileH); }
      context.stroke();
    } else {
      context.strokeStyle = "rgba(255,255,255,0.06)";
      context.lineWidth = 1;
      context.beginPath();
      for (let gy = 0; gy <= tileMap.mapHeightTiles; gy++) {
        const left = tileToScreen(0, gy, tileMap, zoom);
        const right = tileToScreen(tileMap.mapWidthTiles, gy, tileMap, zoom);
        context.moveTo(ox + left.x, oy + left.y);
        context.lineTo(ox + right.x, oy + right.y);
      }
      for (let gx = 0; gx <= tileMap.mapWidthTiles; gx++) {
        const top = tileToScreen(gx, 0, tileMap, zoom);
        const bottom = tileToScreen(gx, tileMap.mapHeightTiles, tileMap, zoom);
        context.moveTo(ox + top.x, oy + top.y);
        context.lineTo(ox + bottom.x, oy + bottom.y);
      }
      context.stroke();
    }

    // TileMap boundary
    context.strokeStyle = "rgba(240, 197, 123, 0.5)";
    context.lineWidth = 2;
    context.strokeRect(ox, oy, tmBounds.w, tmBounds.h);
  }
}

function drawTileToCanvas(
  context: CanvasRenderingContext2D,
  tileId: number,
  animSliceId: string | null,
  px: number, py: number, w: number, h: number,
  tileById: Map<number, import("../../types").TilesetTileAsset>,
  sliceById: Map<string, import("../../types").SliceAsset>,
  sourceById: Map<string, import("../../types").SourceImageAsset>,
  onInvalidate?: () => void,
) {
  if (!tileId) return;
  const slice = animSliceId
    ? sliceById.get(animSliceId)
    : (() => { const a = tileById.get(tileId); return a ? sliceById.get(a.sliceId) : undefined; })();
  const source = slice ? sourceById.get(slice.sourceImageId) : undefined;
  const image = source ? getCachedRenderImage(source.id, source.dataUrl, onInvalidate) : null;
  if (!slice || !image?.complete || !image.naturalWidth) {
    context.fillStyle = "#37526a";
    context.fillRect(px, py, w, h);
    return;
  }
  context.drawImage(image, slice.sourceRect.x, slice.sourceRect.y, slice.sourceRect.width, slice.sourceRect.height, px, py, w, h);
}

function drawViewportGrid(context: CanvasRenderingContext2D, w: number, h: number, cellSize: number, _zoom: number) {
  context.fillStyle = "#0e1318";
  context.fillRect(0, 0, w, h);

  context.strokeStyle = "rgba(255,255,255,0.04)";
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= w; x += cellSize) {
    context.moveTo(x, 0);
    context.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += cellSize) {
    context.moveTo(0, y);
    context.lineTo(w, y);
  }
  context.stroke();

  // Major grid every 4 cells
  const majorSize = cellSize * 4;
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= w; x += majorSize) {
    context.moveTo(x, 0);
    context.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += majorSize) {
    context.moveTo(0, y);
    context.lineTo(w, y);
  }
  context.stroke();

  // Origin crosshair
  context.strokeStyle = "rgba(255,255,255,0.15)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(w / 2, 0);
  context.lineTo(w / 2, h);
  context.moveTo(0, h / 2);
  context.lineTo(w, h / 2);
  context.stroke();
}

export function renderSceneNodes(
  canvas: HTMLCanvasElement | null,
  project: ProjectDocument,
  scene: SceneDocument | null,
  selectedNodeId: string | null,
  zoom: number,
  onInvalidate?: () => void,
  cameraPan?: { x: number; y: number },
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
      const pxOff = cameraPan ? cameraPan.x * (1 - node.parallaxX) : 0;
      const pyOff = cameraPan ? cameraPan.y * (1 - node.parallaxY) : 0;
      const px = wt.x * zoom + pxOff;
      const py = wt.y * zoom + pyOff;

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
