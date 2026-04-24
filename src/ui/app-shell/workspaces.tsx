import type { PointerEvent as ReactPointerEvent, RefObject, WheelEvent as ReactWheelEvent } from "react";
import type {
  GridSliceOptions,
  LevelDocument,
  LevelLayer,
  ManualSliceRect,
  PackedAtlas,
  SliceKind,
  SliceRect,
  SourceImageAsset,
} from "../../types";
import type { SlicerCanvasTool } from "./constants";
import { rectStyle } from "./canvas";

interface SlicerSurfaceProps {
  source: SourceImageAsset | null;
  gridPreview: Array<{ name: string; rect: SliceRect; kind: SliceKind }>;
  manualRects: ManualSliceRect[];
  selectedManualRectIndex: number | null;
  slicerCanvasTool: SlicerCanvasTool;
  dragRect: SliceRect | null;
  slicerZoom: number;
  slicerPan: { x: number; y: number };
  canvasRef: RefObject<HTMLDivElement>;
  stageRef: RefObject<HTMLDivElement>;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onStagePanStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePanMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePanEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerUp: () => void;
  onManualRectSelect: (index: number | null) => void;
}

function SlicerSurface(props: SlicerSurfaceProps) {
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
        {props.source ? (
          <div className="viewport-camera" style={{ transform: `translate(${props.slicerPan.x}px, ${props.slicerPan.y}px)` }}>
            <div
              ref={props.canvasRef}
              className="slicer-canvas"
              onPointerDown={props.onCanvasPointerDown}
              onPointerMove={props.onCanvasPointerMove}
              onPointerUp={props.onCanvasPointerUp}
              style={{
                width: props.source.width * props.slicerZoom,
                height: props.source.height * props.slicerZoom,
              }}
            >
              <img src={props.source.dataUrl} alt={props.source.fileName} />
              {props.gridPreview.map((preview) => (
                <div
                  key={`${preview.name}-${preview.rect.x}-${preview.rect.y}`}
                  className="slice-outline"
                  style={rectStyle(preview.rect, props.slicerZoom)}
                >
                  <span>{preview.name}</span>
                </div>
              ))}
              {props.manualRects.map((rect, index) => (
                <div
                  key={`${rect.name}-${rect.x}-${rect.y}-${index}`}
                  className={`slice-outline ${props.selectedManualRectIndex === index ? "selected" : ""}`}
                  style={rectStyle(rect, props.slicerZoom)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    props.onManualRectSelect(index);
                  }}
                >
                  <span>{rect.name}</span>
                </div>
              ))}
              {props.dragRect ? <div className="slice-outline pending" style={rectStyle(props.dragRect, props.slicerZoom)} /> : null}
            </div>
          </div>
        ) : (
          <div className="empty-state">Pick a source image.</div>
        )}
      </div>
    </div>
  );
}

export function AtlasWorkspace(props: {
  atlas: PackedAtlas | null;
  module: "pack" | "slicer";
  source: SourceImageAsset | null;
  gridOptions: GridSliceOptions;
  setGridOptions: React.Dispatch<React.SetStateAction<GridSliceOptions>>;
  gridPreview: Array<{ name: string; rect: SliceRect; kind: SliceKind }>;
  manualRects: ManualSliceRect[];
  selectedManualRectIndex: number | null;
  slicerCanvasTool: SlicerCanvasTool;
  manualKind: SliceKind;
  manualDraft: ManualSliceRect;
  setManualKind: React.Dispatch<React.SetStateAction<SliceKind>>;
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
  onManualRectSelect: (index: number | null) => void;
}) {
  return (
    <div className="workspace-content level-workspace">
      {props.module === "pack" ? (
        <div
          ref={props.packStageRef}
          className="atlas-pack-stage viewport-stage cursor-hand"
          onWheel={props.onPackWheel}
          onPointerDown={props.onPackPanStart}
          onPointerMove={props.onPackPanMove}
          onPointerUp={props.onPackPanEnd}
        >
          <div className="viewport-inner">
            <div className="viewport-camera" style={{ transform: `translate(${props.packPan.x}px, ${props.packPan.y}px)` }}>
              {props.atlas?.pages.length ? (
                <div className="atlas-pages-viewport" style={{ display: "flex", gap: `${16 * props.packZoom}px`, alignItems: "flex-start" }}>
                  {props.atlas.pages.map((page) => (
                    <div key={page.index} style={{ flexShrink: 0 }}>
                      <img
                        src={page.blobUrl}
                        alt={`Atlas page ${page.index}`}
                        style={{
                          display: "block",
                          width: page.width * props.packZoom,
                          height: page.height * props.packZoom,
                          imageRendering: "pixelated",
                          border: "1px solid rgba(255,255,255,0.15)",
                        }}
                      />
                      <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                        Page {page.index} — {page.width}×{page.height}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">Use Sprite Slicer or import PNG sources, then atlas pages will appear here.</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <SlicerSurface
          source={props.source}
          gridPreview={props.gridPreview}
          manualRects={props.manualRects}
          selectedManualRectIndex={props.selectedManualRectIndex}
          slicerCanvasTool={props.slicerCanvasTool}
          dragRect={props.dragRect}
          slicerZoom={props.slicerZoom}
          slicerPan={props.slicerPan}
          canvasRef={props.canvasRef}
          stageRef={props.stageRef}
          onWheel={props.onWheel}
          onStagePanStart={props.onStagePanStart}
          onStagePanMove={props.onStagePanMove}
          onStagePanEnd={props.onStagePanEnd}
          onCanvasPointerDown={props.onCanvasPointerDown}
          onCanvasPointerMove={props.onCanvasPointerMove}
          onCanvasPointerUp={props.onCanvasPointerUp}
          onManualRectSelect={props.onManualRectSelect}
        />
      )}
    </div>
  );
}

export function LevelWorkspace(props: {
  level: LevelDocument | null;
  levelZoom: number;
  levelPan: { x: number; y: number };
  cursorClass: string;
  levelCanvasRef: RefObject<HTMLCanvasElement>;
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
  const { level, rectDragStart: rds, rectDragCurrent: rdc, levelZoom: zoom } = props;

  const tileW = level ? level.tileWidth * zoom : 0;
  const tileH = level ? level.tileHeight * zoom : 0;

  // Live drag rect overlay (rect-fill and select tools during drag)
  let rectOverlay: React.CSSProperties | null = null;
  if (level && rds && rdc) {
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

  // Committed selection overlay — persists while select tool is active
  let selectionOverlay: React.CSSProperties | null = null;
  const sel = props.levelSelection;
  if (level && sel && props.levelTool === "select" && !rds) {
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

  // Cursor preview overlay — ghost of brush/tile under cursor
  let cursorOverlay: React.CSSProperties | null = null;
  const ct = props.cursorTile;
  if (level && ct && (props.levelTool === "brush" || props.levelTool === "erase")) {
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

  return (
    <div className="workspace-content level-workspace">
      {props.level ? (
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
                ref={props.levelCanvasRef}
                width={props.level.mapWidthTiles * props.level.tileWidth * props.levelZoom}
                height={props.level.mapHeightTiles * props.level.tileHeight * props.levelZoom}
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
                  <button className="v2-tool-btn" title="Cut (Ctrl+X)" onClick={props.onCut} style={{ fontSize: 11, padding: "2px 7px" }}>Cut</button>
                  <button className="v2-tool-btn" title="Copy (Ctrl+C)" onClick={props.onCopy} style={{ fontSize: 11, padding: "2px 7px" }}>Copy</button>
                  {props.hasClipboard && (
                    <button className="v2-tool-btn" title="Paste (Ctrl+V)" onClick={props.onPaste} style={{ fontSize: 11, padding: "2px 7px" }}>Paste</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">No level available.</div>
      )}
    </div>
  );
}
