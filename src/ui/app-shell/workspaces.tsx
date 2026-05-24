import type { PointerEvent as ReactPointerEvent, RefObject, WheelEvent as ReactWheelEvent } from "react";
import type {
  ManualSliceRect,
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
import { getWorldTransform } from "../../scene/helpers";

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
      className="slicer-stage viewport-stage"
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
                key={index}
                className="slicer-preview-rect"
                style={rectStyle(entry.rect, props.zoom)}
              />
            ))}
            {props.manualRects.map((entry, index) => (
              <div
                key={index}
                className={`slicer-manual-rect${index === props.selectedManualRectIndex ? " selected" : ""}`}
                style={rectStyle(entry, props.zoom)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  props.onManualRectSelect(index);
                }}
              >
                <span className="slicer-manual-rect-label">{entry.name}</span>
              </div>
            ))}
            {props.dragRect && (
              <div className="slicer-drag-rect" style={rectStyle(props.dragRect, props.zoom)} />
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
      className="pack-stage viewport-stage"
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
    <div className="workspace-content atlas-workspace">
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
}) {
  const { tileMapData, sceneTileMapData, scene, selectedNode, rectDragStart: rds, rectDragCurrent: rdc, levelZoom: zoom } = props;

  const canvasW = sceneTileMapData
    ? sceneTileMapData.mapWidthTiles * sceneTileMapData.tileWidth * zoom
    : DEFAULT_VIEWPORT_W * zoom;
  const canvasH = sceneTileMapData
    ? sceneTileMapData.mapHeightTiles * sceneTileMapData.tileHeight * zoom
    : DEFAULT_VIEWPORT_H * zoom;

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

  // Gizmo for selected node
  let gizmo: React.ReactNode = null;
  if (selectedNode && scene && selectedNode.data.type !== "Root" && selectedNode.data.type !== "TileMap") {
    const wt = getWorldTransform(scene.root, selectedNode.id);
    const bounds = getNodeBounds(selectedNode);
    const gx = wt.x * zoom;
    const gy = wt.y * zoom;
    const gw = bounds.w * zoom;
    const gh = bounds.h * zoom;
    const handleSize = 7;
    const half = Math.floor(handleSize / 2);

    gizmo = (
      <div style={{ position: "absolute", left: gx - 2, top: gy - 2, width: gw + 4, height: gh + 4, pointerEvents: "none" }}>
        {/* Selection border */}
        <div style={{
          position: "absolute", inset: 0,
          border: "1.5px solid rgba(135, 197, 255, 0.9)",
          boxSizing: "border-box",
        }} />
        {/* Corner handles */}
        {[
          { left: -half, top: -half },
          { left: gw + 4 - half - 1, top: -half },
          { left: -half, top: gh + 4 - half - 1 },
          { left: gw + 4 - half - 1, top: gh + 4 - half - 1 },
        ].map((pos, i) => (
          <div key={i} style={{
            position: "absolute",
            left: pos.left, top: pos.top,
            width: handleSize, height: handleSize,
            background: "#fff",
            border: "1px solid rgba(135, 197, 255, 1)",
            boxSizing: "border-box",
          }} />
        ))}
        {/* Edge midpoint handles */}
        {[
          { left: (gw + 4) / 2 - half, top: -half },
          { left: (gw + 4) / 2 - half, top: gh + 4 - half - 1 },
          { left: -half, top: (gh + 4) / 2 - half },
          { left: gw + 4 - half - 1, top: (gh + 4) / 2 - half },
        ].map((pos, i) => (
          <div key={`e${i}`} style={{
            position: "absolute",
            left: pos.left, top: pos.top,
            width: handleSize, height: handleSize,
            background: "#fff",
            border: "1px solid rgba(135, 197, 255, 1)",
            boxSizing: "border-box",
          }} />
        ))}
        {/* Node type label */}
        <div style={{
          position: "absolute",
          left: 0, top: -16,
          fontSize: "0.6rem",
          color: "rgba(135, 197, 255, 0.9)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}>
          {selectedNode.name}
        </div>
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
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">No scene available.</div>
      )}
    </div>
  );
}
