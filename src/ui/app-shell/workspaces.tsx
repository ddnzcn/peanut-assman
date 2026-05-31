import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject, WheelEvent as ReactWheelEvent } from "react";
import type {
  ManualSliceRect,
  ProjectAction,
  PackedAtlas,
  SceneDocument,
  SceneNode,
  SliceKind,
  SliceRect,
  SourceImageAsset,
  TileMapNodeData,
} from "../../types";
import type { SlicerCanvasTool } from "./constants";
import { rectStyle } from "./canvas";
import { computeSceneBounds, getWorldTransform } from "../../scene/helpers";

interface SlicerSurfaceProps {
  source: SourceImageAsset | null;
  zoom: number;
  pan: { x: number; y: number };
  gridPreview: Array<{ name: string; rect: SliceRect }>;
  manualRects: ManualSliceRect[];
  selectedManualRectIndex: number | null;
  slicerCanvasTool: SlicerCanvasTool;
  manualKind: SliceKind;
  dragRect: SliceRect | null;
  stageRef: RefObject<HTMLDivElement>;
  canvasRef: RefObject<HTMLDivElement>;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onStagePanStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePanMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePanEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerUp: () => void;
  onManualRectSelect: (index: number) => void;
}

function SlicerSurface(props: SlicerSurfaceProps) {
  if (!props.source) {
    return <div className="empty-state">Import a PNG to begin slicing.</div>;
  }
  return (
    <div
      ref={props.stageRef}
      className={`slicer-stage viewport-stage ${props.slicerCanvasTool === "move" ? "cursor-hand" : "cursor-slicer"}`}
      onWheel={props.onWheel}
      onPointerDown={props.onStagePanStart}
      onPointerMove={props.onStagePanMove}
      onPointerUp={props.onStagePanEnd}
    >
      <div className="viewport-inner">
        <div className="viewport-camera" style={{ transform: `translate(${props.pan.x}px, ${props.pan.y}px)`, position: "relative" }}>
          <div
            ref={props.canvasRef}
            className="slicer-canvas"
            style={{ width: props.source.width * props.zoom, height: props.source.height * props.zoom, position: "relative" }}
            onPointerDown={props.onCanvasPointerDown}
            onPointerMove={props.onCanvasPointerMove}
            onPointerUp={props.onCanvasPointerUp}
          >
            <img
              src={props.source.dataUrl}
              alt={props.source.fileName}
              style={{ width: "100%", height: "100%", imageRendering: "pixelated", display: "block", pointerEvents: "none" }}
              draggable={false}
            />
            {props.gridPreview.map((entry, index) => (
              <div
                key={`${entry.name}-${entry.rect.x}-${entry.rect.y}`}
                className="slice-outline"
                style={rectStyle(entry.rect, props.zoom)}
              >
                <span>{entry.name}</span>
              </div>
            ))}
            {props.manualRects.map((entry, index) => (
              <div
                key={index}
                className={`slice-outline${index === props.selectedManualRectIndex ? " selected" : ""}`}
                style={rectStyle(entry, props.zoom)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  props.onManualRectSelect(index);
                }}
              >
                <span>{entry.name}</span>
              </div>
            ))}
            {props.dragRect && (
              <div className="slice-outline pending" style={rectStyle(props.dragRect, props.zoom)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PackPreview(props: {
  atlas: PackedAtlas | null;
  zoom: number;
  pan: { x: number; y: number };
  stageRef: RefObject<HTMLDivElement>;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onPanStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPanMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPanEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  if (!props.atlas || !props.atlas.pages.length) {
    return (
      <div className="empty-state">
        <p>No atlas built yet.</p>
        <p>Import images and create slices first.</p>
      </div>
    );
  }
  return (
    <div
      ref={props.stageRef}
      className="atlas-pack-stage viewport-stage"
      onWheel={props.onWheel}
      onPointerDown={props.onPanStart}
      onPointerMove={props.onPanMove}
      onPointerUp={props.onPanEnd}
    >
      <div className="viewport-inner">
        <div className="viewport-camera" style={{ transform: `translate(${props.pan.x}px, ${props.pan.y}px)` }}>
          <div style={{ display: "flex", gap: 16, padding: 16, flexWrap: "wrap" }}>
            {props.atlas.pages.map((page) => (
              <div key={page.index} className="pack-page" style={{ width: page.width * props.zoom, height: page.height * props.zoom }}>
                <img
                  src={page.blobUrl}
                  alt={`page ${page.index}`}
                  style={{ width: "100%", height: "100%", imageRendering: "pixelated", display: "block" }}
                  draggable={false}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface AtlasWorkspaceProps {
  atlas: PackedAtlas | null;
  module: "slicer" | "pack";
  source: SourceImageAsset | null;
  gridOptions: import("../../types").GridSliceOptions;
  setGridOptions: React.Dispatch<React.SetStateAction<import("../../types").GridSliceOptions>>;
  gridPreview: Array<{ name: string; rect: SliceRect }>;
  manualRects: ManualSliceRect[];
  selectedManualRectIndex: number | null;
  slicerCanvasTool: SlicerCanvasTool;
  manualKind: SliceKind;
  manualDraft: ManualSliceRect;
  setManualKind: (kind: SliceKind) => void;
  dragRect: SliceRect | null;
  slicerZoom: number;
  slicerPan: { x: number; y: number };
  packZoom: number;
  packPan: { x: number; y: number };
  packStageRef: RefObject<HTMLDivElement>;
  canvasRef: RefObject<HTMLDivElement>;
  stageRef: RefObject<HTMLDivElement>;
  onCreateSlices: () => void;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onPackWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onPackPanStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPackPanMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPackPanEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePanStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePanMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePanEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerUp: () => void;
  onManualRectSelect: (index: number) => void;
}

export function AtlasWorkspace(props: AtlasWorkspaceProps) {
  return (
    <div className="workspace-content atlas-workspace" style={{ gridTemplateRows: "1fr" }}>
      {props.module === "slicer" ? (
        <SlicerSurface
          source={props.source}
          zoom={props.slicerZoom}
          pan={props.slicerPan}
          gridPreview={props.gridPreview}
          manualRects={props.manualRects}
          selectedManualRectIndex={props.selectedManualRectIndex}
          slicerCanvasTool={props.slicerCanvasTool}
          manualKind={props.manualKind}
          dragRect={props.dragRect}
          stageRef={props.stageRef}
          canvasRef={props.canvasRef}
          onWheel={props.onWheel}
          onStagePanStart={props.onStagePanStart}
          onStagePanMove={props.onStagePanMove}
          onStagePanEnd={props.onStagePanEnd}
          onCanvasPointerDown={props.onCanvasPointerDown}
          onCanvasPointerMove={props.onCanvasPointerMove}
          onCanvasPointerUp={props.onCanvasPointerUp}
          onManualRectSelect={props.onManualRectSelect}
        />
      ) : (
        <PackPreview
          atlas={props.atlas}
          zoom={props.packZoom}
          pan={props.packPan}
          stageRef={props.packStageRef}
          onWheel={props.onPackWheel}
          onPanStart={props.onPackPanStart}
          onPanMove={props.onPackPanMove}
          onPanEnd={props.onPackPanEnd}
        />
      )}
    </div>
  );
}

const DEFAULT_VIEWPORT_W = 1024;
const DEFAULT_VIEWPORT_H = 768;

function getNodeBounds(node: SceneNode): { w: number; h: number } {
  if (node.data.type === "CollisionShape") return { w: node.data.width, h: node.data.height };
  if (node.data.type === "Area") return { w: node.data.shape === "point" ? 10 : node.data.width, h: node.data.shape === "point" ? 10 : node.data.height };
  if (node.data.type === "Light2D") return { w: node.data.radius * 2, h: node.data.radius * 2 };
  if (node.data.type === "TileMap") return { w: node.data.mapWidthTiles * node.data.tileWidth, h: node.data.mapHeightTiles * node.data.tileHeight };
  if (node.data.type === "VisibilityNotifier") return { w: node.data.width, h: node.data.height };
  if (node.data.type === "Path2D" || node.data.type === "NavRegion2D") {
    const pts = node.data.points;
    if (!pts.length) return { w: 16, h: 16 };
    let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
    for (const p of pts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    return { w: Math.max(16, maxX - minX), h: Math.max(16, maxY - minY) };
  }
  return { w: 16, h: 16 };
}

export function LevelWorkspace(props: {
  tileMapData: TileMapNodeData | null;
  sceneTileMapData: TileMapNodeData | null;
  scene: SceneDocument | null;
  selectedNode: SceneNode | null;
  levelZoom: number;
  levelPan: { x: number; y: number };
  cursorClass: string;
  levelCanvasRef: RefObject<HTMLCanvasElement>;
  webglCanvasRef: RefObject<HTMLCanvasElement>;
  stageRef: RefObject<HTMLDivElement>;
  rectDragStart: { x: number; y: number } | null;
  rectDragCurrent: { x: number; y: number } | null;
  levelSelection: { x0: number; y0: number; x1: number; y1: number } | null;
  levelTool: string;
  cursorTile: { x: number; y: number } | null;
  cursorBrushWidth: number;
  cursorBrushHeight: number;
  cursorIsErase: boolean;
  hasClipboard: boolean;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerLeave: () => void;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onStagePanStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePanMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePanEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  dispatch: React.Dispatch<ProjectAction>;
}) {
  const { tileMapData, sceneTileMapData, scene, selectedNode, rectDragStart: rds, rectDragCurrent: rdc, levelZoom: zoom } = props;

  const sceneBounds = scene ? computeSceneBounds(scene.root) : { width: DEFAULT_VIEWPORT_W, height: DEFAULT_VIEWPORT_H };
  const canvasW = sceneBounds.width * zoom;
  const canvasH = sceneBounds.height * zoom;

  const tileW = tileMapData ? tileMapData.tileWidth * zoom : 16 * zoom;
  const tileH = tileMapData ? tileMapData.tileHeight * zoom : 16 * zoom;

  let rectOverlay: React.CSSProperties | null = null;
  if (tileMapData && rds && rdc) {
    const x1 = Math.min(rds.x, rdc.x);
    const y1 = Math.min(rds.y, rdc.y);
    const x2 = Math.max(rds.x, rdc.x);
    const y2 = Math.max(rds.y, rdc.y);
    rectOverlay = {
      position: "absolute",
      left: x1 * tileW,
      top: y1 * tileH,
      width: (x2 - x1 + 1) * tileW,
      height: (y2 - y1 + 1) * tileH,
      border: "2px solid rgba(255, 200, 106, 0.9)",
      background: "rgba(255, 200, 106, 0.12)",
      pointerEvents: "none",
      boxSizing: "border-box",
    };
  }

  let selectionOverlay: React.CSSProperties | null = null;
  const sel = props.levelSelection;
  if (tileMapData && sel && props.levelTool === "select" && !rds) {
    const x1 = Math.min(sel.x0, sel.x1);
    const y1 = Math.min(sel.y0, sel.y1);
    const x2 = Math.max(sel.x0, sel.x1);
    const y2 = Math.max(sel.y0, sel.y1);
    selectionOverlay = {
      position: "absolute",
      left: x1 * tileW,
      top: y1 * tileH,
      width: (x2 - x1 + 1) * tileW,
      height: (y2 - y1 + 1) * tileH,
      border: "2px dashed rgba(255, 200, 106, 0.85)",
      background: "rgba(255, 200, 106, 0.08)",
      pointerEvents: "none",
      boxSizing: "border-box",
    };
  }

  let cursorOverlay: React.CSSProperties | null = null;
  const ct = props.cursorTile;
  if (tileMapData && ct && (props.levelTool === "brush" || props.levelTool === "erase")) {
    const w = props.cursorBrushWidth;
    const h = props.cursorBrushHeight;
    const originX = props.cursorBrushWidth > 1 ? ct.x - Math.floor(w / 2) : ct.x;
    const originY = props.cursorBrushHeight > 1 ? ct.y - Math.floor(h / 2) : ct.y;
    cursorOverlay = {
      position: "absolute",
      left: originX * tileW,
      top: originY * tileH,
      width: w * tileW,
      height: h * tileH,
      border: props.cursorIsErase
        ? "2px solid rgba(255, 80, 80, 0.8)"
        : "2px solid rgba(255, 255, 255, 0.6)",
      background: props.cursorIsErase
        ? "rgba(255, 80, 80, 0.18)"
        : "rgba(255, 255, 255, 0.12)",
      pointerEvents: "none",
      boxSizing: "border-box",
    };
  }

  // Gizmo resize state
  type HandleEdge = "right" | "bottom" | "corner";
  const resizeDragRef = useRef<{ edge: HandleEdge; startX: number; startY: number; origW: number; origH: number } | null>(null);

  // Gizmo rotation state
  const rotationDragRef = useRef<{ centerX: number; centerY: number; startAngle: number; origRotation: number } | null>(null);
  const gizmoContainerRef = useRef<HTMLDivElement>(null);

  // Polyline point editor state
  const polyDragRef = useRef<{ pointIndex: number; startClientX: number; startClientY: number; origX: number; origY: number } | null>(null);

  function onPolyHandlePointerDown(e: React.PointerEvent, pointIndex: number, origX: number, origY: number) {
    if (!selectedNode || !scene) return;
    if (e.altKey) {
      // Remove point (enforce minimums)
      e.stopPropagation();
      e.preventDefault();
      const d = selectedNode.data;
      if (d.type === "Path2D" || d.type === "NavRegion2D") {
        const min = d.type === "NavRegion2D" ? 3 : 2;
        if (d.points.length <= min) return;
        const nextPoints = d.points.filter((_, i) => i !== pointIndex);
        props.dispatch({ type: "updateSceneNodeData", sceneId: scene.id, nodeId: selectedNode.id, data: { ...d, points: nextPoints } });
      }
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    polyDragRef.current = { pointIndex, startClientX: e.clientX, startClientY: e.clientY, origX, origY };
  }

  function onPolyHandlePointerMove(e: React.PointerEvent) {
    const drag = polyDragRef.current;
    if (!drag || !selectedNode || !scene) return;
    const d = selectedNode.data;
    if (d.type !== "Path2D" && d.type !== "NavRegion2D") return;
    let dx = (e.clientX - drag.startClientX) / zoom;
    let dy = (e.clientY - drag.startClientY) / zoom;
    let nx = drag.origX + dx;
    let ny = drag.origY + dy;
    if (e.ctrlKey || e.metaKey) {
      const g = 16;
      nx = Math.round(nx / g) * g;
      ny = Math.round(ny / g) * g;
    }
    const nextPoints = d.points.map((p, i) => i === drag.pointIndex ? { x: nx, y: ny } : p);
    props.dispatch({ type: "updateSceneNodeDataSilent", sceneId: scene.id, nodeId: selectedNode.id, data: { ...d, points: nextPoints } });
  }

  function onPolyHandlePointerUp(e: React.PointerEvent) {
    if (polyDragRef.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      polyDragRef.current = null;
    }
  }

  function onPolySegmentClick(e: React.PointerEvent, insertIndex: number) {
    if (!e.shiftKey) return;
    if (!selectedNode || !scene) return;
    const d = selectedNode.data;
    if (d.type !== "Path2D" && d.type !== "NavRegion2D") return;
    e.stopPropagation();
    e.preventDefault();
    // Compute click point in node-local coordinates
    const wt = getWorldTransform(scene.root, selectedNode.id);
    const stageRect = props.stageRef.current?.getBoundingClientRect();
    if (!stageRect) return;
    const style = props.stageRef.current ? window.getComputedStyle(props.stageRef.current) : null;
    const padL = style ? parseFloat(style.paddingLeft) || 0 : 0;
    const padT = style ? parseFloat(style.paddingTop) || 0 : 0;
    const stageX = e.clientX - stageRect.left - padL - props.levelPan.x;
    const stageY = e.clientY - stageRect.top - padT - props.levelPan.y;
    const localX = stageX / zoom - wt.x;
    const localY = stageY / zoom - wt.y;
    const nextPoints = [...d.points];
    nextPoints.splice(insertIndex, 0, { x: localX, y: localY });
    props.dispatch({ type: "updateSceneNodeData", sceneId: scene.id, nodeId: selectedNode.id, data: { ...d, points: nextPoints } });
  }

  function onHandlePointerDown(e: React.PointerEvent, edge: HandleEdge, origW: number, origH: number) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeDragRef.current = { edge, startX: e.clientX, startY: e.clientY, origW, origH };
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    const drag = resizeDragRef.current;
    if (!drag || !selectedNode || !scene) return;
    const dx = (e.clientX - drag.startX) / zoom;
    const dy = (e.clientY - drag.startY) / zoom;
    const d = selectedNode.data;

    if (d.type === "TileMap") {
      const tw = d.tileWidth || 16;
      const th = d.tileHeight || 16;
      const newW = Math.max(1, drag.origW + (drag.edge !== "bottom" ? Math.round(dx / tw) : 0));
      const newH = Math.max(1, drag.origH + (drag.edge !== "right" ? Math.round(dy / th) : 0));
      if (newW !== d.mapWidthTiles || newH !== d.mapHeightTiles) {
        props.dispatch({ type: "updateSceneNodeDataSilent", sceneId: scene.id, nodeId: selectedNode.id, data: { ...d, mapWidthTiles: newW, mapHeightTiles: newH } });
      }
    } else if (d.type === "CollisionShape") {
      const newW = Math.max(1, Math.round(drag.origW + (drag.edge !== "bottom" ? dx : 0)));
      const newH = Math.max(1, Math.round(drag.origH + (drag.edge !== "right" ? dy : 0)));
      props.dispatch({ type: "updateSceneNodeDataSilent", sceneId: scene.id, nodeId: selectedNode.id, data: { ...d, width: newW, height: newH } });
    } else if (d.type === "Area" && d.shape === "rect") {
      const newW = Math.max(1, Math.round(drag.origW + (drag.edge !== "bottom" ? dx : 0)));
      const newH = Math.max(1, Math.round(drag.origH + (drag.edge !== "right" ? dy : 0)));
      props.dispatch({ type: "updateSceneNodeDataSilent", sceneId: scene.id, nodeId: selectedNode.id, data: { ...d, width: newW, height: newH } });
    }
  }

  function onHandlePointerUp(e: React.PointerEvent) {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    resizeDragRef.current = null;
  }

  function onRotatePointerDown(e: React.PointerEvent, centerX: number, centerY: number) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const startAngle = Math.atan2(dy, dx);
    const origRotation = selectedNode?.transform.rotation ?? 0;
    rotationDragRef.current = { centerX, centerY, startAngle, origRotation };
  }

  function onRotatePointerMove(e: React.PointerEvent) {
    const drag = rotationDragRef.current;
    if (!drag || !selectedNode || !scene) return;
    const dx = e.clientX - drag.centerX;
    const dy = e.clientY - drag.centerY;
    const currentAngle = Math.atan2(dy, dx);
    let deltaDeg = (currentAngle - drag.startAngle) * (180 / Math.PI);
    if (e.shiftKey) deltaDeg = Math.round(deltaDeg / 15) * 15;
    const newRotation = Math.round((drag.origRotation + deltaDeg) * 10) / 10;
    props.dispatch({ type: "updateSceneNodeSilent", sceneId: scene.id, nodeId: selectedNode.id, patch: { transform: { ...selectedNode.transform, rotation: newRotation } } });
  }

  function onRotatePointerUp(e: React.PointerEvent) {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    rotationDragRef.current = null;
  }

  // Gizmo for selected node
  let gizmo: React.ReactNode = null;
  if (selectedNode && scene && selectedNode.data.type !== "Root") {
    const wt = getWorldTransform(scene.root, selectedNode.id);
    const bounds = getNodeBounds(selectedNode);
    const gx = wt.x * zoom;
    const gy = wt.y * zoom;
    const gw = bounds.w * zoom;
    const gh = bounds.h * zoom;
    const hs = 8;
    const hh = hs / 2;

    const canResize = selectedNode.data.type === "TileMap" || selectedNode.data.type === "CollisionShape" || (selectedNode.data.type === "Area" && selectedNode.data.shape === "rect");
    const resizeOrigW = selectedNode.data.type === "TileMap" ? selectedNode.data.mapWidthTiles : bounds.w;
    const resizeOrigH = selectedNode.data.type === "TileMap" ? selectedNode.data.mapHeightTiles : bounds.h;

    const handleStyle = (left: number, top: number, cursor: string): React.CSSProperties => ({
      position: "absolute", left, top, width: hs, height: hs,
      background: "#fff", border: "1.5px solid rgba(135,197,255,1)", boxSizing: "border-box",
      cursor, pointerEvents: canResize ? "auto" : "none",
    });

    const rotHandleOffset = 28;

    gizmo = (
      <div ref={gizmoContainerRef} style={{ position: "absolute", left: gx - 2, top: gy - 2, width: gw + 4, height: gh + 4, pointerEvents: "none", transform: wt.rotation ? `rotate(${wt.rotation}deg)` : undefined, transformOrigin: "center center" }}>
        <div style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(135,197,255,0.9)", boxSizing: "border-box" }} />

        {/* Rotation stem line */}
        <div style={{ position: "absolute", left: (gw + 4) / 2, top: -rotHandleOffset, width: 1, height: rotHandleOffset, background: "rgba(135,197,255,0.6)", pointerEvents: "none" }} />
        {/* Rotation handle */}
        <div
          style={{
            position: "absolute", left: (gw + 4) / 2 - 5, top: -rotHandleOffset - 5,
            width: 10, height: 10, borderRadius: "50%",
            background: "#fff", border: "1.5px solid rgba(135,197,255,1)", boxSizing: "border-box",
            cursor: "grab", pointerEvents: "auto",
          }}
          onPointerDown={(e) => {
            const rect = gizmoContainerRef.current?.getBoundingClientRect();
            if (!rect) return;
            onRotatePointerDown(e, rect.left + rect.width / 2, rect.top + rect.height / 2);
          }}
          onPointerMove={onRotatePointerMove}
          onPointerUp={onRotatePointerUp}
        />

        {/* Right edge */}
        <div style={handleStyle(gw + 4 - hh - 1, (gh + 4) / 2 - hh, "ew-resize")}
          onPointerDown={(e) => onHandlePointerDown(e, "right", resizeOrigW, resizeOrigH)}
          onPointerMove={onHandlePointerMove} onPointerUp={onHandlePointerUp} />
        {/* Bottom edge */}
        <div style={handleStyle((gw + 4) / 2 - hh, gh + 4 - hh - 1, "ns-resize")}
          onPointerDown={(e) => onHandlePointerDown(e, "bottom", resizeOrigW, resizeOrigH)}
          onPointerMove={onHandlePointerMove} onPointerUp={onHandlePointerUp} />
        {/* Bottom-right corner */}
        <div style={handleStyle(gw + 4 - hh - 1, gh + 4 - hh - 1, "nwse-resize")}
          onPointerDown={(e) => onHandlePointerDown(e, "corner", resizeOrigW, resizeOrigH)}
          onPointerMove={onHandlePointerMove} onPointerUp={onHandlePointerUp} />

        {/* Non-interactive decorative handles */}
        <div style={{ ...handleStyle(-hh, -hh, "default"), pointerEvents: "none" }} />
        <div style={{ ...handleStyle(gw + 4 - hh - 1, -hh, "default"), pointerEvents: "none" }} />
        <div style={{ ...handleStyle(-hh, gh + 4 - hh - 1, "default"), pointerEvents: "none" }} />
        <div style={{ ...handleStyle((gw + 4) / 2 - hh, -hh, "default"), pointerEvents: "none" }} />
        <div style={{ ...handleStyle(-hh, (gh + 4) / 2 - hh, "default"), pointerEvents: "none" }} />

        <div style={{ position: "absolute", left: 0, top: -16, fontSize: "0.6rem", color: "rgba(135,197,255,0.9)", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {selectedNode.name}
          {selectedNode.data.type === "TileMap" && ` (${selectedNode.data.mapWidthTiles}×${selectedNode.data.mapHeightTiles})`}
        </div>
      </div>
    );
  }

  // Polyline overlay for Path2D / NavRegion2D
  let polylineOverlay: React.ReactNode = null;
  if (selectedNode && scene && (selectedNode.data.type === "Path2D" || selectedNode.data.type === "NavRegion2D")) {
    const wt = getWorldTransform(scene.root, selectedNode.id);
    const pts = selectedNode.data.points;
    const closed = selectedNode.data.type === "NavRegion2D" || (selectedNode.data.type === "Path2D" && selectedNode.data.closed);
    const handleSize = 10;
    const half = handleSize / 2;
    const segmentCount = closed ? pts.length : pts.length - 1;
    polylineOverlay = (
      <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
        {Array.from({ length: segmentCount }, (_, i) => {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const ax = (wt.x + a.x) * zoom;
          const ay = (wt.y + a.y) * zoom;
          const bx = (wt.x + b.x) * zoom;
          const by = (wt.y + b.y) * zoom;
          const dx = bx - ax;
          const dy = by - ay;
          const len = Math.hypot(dx, dy);
          if (len < 1) return null;
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          return (
            <div
              key={`seg-${i}`}
              title="Shift-click to add a point"
              style={{
                position: "absolute", left: ax, top: ay - 4,
                width: len, height: 8,
                transformOrigin: "0 4px",
                transform: `rotate(${angle}deg)`,
                pointerEvents: "auto", cursor: "copy",
              }}
              onPointerDown={(e) => onPolySegmentClick(e, i + 1)}
            />
          );
        })}
        {pts.map((p, i) => {
          const left = (wt.x + p.x) * zoom - half;
          const top = (wt.y + p.y) * zoom - half;
          return (
            <div
              key={`pt-${i}`}
              title="Drag to move, alt-click to remove"
              style={{
                position: "absolute", left, top,
                width: handleSize, height: handleSize,
                background: "#fff", border: "1.5px solid rgba(135,255,135,1)",
                boxSizing: "border-box", cursor: "grab", pointerEvents: "auto",
                borderRadius: 2,
              }}
              onPointerDown={(e) => onPolyHandlePointerDown(e, i, p.x, p.y)}
              onPointerMove={onPolyHandlePointerMove}
              onPointerUp={onPolyHandlePointerUp}
            />
          );
        })}
      </div>
    );
  }

  const hasContent = scene !== null;

  return (
    <div className="workspace-content level-workspace">
      {hasContent ? (
        <div
          ref={props.stageRef}
          className={`level-stage viewport-stage ${props.cursorClass}`}
          onWheel={props.onWheel}
          onPointerDown={props.onStagePanStart}
          onPointerMove={props.onStagePanMove}
          onPointerUp={props.onStagePanEnd}
        >
          <div className="viewport-inner">
            <div className="viewport-camera" style={{ transform: `translate(${props.levelPan.x}px, ${props.levelPan.y}px)`, position: "relative" }}>
              <canvas
                ref={props.webglCanvasRef}
                width={canvasW}
                height={canvasH}
                style={{ position: "absolute", top: 0, left: 0, imageRendering: "pixelated" }}
              />
              <canvas
                ref={props.levelCanvasRef}
                width={canvasW}
                height={canvasH}
                style={{ position: "relative", background: "transparent" }}
                onPointerDown={props.onCanvasPointerDown}
                onPointerMove={props.onCanvasPointerMove}
                onPointerUp={props.onCanvasPointerUp}
                onPointerLeave={props.onCanvasPointerLeave}
              />
              {cursorOverlay && <div style={cursorOverlay} />}
              {rectOverlay && <div style={rectOverlay} />}
              {selectionOverlay && <div style={selectionOverlay} />}
              {selectionOverlay && sel && (
                <div style={{
                  position: "absolute",
                  left: Math.min(sel.x0, sel.x1) * tileW,
                  top: Math.max(sel.y0, sel.y1) * tileH + tileH + 4,
                  display: "flex",
                  gap: 4,
                  pointerEvents: "auto",
                  zIndex: 10,
                }}>
                  <button className="pn-tool-btn" title="Cut (Ctrl+X)" onClick={props.onCut} style={{ fontSize: 11, padding: "2px 7px" }}>Cut</button>
                  <button className="pn-tool-btn" title="Copy (Ctrl+C)" onClick={props.onCopy} style={{ fontSize: 11, padding: "2px 7px" }}>Copy</button>
                  {props.hasClipboard && (
                    <button className="pn-tool-btn" title="Paste (Ctrl+V)" onClick={props.onPaste} style={{ fontSize: 11, padding: "2px 7px" }}>Paste</button>
                  )}
                </div>
              )}
              {gizmo}
              {polylineOverlay}
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">No scene available.</div>
      )}
    </div>
  );
}
