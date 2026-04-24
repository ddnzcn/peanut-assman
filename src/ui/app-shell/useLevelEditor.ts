import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  addCollision,
  addMarker,
  bucketFill,
  buildMarker,
  fillRect,
  getTileAt,
  paintBrush,
  paintTile,
  sampleBrushFromLevel,
} from "../../level/editor";
import { calculateBlob47Mask, getTerrainSetMarkerTileId } from "../../terrain";
import type {
  AppState,
  CollisionObject,
  LevelDocument,
  LevelLayer,
  MarkerObject,
  ProjectAction,
  TerrainSet,
  TileBrush,
  TilesetTileAsset,
} from "../../types";
import { getCanvasTile } from "./canvas";
import { renderLevelCanvas } from "./canvas";

interface LevelEditorParams {
  state: AppState;
  dispatch: React.Dispatch<ProjectAction>;
  level: LevelDocument | null;
  layer: LevelLayer | null;
  selectedTerrainSet: TerrainSet | null;
  selectedPaintTileId: number;
  setSelectedPaintTileId: (id: number) => void;
  pushRecentTile: (id: number) => void;
  tilePalette: TilesetTileAsset[];
  terrainTileToSetId: Map<number, number>;
  spaceHeld: boolean;
  setLevelPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

export function useLevelEditor({
  state,
  dispatch,
  level,
  layer,
  selectedTerrainSet,
  selectedPaintTileId,
  setSelectedPaintTileId,
  pushRecentTile,
  tilePalette,
  terrainTileToSetId,
  spaceHeld,
  setLevelPan,
}: LevelEditorParams) {
  const levelStageRef = useRef<HTMLDivElement | null>(null);
  const levelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokeBaseRef = useRef<LevelDocument | null>(null);
  const strokeInProgressRef = useRef(false);
  const levelAnimRafRef = useRef<number | null>(null);
  const levelAnimStartRef = useRef<number | null>(null);
  const levelAnimTimeRef = useRef<number>(0);
  const levelRenderStateRef = useRef({ project: state.project, level, layer, zoom: state.editor.levelZoom });

  const [cursorTile, setCursorTile] = useState<{ x: number; y: number } | null>(null);
  const [clipboardBrush, setClipboardBrush] = useState<TileBrush | null>(null);
  const [levelDragStart, setLevelDragStart] = useState<{ x: number; y: number } | null>(null);
  const [rectDragCurrent, setRectDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [levelSelection, setLevelSelection] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  // Keep render state ref fresh for the RAF loop (avoids stale closures)
  useEffect(() => {
    levelRenderStateRef.current = { project: state.project, level, layer, zoom: state.editor.levelZoom };
  }, [state.project, level, layer, state.editor.levelZoom]);

  // Static canvas render — skipped when the animated-tile RAF loop is running
  useEffect(() => {
    if ((state.project.animatedTiles?.length ?? 0) > 0 && state.editor.workspace === "level") {
      return;
    }
    let cancelled = false;
    const redraw = () => {
      if (cancelled) return;
      renderLevelCanvas(levelCanvasRef.current, state.project, level, layer, state.editor.levelZoom, undefined, () => {
        requestAnimationFrame(redraw);
      });
    };
    redraw();
    const frameId = requestAnimationFrame(redraw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [level, layer, state.project, state.editor.levelZoom, state.editor.workspace]);

  // RAF loop for animated tiles
  useEffect(() => {
    const hasAnimatedTiles = (state.project.animatedTiles?.length ?? 0) > 0;
    const isLevel = state.editor.workspace === "level";
    if (!hasAnimatedTiles || !isLevel) {
      if (levelAnimRafRef.current !== null) {
        cancelAnimationFrame(levelAnimRafRef.current);
        levelAnimRafRef.current = null;
        levelAnimStartRef.current = null;
      }
      return;
    }
    const tick = (now: number) => {
      if (levelAnimStartRef.current === null) levelAnimStartRef.current = now;
      levelAnimTimeRef.current = now - levelAnimStartRef.current;
      const { project, level: l, layer: la, zoom } = levelRenderStateRef.current;
      renderLevelCanvas(levelCanvasRef.current, project, l, la, zoom, levelAnimTimeRef.current);
      levelAnimRafRef.current = requestAnimationFrame(tick);
    };
    levelAnimRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (levelAnimRafRef.current !== null) {
        cancelAnimationFrame(levelAnimRafRef.current);
        levelAnimRafRef.current = null;
        levelAnimStartRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(state.project.animatedTiles?.length ?? 0), state.editor.workspace]);

  // Center level in viewport on level/zoom/workspace change
  useEffect(() => {
    const stage = levelStageRef.current;
    if (!stage || !level || state.editor.workspace !== "level") return;
    const centerViewport = () => {
      setLevelPan({
        x: (stage.clientWidth - level.mapWidthTiles * level.tileWidth * state.editor.levelZoom) * 0.5,
        y: (stage.clientHeight - level.mapHeightTiles * level.tileHeight * state.editor.levelZoom) * 0.5,
      });
    };
    const initialFrame = requestAnimationFrame(() => {
      centerViewport();
      requestAnimationFrame(centerViewport);
    });
    const resizeObserver = new ResizeObserver(centerViewport);
    resizeObserver.observe(stage);
    return () => {
      cancelAnimationFrame(initialFrame);
      resizeObserver.disconnect();
    };
  }, [level?.id, state.editor.levelZoom, state.editor.workspace, setLevelPan]);

  // --- Terrain helpers ---

  function resolveTerrainTileId(
    levelDoc: LevelDocument,
    levelLayer: LevelLayer,
    tileX: number,
    tileY: number,
    terrainSet: TerrainSet,
  ): number {
    const isTerrainAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= levelLayer.widthTiles || y >= levelLayer.heightTiles) return false;
      return terrainTileToSetId.get(getTileAt(levelDoc, levelLayer, x, y).tileId) === terrainSet.id;
    };
    if (terrainSet.mode === "subtile" || terrainSet.mode === "rpgmaker") {
      return getTerrainSetMarkerTileId(terrainSet);
    }
    const n = isTerrainAt(tileX, tileY - 1);
    const s = isTerrainAt(tileX, tileY + 1);
    const w = isTerrainAt(tileX - 1, tileY);
    const e = isTerrainAt(tileX + 1, tileY);
    if (terrainSet.mode === "blob47") {
      const blobMask = calculateBlob47Mask(
        n, s, w, e,
        isTerrainAt(tileX - 1, tileY - 1),
        isTerrainAt(tileX + 1, tileY - 1),
        isTerrainAt(tileX - 1, tileY + 1),
        isTerrainAt(tileX + 1, tileY + 1),
      );
      return terrainSet.slots[blobMask] || getTerrainSetMarkerTileId(terrainSet);
    }
    let mask = 0;
    if (n) mask |= 1;
    if (s) mask |= 2;
    if (w) mask |= 4;
    if (e) mask |= 8;
    return terrainSet.slots[mask] || getTerrainSetMarkerTileId(terrainSet);
  }

  function applyTerrainBrush(
    levelDoc: LevelDocument,
    levelLayer: LevelLayer,
    tileX: number,
    tileY: number,
    terrainSet: TerrainSet,
  ): LevelDocument {
    let next = paintTile(levelDoc, levelLayer, tileX, tileY, getTerrainSetMarkerTileId(terrainSet));
    for (let sy = tileY - 1; sy <= tileY + 1; sy++) {
      for (let sx = tileX - 1; sx <= tileX + 1; sx++) {
        if (sx < 0 || sy < 0 || sx >= levelLayer.widthTiles || sy >= levelLayer.heightTiles) continue;
        if (terrainTileToSetId.get(getTileAt(next, levelLayer, sx, sy).tileId) !== terrainSet.id) continue;
        next = paintTile(next, levelLayer, sx, sy, resolveTerrainTileId(next, levelLayer, sx, sy, terrainSet));
      }
    }
    return next;
  }

  // --- Brush helpers ---

  function brushOrigin(point: { x: number; y: number }, brush: TileBrush | null) {
    if (!brush) return point;
    return { x: point.x - Math.floor(brush.width / 2), y: point.y - Math.floor(brush.height / 2) };
  }

  function resolveActiveBrush(): TileBrush | null {
    if (state.editor.activeBrushId === -1) return clipboardBrush;
    return (state.editor.savedBrushes ?? []).find((b) => b.id === state.editor.activeBrushId) ?? null;
  }

  // --- Clipboard ---

  function handleCopy() {
    if (!level || !layer || !levelSelection) return;
    const { x0, y0, x1, y1 } = levelSelection;
    const sampled = sampleBrushFromLevel(level, layer, x0, y0, x1, y1);
    setClipboardBrush({
      id: -1,
      name: "clipboard",
      width: Math.abs(x1 - x0) + 1,
      height: Math.abs(y1 - y0) + 1,
      tiles: sampled.tiles,
    });
  }

  function handleCut() {
    if (!level || !layer || !levelSelection) return;
    const { x0, y0, x1, y1 } = levelSelection;
    const sampled = sampleBrushFromLevel(level, layer, x0, y0, x1, y1);
    setClipboardBrush({
      id: -1,
      name: "clipboard",
      width: Math.abs(x1 - x0) + 1,
      height: Math.abs(y1 - y0) + 1,
      tiles: sampled.tiles,
    });
    dispatch({
      type: "updateLevel",
      level: fillRect(level, layer, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), 0),
    });
    setLevelSelection(null);
  }

  function handlePaste() {
    if (!clipboardBrush) return;
    dispatch({ type: "setActiveBrush", brushId: -1 });
    dispatch({ type: "setLevelTool", tool: "brush" });
  }

  // --- Pointer events ---

  function handleLevelPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!level || !layer || spaceHeld || state.editor.levelTool === "hand" || event.button === 1) return;
    const point = getCanvasTile(event, levelCanvasRef.current, level, state.editor.levelZoom);
    if (!point) return;

    if (event.altKey && layer.hasTiles) {
      const pickedTileId = getTileAt(level, layer, point.x, point.y).tileId;
      if (pickedTileId) {
        setSelectedPaintTileId(pickedTileId);
        pushRecentTile(pickedTileId);
        dispatch({ type: "setLevelTool", tool: "brush" });
      }
      return;
    }

    const paintTileId = selectedPaintTileId || tilePalette[0]?.tileId || 0;
    const activeBrush = resolveActiveBrush();

    if (layer.hasTiles && state.editor.levelTool === "brush") {
      strokeBaseRef.current = level;
      strokeInProgressRef.current = true;
      const origin = brushOrigin(point, activeBrush);
      dispatch({
        type: "updateLevelSilent",
        level: activeBrush
          ? paintBrush(level, layer, origin.x, origin.y, activeBrush)
          : paintTile(level, layer, point.x, point.y, paintTileId),
      });
    } else if (layer.hasTiles && state.editor.levelTool === "terrain" && selectedTerrainSet) {
      strokeBaseRef.current = level;
      strokeInProgressRef.current = true;
      dispatch({ type: "updateLevelSilent", level: applyTerrainBrush(level, layer, point.x, point.y, selectedTerrainSet) });
    } else if (layer.hasTiles && state.editor.levelTool === "erase") {
      strokeBaseRef.current = level;
      strokeInProgressRef.current = true;
      dispatch({ type: "updateLevelSilent", level: paintTile(level, layer, point.x, point.y, 0) });
    } else if (layer.hasTiles && state.editor.levelTool === "bucket") {
      dispatch({ type: "updateLevel", level: bucketFill(level, layer, point.x, point.y, paintTileId) });
    } else if (layer.hasTiles && state.editor.levelTool === "select") {
      setLevelDragStart(point);
      setLevelSelection(null);
    } else if (layer.hasTiles && state.editor.levelTool === "rect") {
      setLevelDragStart(point);
    } else if (layer.hasCollision && state.editor.levelTool === "collisionRect") {
      const collision: CollisionObject = {
        id: state.project.idCounters.collision,
        layerId: layer.id,
        type: "Solid",
        flags: 4,
        x: point.x * level.tileWidth,
        y: point.y * level.tileHeight,
        w: level.tileWidth,
        h: level.tileHeight,
        userData0: 0,
        userData1: 0,
      };
      dispatch({ type: "updateLevel", level: addCollision(level, collision) });
    } else if (layer.hasMarkers && (state.editor.levelTool === "markerPoint" || state.editor.levelTool === "markerRect")) {
      const marker: MarkerObject = buildMarker(
        state.project.idCounters.marker,
        layer.id,
        state.editor.levelTool === "markerPoint" ? "Point" : "Rect",
        point.x,
        point.y,
        level.tileWidth,
        level.tileHeight,
      );
      dispatch({ type: "updateLevel", level: addMarker(level, marker) });
    }
  }

  function handleLevelPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!level || !layer || !layer.hasTiles || spaceHeld) return;
    const point = getCanvasTile(event, levelCanvasRef.current, level, state.editor.levelZoom);
    if (!point) return;

    setCursorTile(point);
    const paintTileId = selectedPaintTileId || tilePalette[0]?.tileId || 0;
    const activeBrush = resolveActiveBrush();

    if (state.editor.levelTool === "brush" && event.buttons === 1) {
      const origin = brushOrigin(point, activeBrush);
      dispatch({
        type: "updateLevelSilent",
        level: activeBrush
          ? paintBrush(level, layer, origin.x, origin.y, activeBrush)
          : paintTile(level, layer, point.x, point.y, paintTileId),
      });
    }
    if (state.editor.levelTool === "terrain" && event.buttons === 1 && selectedTerrainSet) {
      dispatch({ type: "updateLevelSilent", level: applyTerrainBrush(level, layer, point.x, point.y, selectedTerrainSet) });
    }
    if (state.editor.levelTool === "erase" && event.buttons === 1) {
      dispatch({ type: "updateLevelSilent", level: paintTile(level, layer, point.x, point.y, 0) });
    }
    if (state.editor.levelTool === "rect" || state.editor.levelTool === "select") {
      setRectDragCurrent(point);
    }
  }

  function handleLevelPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (strokeInProgressRef.current && strokeBaseRef.current && level) {
      dispatch({ type: "commitLevelStroke", baseLevel: strokeBaseRef.current, currentLevel: level });
      strokeInProgressRef.current = false;
      strokeBaseRef.current = null;
    }
    if (!level || !layer || !levelDragStart || !layer.hasTiles) {
      setLevelDragStart(null);
      return;
    }
    const point = getCanvasTile(event, levelCanvasRef.current, level, state.editor.levelZoom);
    if (!point) {
      setLevelDragStart(null);
      return;
    }
    if (state.editor.levelTool === "select") {
      setLevelSelection({ x0: levelDragStart.x, y0: levelDragStart.y, x1: point.x, y1: point.y });
      setLevelDragStart(null);
      setRectDragCurrent(null);
      return;
    }
    if (state.editor.levelTool !== "rect") {
      setLevelDragStart(null);
      return;
    }
    const paintTileId = selectedPaintTileId || tilePalette[0]?.tileId || 0;
    dispatch({
      type: "updateLevel",
      level: fillRect(level, layer, levelDragStart.x, levelDragStart.y, point.x, point.y, paintTileId),
    });
    setLevelDragStart(null);
    setRectDragCurrent(null);
  }

  function handleLevelPointerLeave() {
    setCursorTile(null);
  }

  const levelCursorClass =
    state.editor.levelTool === "hand" ? "cursor-hand"
    : state.editor.levelTool === "erase" ? "cursor-erase"
    : state.editor.levelTool === "terrain" ? "cursor-brush"
    : state.editor.levelTool === "collisionRect" ? "cursor-collision"
    : (state.editor.levelTool === "markerPoint" || state.editor.levelTool === "markerRect") ? "cursor-marker"
    : state.editor.levelTool === "rect" ? "cursor-rect"
    : "cursor-brush";

  return {
    levelStageRef,
    levelCanvasRef,
    levelAnimTimeRef,
    levelSelection,
    setLevelSelection,
    cursorTile,
    clipboardBrush,
    rectDragStart: levelDragStart,
    rectDragCurrent,
    levelCursorClass,
    handleLevelPointerDown,
    handleLevelPointerMove,
    handleLevelPointerUp,
    handleLevelPointerLeave,
    handleCopy,
    handleCut,
    handlePaste,
  };
}
