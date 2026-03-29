import type { PointerEvent as ReactPointerEvent } from "react";
import { getTileAt } from "../../level/editor";
import { calculateBlob47Mask, getTerrainSetMarkerTileId } from "../../terrain";
import type { LevelDocument, LevelLayer, ProjectDocument, SliceRect, SourceImageAsset } from "../../types";

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

export function renderLevelCanvas(
  canvas: HTMLCanvasElement | null,
  project: ProjectDocument,
  level: LevelDocument | null,
  selectedLayer: LevelLayer | null,
  zoom: number,
) {
  if (!canvas || !level) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const tileW = level.tileWidth * zoom;
  const tileH = level.tileHeight * zoom;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#12171c";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  const tileById = new Map(project.tiles.map((entry) => [entry.tileId, entry]));
  const sliceById = new Map(project.slices.map((entry) => [entry.id, entry]));
  const sourceById = new Map(project.sourceImages.map((entry) => [entry.id, entry]));
  const terrainSetsMap = new Map(project.terrainSets.map((set) => [set.id, set]));
  const terrainTileToSetId = new Map<number, number>();
  project.terrainSets.forEach((set) => {
    Object.values(set.slots).forEach((tileId) => {
      if (tileId) {
        terrainTileToSetId.set(tileId, set.id);
      }
    });
  });

  for (const layer of level.layers) {
    if (!layer.visible || !layer.hasTiles) {
      continue;
    }
    for (let y = 0; y < layer.heightTiles; y += 1) {
      for (let x = 0; x < layer.widthTiles; x += 1) {
        const tile = getTileAt(level, layer, x, y);
        if (!tile.tileId) {
          continue;
        }
        const tileAsset = tileById.get(tile.tileId);
        const setId = terrainTileToSetId.get(tile.tileId);
        const terrainSet = setId !== undefined ? terrainSetsMap.get(setId) : null;

        if (terrainSet && terrainSet.mode === "blob47") {
          const isTerrainAt = (tx: number, ty: number) => {
            if (tx < 0 || ty < 0 || tx >= layer.widthTiles || ty >= layer.heightTiles) {
              return false;
            }
            const tid = getTileAt(level, layer, tx, ty).tileId;
            return terrainTileToSetId.get(tid) === setId;
          };
          const n = isTerrainAt(x, y - 1);
          const s = isTerrainAt(x, y + 1);
          const w = isTerrainAt(x - 1, y);
          const e = isTerrainAt(x + 1, y);
          const nw = isTerrainAt(x - 1, y - 1);
          const ne = isTerrainAt(x + 1, y - 1);
          const sw = isTerrainAt(x - 1, y + 1);
          const se = isTerrainAt(x + 1, y + 1);
          const mask = calculateBlob47Mask(n, s, w, e, nw, ne, sw, se);
          const blobTileId = terrainSet.slots[mask] || getTerrainSetMarkerTileId(terrainSet);
          const blobAsset = tileById.get(blobTileId);
          const blobSlice = blobAsset ? sliceById.get(blobAsset.sliceId) : null;
          const blobSource = blobSlice ? sourceById.get(blobSlice.sourceImageId) : null;
          const blobImage = blobSource ? getCachedRenderImage(blobSource.id, blobSource.dataUrl) : null;
          if (blobSlice && blobImage?.complete && blobImage.naturalWidth) {
            context.drawImage(
              blobImage,
              blobSlice.sourceRect.x,
              blobSlice.sourceRect.y,
              blobSlice.sourceRect.width,
              blobSlice.sourceRect.height,
              x * tileW,
              y * tileH,
              tileW,
              tileH,
            );
          } else {
            context.fillStyle = "#37526a";
            context.fillRect(x * tileW, y * tileH, tileW, tileH);
          }
          continue;
        }

        if (terrainSet && (terrainSet.mode === "subtile" || terrainSet.mode === "rpgmaker")) {
          const isTerrainAt = (tx: number, ty: number) => {
            if (tx < 0 || ty < 0 || tx >= layer.widthTiles || ty >= layer.heightTiles) {
              return false;
            }
            const tid = getTileAt(level, layer, tx, ty).tileId;
            return terrainTileToSetId.get(tid) === setId;
          };

          const n = isTerrainAt(x, y - 1);
          const s = isTerrainAt(x, y + 1);
          const w = isTerrainAt(x - 1, y);
          const e = isTerrainAt(x + 1, y);
          const nw = isTerrainAt(x - 1, y - 1);
          const ne = isTerrainAt(x + 1, y - 1);
          const sw = isTerrainAt(x - 1, y + 1);
          const se = isTerrainAt(x + 1, y + 1);

          const drawSubtile = (qIdx: number, n1: boolean, n2: boolean, diag: boolean, xOff: number, yOff: number) => {
            let state = 0;
            if (n1 && n2) {
              state = diag ? 4 : 3;
            } else if (n1) {
              state = 1;
            } else if (n2) {
              state = 2;
            }

            const qTileId = terrainSet.slots[qIdx * 5 + state];
            const qTile = qTileId ? tileById.get(qTileId) : null;
            const qSlice = qTile ? sliceById.get(qTile.sliceId) : null;
            const qSource = qSlice ? sourceById.get(qSlice.sourceImageId) : null;
            const qImage = qSource ? getCachedRenderImage(qSource.id, qSource.dataUrl) : null;

            if (qSlice && qImage?.complete && qImage.naturalWidth) {
              context.drawImage(
                qImage,
                qSlice.sourceRect.x,
                qSlice.sourceRect.y,
                qSlice.sourceRect.width,
                qSlice.sourceRect.height,
                x * tileW + (xOff * tileW) / 2,
                y * tileH + (yOff * tileH) / 2,
                tileW / 2,
                tileH / 2,
              );
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

        const slice = tileAsset ? sliceById.get(tileAsset.sliceId) : null;
        const source = slice ? sourceById.get(slice.sourceImageId) : null;
        const image = source ? getCachedRenderImage(source.id, source.dataUrl) : null;
        if (!tileAsset || !slice || !source || !image?.complete || !image.naturalWidth) {
          context.fillStyle = "#37526a";
          context.fillRect(x * tileW, y * tileH, tileW, tileH);
          continue;
        }
        context.drawImage(
          image,
          slice.sourceRect.x,
          slice.sourceRect.y,
          slice.sourceRect.width,
          slice.sourceRect.height,
          x * tileW,
          y * tileH,
          tileW,
          tileH,
        );
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
  for (let x = 0; x <= level.mapWidthTiles; x += 1) {
    context.beginPath();
    context.moveTo(x * tileW, 0);
    context.lineTo(x * tileW, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= level.mapHeightTiles; y += 1) {
    context.beginPath();
    context.moveTo(0, y * tileH);
    context.lineTo(canvas.width, y * tileH);
    context.stroke();
  }

  context.strokeStyle = "rgba(255,200,90,0.3)";
  context.lineWidth = 1.5;
  for (let x = 0; x <= level.mapWidthTiles; x += level.chunkWidthTiles) {
    context.beginPath();
    context.moveTo(x * tileW, 0);
    context.lineTo(x * tileW, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= level.mapHeightTiles; y += level.chunkHeightTiles) {
    context.beginPath();
    context.moveTo(0, y * tileH);
    context.lineTo(canvas.width, y * tileH);
    context.stroke();
  }

  if (selectedLayer) {
    context.strokeStyle = "rgba(88,171,255,0.75)";
    context.lineWidth = 2;
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  }
}

const renderImageCache = new Map<string, HTMLImageElement>();

function getCachedRenderImage(sourceId: string, dataUrl: string) {
  let image = renderImageCache.get(sourceId);
  if (!image) {
    image = new Image();
    image.src = dataUrl;
    renderImageCache.set(sourceId, image);
  }
  return image;
}
