import { useState, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  bucketFill,
  fillRect,
  getTileAt,
  paintBrush,
  paintTile,
  sampleBrushFromTileMap,
} from "../../level/editor";
import { calculateBlob47Mask, getTerrainSetMarkerTileId } from "../../terrain";
import type {
  AppState,
  ProjectAction,
  SceneDocument,
  SceneNode,
  TerrainSet,
  TileBrush,
  TileMapNodeData,
  TilesetTileAsset,
} from "../../types";
import { getCanvasTile } from "./canvas";
import { getWorldTransform } from "../../scene/helpers";

interface TileEditorParams {
  state: AppState;
  dispatch: React.Dispatch<ProjectAction>;
  scene: SceneDocument | null;
  selectedNode: SceneNode | null;
  tileMapData: TileMapNodeData | null;
  selectedTerrainSet: TerrainSet | null;
  selectedPaintTileId: number;
  setSelectedPaintTileId: (id: number) => void;
  pushRecentTile: (id: number) => void;
  tilePalette: TilesetTileAsset[];
  terrainTileToSetId: Map<number, number>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  strokeBaseRef: React.MutableRefObject<SceneNode | null>;
  strokeInProgressRef: React.MutableRefObject<boolean>;
}

export function useTileEditor({
  state,
  dispatch,
  scene,
  selectedNode,
  tileMapData,
  selectedTerrainSet,
  selectedPaintTileId,
  setSelectedPaintTileId,
  pushRecentTile,
  tilePalette,
  terrainTileToSetId,
  canvasRef,
  strokeBaseRef,
  strokeInProgressRef,
}: TileEditorParams) {
  const [clipboardBrush, setClipboardBrush] = useState<TileBrush | null>(null);
  const [levelDragStart, setLevelDragStart] = useState<{ x: number; y: number } | null>(null);
  const [rectDragCurrent, setRectDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [levelSelection, setLevelSelection] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [cursorTile, setCursorTile] = useState<{ x: number; y: number } | null>(null);

  function getSelectedTileMapOffset(): { x: number; y: number } {
    if (!scene || !selectedNode || selectedNode.data.type !== "TileMap") return { x: 0, y: 0 };
    const wt = getWorldTransform(scene.root, selectedNode.id);
    return { x: wt.x, y: wt.y };
  }

  function resolveTerrainTileId(tm: TileMapNodeData, tileX: number, tileY: number, terrainSet: TerrainSet): number {
    const isTerrainAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= tm.mapWidthTiles || y >= tm.mapHeightTiles) return false;
      return terrainTileToSetId.get(getTileAt(tm, x, y).tileId) === terrainSet.id;
    };
    if (terrainSet.mode === "subtile" || terrainSet.mode === "rpgmaker") return getTerrainSetMarkerTileId(terrainSet);
    const n = isTerrainAt(tileX, tileY - 1), s = isTerrainAt(tileX, tileY + 1);
    const w = isTerrainAt(tileX - 1, tileY), e = isTerrainAt(tileX + 1, tileY);
    if (terrainSet.mode === "blob47") {
      const mask = calculateBlob47Mask(n, s, w, e,
        isTerrainAt(tileX - 1, tileY - 1), isTerrainAt(tileX + 1, tileY - 1),
        isTerrainAt(tileX - 1, tileY + 1), isTerrainAt(tileX + 1, tileY + 1));
      return terrainSet.slots[mask] || getTerrainSetMarkerTileId(terrainSet);
    }
    let mask = 0;
    if (n) mask |= 1; if (s) mask |= 2; if (w) mask |= 4; if (e) mask |= 8;
    return terrainSet.slots[mask] || getTerrainSetMarkerTileId(terrainSet);
  }

  function applyTerrainBrush(tm: TileMapNodeData, tileX: number, tileY: number, terrainSet: TerrainSet): TileMapNodeData {
    let next = paintTile(tm, tileX, tileY, getTerrainSetMarkerTileId(terrainSet));
    for (let sy = tileY - 1; sy <= tileY + 1; sy++) {
      for (let sx = tileX - 1; sx <= tileX + 1; sx++) {
        if (sx < 0 || sy < 0 || sx >= tm.mapWidthTiles || sy >= tm.mapHeightTiles) continue;
        if (terrainTileToSetId.get(getTileAt(next, sx, sy).tileId) !== terrainSet.id) continue;
        next = paintTile(next, sx, sy, resolveTerrainTileId(next, sx, sy, terrainSet));
      }
    }
    return next;
  }

  function brushOrigin(point: { x: number; y: number }, brush: TileBrush | null) {
    if (!brush) return point;
    return { x: point.x - Math.floor(brush.width / 2), y: point.y - Math.floor(brush.height / 2) };
  }

  function resolveActiveBrush(): TileBrush | null {
    if (state.editor.activeBrushId === -1) return clipboardBrush;
    return (state.editor.savedBrushes ?? []).find((b) => b.id === state.editor.activeBrushId) ?? null;
  }

  function dispatchTileMapUpdate(nextData: TileMapNodeData, silent: boolean) {
    if (!scene || !selectedNode) return;
    dispatch({ type: silent ? "updateSceneNodeDataSilent" : "updateSceneNodeData", sceneId: scene.id, nodeId: selectedNode.id, data: nextData });
  }

  function handleCopy() {
    if (!tileMapData || !levelSelection) return;
    const { x0, y0, x1, y1 } = levelSelection;
    const sampled = sampleBrushFromTileMap(tileMapData, x0, y0, x1, y1);
    setClipboardBrush({ id: -1, name: "clipboard", width: Math.abs(x1 - x0) + 1, height: Math.abs(y1 - y0) + 1, tiles: sampled.tiles });
  }

  function handleCut() {
    if (!tileMapData || !levelSelection || !scene || !selectedNode) return;
    const { x0, y0, x1, y1 } = levelSelection;
    const sampled = sampleBrushFromTileMap(tileMapData, x0, y0, x1, y1);
    setClipboardBrush({ id: -1, name: "clipboard", width: Math.abs(x1 - x0) + 1, height: Math.abs(y1 - y0) + 1, tiles: sampled.tiles });
    dispatch({ type: "updateSceneNodeData", sceneId: scene.id, nodeId: selectedNode.id, data: fillRect(tileMapData, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), 0) });
    setLevelSelection(null);
  }

  function handlePaste() {
    if (!clipboardBrush) return;
    dispatch({ type: "setActiveBrush", brushId: -1 });
    dispatch({ type: "setLevelTool", tool: "brush" });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!tileMapData || !selectedNode) return false;
    const offset = getSelectedTileMapOffset();
    const point = getCanvasTile(event, canvasRef.current, tileMapData, state.editor.levelZoom, offset.x, offset.y);
    if (!point) return false;

    if (event.altKey) {
      const pickedTileId = getTileAt(tileMapData, point.x, point.y).tileId;
      if (pickedTileId) {
        setSelectedPaintTileId(pickedTileId);
        pushRecentTile(pickedTileId);
        dispatch({ type: "setLevelTool", tool: "brush" });
      }
      return true;
    }

    const paintTileId = selectedPaintTileId || tilePalette[0]?.tileId || 0;
    const activeBrush = resolveActiveBrush();
    const tool = state.editor.levelTool;

    if (tool === "brush") {
      strokeBaseRef.current = selectedNode;
      strokeInProgressRef.current = true;
      const origin = brushOrigin(point, activeBrush);
      dispatchTileMapUpdate(activeBrush ? paintBrush(tileMapData, origin.x, origin.y, activeBrush) : paintTile(tileMapData, point.x, point.y, paintTileId), true);
      return true;
    }
    if (tool === "terrain" && selectedTerrainSet) {
      strokeBaseRef.current = selectedNode;
      strokeInProgressRef.current = true;
      dispatchTileMapUpdate(applyTerrainBrush(tileMapData, point.x, point.y, selectedTerrainSet), true);
      return true;
    }
    if (tool === "erase") {
      strokeBaseRef.current = selectedNode;
      strokeInProgressRef.current = true;
      dispatchTileMapUpdate(paintTile(tileMapData, point.x, point.y, 0), true);
      return true;
    }
    if (tool === "bucket") {
      dispatchTileMapUpdate(bucketFill(tileMapData, point.x, point.y, paintTileId), false);
      return true;
    }
    if (tool === "select") { setLevelDragStart(point); setLevelSelection(null); return true; }
    if (tool === "rect") { setLevelDragStart(point); return true; }
    return false;
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!tileMapData) return;
    const offset = getSelectedTileMapOffset();
    const point = getCanvasTile(event, canvasRef.current, tileMapData, state.editor.levelZoom, offset.x, offset.y);
    if (!point) return;

    setCursorTile(point);
    const paintTileId = selectedPaintTileId || tilePalette[0]?.tileId || 0;
    const activeBrush = resolveActiveBrush();
    const tool = state.editor.levelTool;

    if (tool === "brush" && event.buttons === 1) {
      const origin = brushOrigin(point, activeBrush);
      dispatchTileMapUpdate(activeBrush ? paintBrush(tileMapData, origin.x, origin.y, activeBrush) : paintTile(tileMapData, point.x, point.y, paintTileId), true);
    }
    if (tool === "terrain" && event.buttons === 1 && selectedTerrainSet) {
      dispatchTileMapUpdate(applyTerrainBrush(tileMapData, point.x, point.y, selectedTerrainSet), true);
    }
    if (tool === "erase" && event.buttons === 1) {
      dispatchTileMapUpdate(paintTile(tileMapData, point.x, point.y, 0), true);
    }
    if (tool === "rect" || tool === "select") {
      setRectDragCurrent(point);
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!tileMapData || !levelDragStart) { setLevelDragStart(null); return; }
    const offset = getSelectedTileMapOffset();
    const point = getCanvasTile(event, canvasRef.current, tileMapData, state.editor.levelZoom, offset.x, offset.y);
    if (!point) { setLevelDragStart(null); return; }

    if (state.editor.levelTool === "select") {
      setLevelSelection({ x0: levelDragStart.x, y0: levelDragStart.y, x1: point.x, y1: point.y });
      setLevelDragStart(null); setRectDragCurrent(null);
      return;
    }
    if (state.editor.levelTool === "rect") {
      const paintTileId = selectedPaintTileId || tilePalette[0]?.tileId || 0;
      dispatchTileMapUpdate(fillRect(tileMapData, levelDragStart.x, levelDragStart.y, point.x, point.y, paintTileId), false);
    }
    setLevelDragStart(null); setRectDragCurrent(null);
  }

  function handlePointerLeave() { setCursorTile(null); }

  return {
    cursorTile,
    clipboardBrush,
    levelSelection,
    setLevelSelection,
    rectDragStart: levelDragStart,
    rectDragCurrent,
    handleCopy,
    handleCut,
    handlePaste,
    tilePointerDown: handlePointerDown,
    tilePointerMove: handlePointerMove,
    tilePointerUp: handlePointerUp,
    tilePointerLeave: handlePointerLeave,
  };
}
