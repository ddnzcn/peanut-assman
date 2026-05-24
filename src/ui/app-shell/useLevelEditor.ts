import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  SceneNodeType,
  TerrainSet,
  TileBrush,
  TileMapNodeData,
  TilesetTileAsset,
} from "../../types";
import { getCanvasPixel, getCanvasTile, renderLevelCanvas, renderSceneNodes } from "./canvas";
import { createNode } from "../../scene/helpers";

interface LevelEditorParams {
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
  spaceHeld: boolean;
  setLevelPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

export function useLevelEditor({
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
  spaceHeld,
  setLevelPan,
}: LevelEditorParams) {
  const levelStageRef = useRef<HTMLDivElement | null>(null);
  const levelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokeBaseRef = useRef<SceneNode | null>(null);
  const strokeInProgressRef = useRef(false);
  const levelAnimRafRef = useRef<number | null>(null);
  const levelAnimStartRef = useRef<number | null>(null);
  const levelAnimTimeRef = useRef<number>(0);
  const levelRenderStateRef = useRef({ project: state.project, scene, tileMapData, selectedNodeId: state.editor.selectedNodeId, zoom: state.editor.levelZoom });

  const [cursorTile, setCursorTile] = useState<{ x: number; y: number } | null>(null);
  const [objectPlaceType, setObjectPlaceType] = useState<SceneNodeType>("Sprite");
  const [clipboardBrush, setClipboardBrush] = useState<TileBrush | null>(null);
  const [levelDragStart, setLevelDragStart] = useState<{ x: number; y: number } | null>(null);
  const [rectDragCurrent, setRectDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [levelSelection, setLevelSelection] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  useEffect(() => {
    levelRenderStateRef.current = { project: state.project, scene, tileMapData, selectedNodeId: state.editor.selectedNodeId, zoom: state.editor.levelZoom };
  }, [state.project, tileMapData, state.editor.levelZoom]);

  // Static canvas render
  useEffect(() => {
    if ((state.project.animatedTiles?.length ?? 0) > 0 && state.editor.workspace === "level") return;
    let cancelled = false;
    const redraw = () => {
      if (cancelled) return;
      renderLevelCanvas(levelCanvasRef.current, state.project, tileMapData, state.editor.levelZoom, undefined, () => {
        requestAnimationFrame(redraw);
      });
      renderSceneNodes(levelCanvasRef.current, state.project, scene, state.editor.selectedNodeId, state.editor.levelZoom);
    };
    redraw();
    const frameId = requestAnimationFrame(redraw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [tileMapData, state.project, state.editor.levelZoom, state.editor.workspace]);

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
      const { project, scene: s, tileMapData: tm, selectedNodeId: selId, zoom } = levelRenderStateRef.current;
      renderLevelCanvas(levelCanvasRef.current, project, tm, zoom, levelAnimTimeRef.current);
      renderSceneNodes(levelCanvasRef.current, project, s, selId, zoom);
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
  }, [(state.project.animatedTiles?.length ?? 0), state.editor.workspace]);

  // Center viewport
  useEffect(() => {
    const stage = levelStageRef.current;
    if (!stage || !tileMapData || state.editor.workspace !== "level") return;
    const centerViewport = () => {
      setLevelPan({
        x: (stage.clientWidth - tileMapData.mapWidthTiles * tileMapData.tileWidth * state.editor.levelZoom) * 0.5,
        y: (stage.clientHeight - tileMapData.mapHeightTiles * tileMapData.tileHeight * state.editor.levelZoom) * 0.5,
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
  }, [selectedNode?.id, state.editor.levelZoom, state.editor.workspace, setLevelPan]);

  function resolveTerrainTileId(
    tm: TileMapNodeData,
    tileX: number,
    tileY: number,
    terrainSet: TerrainSet,
  ): number {
    const isTerrainAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= tm.mapWidthTiles || y >= tm.mapHeightTiles) return false;
      return terrainTileToSetId.get(getTileAt(tm, x, y).tileId) === terrainSet.id;
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
    tm: TileMapNodeData,
    tileX: number,
    tileY: number,
    terrainSet: TerrainSet,
  ): TileMapNodeData {
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
    const action = silent ? "updateSceneNodeDataSilent" : "updateSceneNodeData";
    dispatch({ type: action, sceneId: scene.id, nodeId: selectedNode.id, data: nextData });
  }

  function handleCopy() {
    if (!tileMapData || !levelSelection) return;
    const { x0, y0, x1, y1 } = levelSelection;
    const sampled = sampleBrushFromTileMap(tileMapData, x0, y0, x1, y1);
    setClipboardBrush({
      id: -1,
      name: "clipboard",
      width: Math.abs(x1 - x0) + 1,
      height: Math.abs(y1 - y0) + 1,
      tiles: sampled.tiles,
    });
  }

  function handleCut() {
    if (!tileMapData || !levelSelection || !scene || !selectedNode) return;
    const { x0, y0, x1, y1 } = levelSelection;
    const sampled = sampleBrushFromTileMap(tileMapData, x0, y0, x1, y1);
    setClipboardBrush({
      id: -1,
      name: "clipboard",
      width: Math.abs(x1 - x0) + 1,
      height: Math.abs(y1 - y0) + 1,
      tiles: sampled.tiles,
    });
    const nextData = fillRect(tileMapData, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), 0);
    dispatch({ type: "updateSceneNodeData", sceneId: scene.id, nodeId: selectedNode.id, data: nextData });
    setLevelSelection(null);
  }

  function handlePaste() {
    if (!clipboardBrush) return;
    dispatch({ type: "setActiveBrush", brushId: -1 });
    dispatch({ type: "setLevelTool", tool: "brush" });
  }

  function handleLevelPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!scene || spaceHeld || state.editor.levelTool === "hand" || event.button === 1) return;

    if (state.editor.levelTool === "objectPlace") {
      const pixel = getCanvasPixel(event, levelCanvasRef.current, state.editor.levelZoom);
      if (!pixel) return;
      const parentId = selectedNode?.id ?? scene.root.id;
      const nodeId = `node-${state.project.idCounters.node}`;
      const node = createNode(objectPlaceType, objectPlaceType, nodeId);
      node.transform = { ...node.transform, x: pixel.x, y: pixel.y };
      dispatch({ type: "addChildNode", sceneId: scene.id, parentId, node });
      return;
    }

    if (!tileMapData || !selectedNode) return;
    const point = getCanvasTile(event, levelCanvasRef.current, tileMapData, state.editor.levelZoom);
    if (!point) return;

    if (event.altKey) {
      const pickedTileId = getTileAt(tileMapData, point.x, point.y).tileId;
      if (pickedTileId) {
        setSelectedPaintTileId(pickedTileId);
        pushRecentTile(pickedTileId);
        dispatch({ type: "setLevelTool", tool: "brush" });
      }
      return;
    }

    const paintTileId = selectedPaintTileId || tilePalette[0]?.tileId || 0;
    const activeBrush = resolveActiveBrush();

    if (state.editor.levelTool === "brush") {
      strokeBaseRef.current = selectedNode;
      strokeInProgressRef.current = true;
      const origin = brushOrigin(point, activeBrush);
      const nextData = activeBrush
        ? paintBrush(tileMapData, origin.x, origin.y, activeBrush)
        : paintTile(tileMapData, point.x, point.y, paintTileId);
      dispatchTileMapUpdate(nextData, true);
    } else if (state.editor.levelTool === "terrain" && selectedTerrainSet) {
      strokeBaseRef.current = selectedNode;
      strokeInProgressRef.current = true;
      dispatchTileMapUpdate(applyTerrainBrush(tileMapData, point.x, point.y, selectedTerrainSet), true);
    } else if (state.editor.levelTool === "erase") {
      strokeBaseRef.current = selectedNode;
      strokeInProgressRef.current = true;
      dispatchTileMapUpdate(paintTile(tileMapData, point.x, point.y, 0), true);
    } else if (state.editor.levelTool === "bucket") {
      dispatchTileMapUpdate(bucketFill(tileMapData, point.x, point.y, paintTileId), false);
    } else if (state.editor.levelTool === "select") {
      setLevelDragStart(point);
      setLevelSelection(null);
    } else if (state.editor.levelTool === "rect") {
      setLevelDragStart(point);
    }
  }

  function handleLevelPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!tileMapData || spaceHeld) return;
    const point = getCanvasTile(event, levelCanvasRef.current, tileMapData, state.editor.levelZoom);
    if (!point) return;

    setCursorTile(point);
    const paintTileId = selectedPaintTileId || tilePalette[0]?.tileId || 0;
    const activeBrush = resolveActiveBrush();

    if (state.editor.levelTool === "brush" && event.buttons === 1) {
      const origin = brushOrigin(point, activeBrush);
      const nextData = activeBrush
        ? paintBrush(tileMapData, origin.x, origin.y, activeBrush)
        : paintTile(tileMapData, point.x, point.y, paintTileId);
      dispatchTileMapUpdate(nextData, true);
    }
    if (state.editor.levelTool === "terrain" && event.buttons === 1 && selectedTerrainSet) {
      dispatchTileMapUpdate(applyTerrainBrush(tileMapData, point.x, point.y, selectedTerrainSet), true);
    }
    if (state.editor.levelTool === "erase" && event.buttons === 1) {
      dispatchTileMapUpdate(paintTile(tileMapData, point.x, point.y, 0), true);
    }
    if (state.editor.levelTool === "rect" || state.editor.levelTool === "select") {
      setRectDragCurrent(point);
    }
  }

  function handleLevelPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (strokeInProgressRef.current && strokeBaseRef.current && scene && selectedNode) {
      dispatch({
        type: "commitSceneStroke",
        sceneId: scene.id,
        baseRoot: strokeBaseRef.current.data.type === "TileMap"
          ? (() => {
              const sceneDoc = state.project.scenes.find((s) => s.id === scene.id);
              return strokeBaseRef.current as unknown as SceneNode;
            })()
          : strokeBaseRef.current,
        currentRoot: (() => {
          const sceneDoc = state.project.scenes.find((s) => s.id === scene.id);
          return sceneDoc?.root ?? strokeBaseRef.current!;
        })(),
      });
      strokeInProgressRef.current = false;
      strokeBaseRef.current = null;
    }
    if (!tileMapData || !levelDragStart) {
      setLevelDragStart(null);
      return;
    }
    const point = getCanvasTile(event, levelCanvasRef.current, tileMapData, state.editor.levelZoom);
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
    dispatchTileMapUpdate(
      fillRect(tileMapData, levelDragStart.x, levelDragStart.y, point.x, point.y, paintTileId),
      false,
    );
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
    : state.editor.levelTool === "rect" ? "cursor-rect"
    : state.editor.levelTool === "objectSelect" ? "cursor-default"
    : state.editor.levelTool === "objectPlace" ? "cursor-crosshair"
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
    objectPlaceType,
    setObjectPlaceType,
    handleCopy,
    handleCut,
    handlePaste,
  };
}
