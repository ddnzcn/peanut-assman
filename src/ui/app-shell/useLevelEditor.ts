import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type {
  AppState,
  ProjectAction,
  SceneDocument,
  SceneNode,
  TerrainSet,
  TileMapNodeData,
  TilesetTileAsset,
} from "../../types";
import { renderLevelCanvas, renderSceneNodes } from "./canvas";
import { renderTilesWebGL } from "./webglTileRenderer";
import { computeSceneBounds } from "../../scene/helpers";
import { useTileEditor } from "./useTileEditor";
import { useObjectEditor } from "./useObjectEditor";

interface LevelEditorParams {
  state: AppState;
  dispatch: React.Dispatch<ProjectAction>;
  scene: SceneDocument | null;
  selectedNode: SceneNode | null;
  tileMapData: TileMapNodeData | null;
  sceneTileMapData: TileMapNodeData | null;
  selectedTerrainSet: TerrainSet | null;
  selectedPaintTileId: number;
  setSelectedPaintTileId: (id: number) => void;
  pushRecentTile: (id: number) => void;
  tilePalette: TilesetTileAsset[];
  terrainTileToSetId: Map<number, number>;
  spaceHeld: boolean;
  levelPan: { x: number; y: number };
  setLevelPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

export function useLevelEditor({
  state,
  dispatch,
  scene,
  selectedNode,
  tileMapData,
  sceneTileMapData,
  selectedTerrainSet,
  selectedPaintTileId,
  setSelectedPaintTileId,
  pushRecentTile,
  tilePalette,
  terrainTileToSetId,
  spaceHeld,
  levelPan,
  setLevelPan,
}: LevelEditorParams) {
  const levelStageRef = useRef<HTMLDivElement | null>(null);
  const levelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokeBaseRef = useRef<SceneNode | null>(null);
  const strokeInProgressRef = useRef(false);
  const levelAnimRafRef = useRef<number | null>(null);
  const levelAnimStartRef = useRef<number | null>(null);
  const levelAnimTimeRef = useRef<number>(0);
  const levelRenderStateRef = useRef({ project: state.project, scene, selectedNodeId: state.editor.selectedNodeId, zoom: state.editor.levelZoom, pan: levelPan });

  useEffect(() => {
    levelRenderStateRef.current = { project: state.project, scene, selectedNodeId: state.editor.selectedNodeId, zoom: state.editor.levelZoom, pan: levelPan };
  }, [state.project, scene, state.editor.selectedNodeId, state.editor.levelZoom, levelPan]);

  const tileEditor = useTileEditor({
    state, dispatch, scene, selectedNode, tileMapData,
    selectedTerrainSet, selectedPaintTileId, setSelectedPaintTileId,
    pushRecentTile, tilePalette, terrainTileToSetId,
    canvasRef: levelCanvasRef, strokeBaseRef, strokeInProgressRef,
  });

  const objectEditor = useObjectEditor({
    state, dispatch, scene, selectedNode,
    canvasRef: levelCanvasRef,
  });

  // Static canvas render
  useEffect(() => {
    if (state.editor.workspace !== "level") return;
    if ((state.project.animatedTiles?.length ?? 0) > 0) return;
    let cancelled = false;
    const redraw = () => {
      if (cancelled) return;
      const useWebGL = !!webglCanvasRef.current && !!scene;
      if (useWebGL) renderTilesWebGL(webglCanvasRef.current!, state.project, scene!, state.editor.levelZoom);
      renderLevelCanvas(levelCanvasRef.current, state.project, scene, state.editor.levelZoom, undefined, () => requestAnimationFrame(redraw), useWebGL, levelPan);
      renderSceneNodes(levelCanvasRef.current, state.project, scene, state.editor.selectedNodeId, state.editor.levelZoom, undefined, levelPan);
    };
    redraw();
    const frameId = requestAnimationFrame(redraw);
    return () => { cancelled = true; cancelAnimationFrame(frameId); };
  }, [sceneTileMapData, scene, state.project, state.editor.levelZoom, state.editor.workspace, state.editor.selectedNodeId]);

  // RAF loop for animated tiles
  useEffect(() => {
    const hasAnimatedTiles = (state.project.animatedTiles?.length ?? 0) > 0;
    if (!hasAnimatedTiles || state.editor.workspace !== "level") {
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
      const { project, scene: s, selectedNodeId: selId, zoom, pan } = levelRenderStateRef.current;
      const useWebGL = !!webglCanvasRef.current && !!s;
      if (useWebGL) renderTilesWebGL(webglCanvasRef.current!, project, s!, zoom, levelAnimTimeRef.current);
      renderLevelCanvas(levelCanvasRef.current, project, s, zoom, levelAnimTimeRef.current, undefined, useWebGL, pan);
      renderSceneNodes(levelCanvasRef.current, project, s, selId, zoom, undefined, pan);
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

  // Center viewport on scene change and window resize (NOT on zoom — zoom adjusts pan itself)
  useEffect(() => {
    const stage = levelStageRef.current;
    if (!stage || state.editor.workspace !== "level") return;
    const centerViewport = () => {
      const bounds = scene ? computeSceneBounds(scene.root) : { width: 1024, height: 768 };
      const { zoom } = levelRenderStateRef.current;
      const vpW = bounds.width * zoom;
      const vpH = bounds.height * zoom;
      setLevelPan({ x: (stage.clientWidth - vpW) * 0.5, y: (stage.clientHeight - vpH) * 0.5 });
    };
    const initialFrame = requestAnimationFrame(() => { centerViewport(); requestAnimationFrame(centerViewport); });
    const resizeObserver = new ResizeObserver(centerViewport);
    resizeObserver.observe(stage);
    return () => { cancelAnimationFrame(initialFrame); resizeObserver.disconnect(); };
  }, [scene?.id, state.editor.workspace, setLevelPan]);

  // Composed pointer handlers
  function handleLevelPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!scene || spaceHeld || state.editor.levelTool === "hand" || event.button === 1) return;
    if (objectEditor.objectPointerDown(event)) return;
    tileEditor.tilePointerDown(event);
  }

  function handleLevelPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (objectEditor.objectPointerMove(event)) return;
    if (spaceHeld) return;
    tileEditor.tilePointerMove(event);
  }

  function handleLevelPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (objectEditor.objectPointerUp()) return;
    if (strokeInProgressRef.current && strokeBaseRef.current && scene && selectedNode) {
      dispatch({
        type: "commitSceneStroke",
        sceneId: scene.id,
        baseRoot: strokeBaseRef.current,
        currentRoot: (() => {
          const sceneDoc = state.project.scenes.find((s) => s.id === scene.id);
          return sceneDoc?.root ?? strokeBaseRef.current!;
        })(),
      });
      strokeInProgressRef.current = false;
      strokeBaseRef.current = null;
    }
    tileEditor.tilePointerUp(event);
  }

  function handleLevelPointerLeave() {
    tileEditor.tilePointerLeave();
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
    webglCanvasRef,
    levelAnimTimeRef,
    levelCursorClass,
    // From tile editor
    levelSelection: tileEditor.levelSelection,
    setLevelSelection: tileEditor.setLevelSelection,
    cursorTile: tileEditor.cursorTile,
    clipboardBrush: tileEditor.clipboardBrush,
    rectDragStart: tileEditor.rectDragStart,
    rectDragCurrent: tileEditor.rectDragCurrent,
    handleCopy: tileEditor.handleCopy,
    handleCut: tileEditor.handleCut,
    handlePaste: tileEditor.handlePaste,
    // From object editor
    objectPlaceType: objectEditor.objectPlaceType,
    setObjectPlaceType: objectEditor.setObjectPlaceType,
    // Composed handlers
    handleLevelPointerDown,
    handleLevelPointerMove,
    handleLevelPointerUp,
    handleLevelPointerLeave,
  };
}
