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
  canvasRef: RefObject<HTMLDivElement>;
  stageRef: RefObject<HTMLDivElement>;
  onCreateSlices: () => void;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
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
        <div className="atlas-pack-stage viewport-stage">
          <div className="atlas-pages">
            {props.atlas?.pages.length ? (
              props.atlas.pages.map((page) => (
                <article className="atlas-page-card" key={page.index}>
                  <div className="atlas-page-preview" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
                    <img src={page.blobUrl} alt={`Atlas page ${page.index}`} />
                  </div>
                  <strong>Page {page.index}</strong>
                  <span>
                    {page.width} x {page.height}
                  </span>
                </article>
              ))
            ) : (
              <div className="empty-state">Use Sprite Slicer or import PNG sources, then atlas pages will appear here.</div>
            )}
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
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onStagePanStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePanMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePanEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
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
            <div className="viewport-camera" style={{ transform: `translate(${props.levelPan.x}px, ${props.levelPan.y}px)` }}>
              <canvas
                ref={props.levelCanvasRef}
                width={props.level.mapWidthTiles * props.level.tileWidth * props.levelZoom}
                height={props.level.mapHeightTiles * props.level.tileHeight * props.levelZoom}
                onPointerDown={props.onCanvasPointerDown}
                onPointerMove={props.onCanvasPointerMove}
                onPointerUp={props.onCanvasPointerUp}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">No level available.</div>
      )}
    </div>
  );
}
