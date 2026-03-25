import {
  ChangeEvent,
  DragEvent,
  PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { buildAtlas } from "./atlas";
import { decodeSprite, sliceSpriteSheet, sliceSpriteSheetManual } from "./image";
import type {
  BuildOptions,
  ImportSprite,
  ManualSliceRect,
  PackedAtlas,
  PotSize,
  SheetSliceOptions,
} from "./types";
import { downloadBlob, formatBytes } from "./utils";

const DEFAULT_OPTIONS: BuildOptions = {
  maxPageSize: 1024,
  allowRotation: true,
  padding: 2,
  extrusion: 2,
  includeHashTable: true,
  includeDebugJson: true,
};

const POT_OPTIONS: PotSize[] = [64, 128, 256, 512, 1024];
const DEFAULT_MANUAL_RECT: ManualSliceRect = {
  x: 0,
  y: 0,
  width: 32,
  height: 32,
  name: "",
};
const DEFAULT_SLICER: SheetSliceOptions = {
  frameWidth: 32,
  frameHeight: 32,
  spacingX: 0,
  spacingY: 0,
  marginX: 0,
  marginY: 0,
  endOffsetX: 0,
  endOffsetY: 0,
  keepEmpty: false,
  namePrefix: "",
};

type AppRoute = "atlas" | "slicer";
type SlicerCanvasTool = "draw" | "move";

export default function App() {
  const [route, setRoute] = useState<AppRoute>(readRoute());
  const [sprites, setSprites] = useState<ImportSprite[]>([]);
  const [atlas, setAtlas] = useState<PackedAtlas | null>(null);
  const [options, setOptions] = useState<BuildOptions>(DEFAULT_OPTIONS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slicerFile, setSlicerFile] = useState<File | null>(null);
  const [slicerOptions, setSlicerOptions] = useState<SheetSliceOptions>(DEFAULT_SLICER);
  const [slicerMode, setSlicerMode] = useState<"grid" | "manual">("grid");
  const [manualRectDraft, setManualRectDraft] = useState<ManualSliceRect>(DEFAULT_MANUAL_RECT);
  const [manualRects, setManualRects] = useState<ManualSliceRect[]>([]);
  const [slicerPreviewUrl, setSlicerPreviewUrl] = useState<string | null>(null);
  const [slicerImageSize, setSlicerImageSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  const [canvasTool, setCanvasTool] = useState<SlicerCanvasTool>("draw");
  const [selectedRectIndex, setSelectedRectIndex] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<ManualSliceRect | null>(null);
  const [moveStart, setMoveStart] = useState<{ x: number; y: number } | null>(null);
  const [moveOrigin, setMoveOrigin] = useState<ManualSliceRect | null>(null);
  const [draggedSpriteIndex, setDraggedSpriteIndex] = useState<number | null>(null);
  const [dropSpriteIndex, setDropSpriteIndex] = useState<number | null>(null);
  const [hoveredSpriteIndex, setHoveredSpriteIndex] = useState<number | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onHashChange() {
      setRoute(readRoute());
    }

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    return () => {
      atlas?.pages.forEach((page) => URL.revokeObjectURL(page.blobUrl));
    };
  }, [atlas]);

  useEffect(() => {
    if (!slicerFile) {
      setSlicerPreviewUrl(null);
      setSlicerImageSize(null);
      return;
    }

    const nextUrl = URL.createObjectURL(slicerFile);
    setSlicerPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [slicerFile]);

  useEffect(() => {
    if (route !== "slicer" || slicerMode !== "manual" || selectedRectIndex === null) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;

      setManualRects((current) =>
        current.map((rect, index) => {
          if (index !== selectedRectIndex || !slicerImageSize) {
            return rect;
          }

          const next = { ...rect };
          if (event.key === "ArrowLeft") next.x -= step;
          if (event.key === "ArrowRight") next.x += step;
          if (event.key === "ArrowUp") next.y -= step;
          if (event.key === "ArrowDown") next.y += step;

          next.x = clamp(next.x, 0, slicerImageSize.width - next.width);
          next.y = clamp(next.y, 0, slicerImageSize.height - next.height);
          return next;
        }),
      );
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [route, selectedRectIndex, slicerImageSize, slicerMode]);

  const summary = useMemo(() => {
    const sourcePixels = sprites.reduce(
      (sum, sprite) => sum + sprite.sourceWidth * sprite.sourceHeight,
      0,
    );
    const trimmedPixels = sprites.reduce(
      (sum, sprite) => sum + sprite.trimmedWidth * sprite.trimmedHeight,
      0,
    );
    return { sourcePixels, trimmedPixels };
  }, [sprites]);

  const previewRects = useMemo(() => {
    if (!slicerImageSize) {
      return [];
    }
    return slicerMode === "manual"
      ? manualRects
      : generateGridPreviewRects(slicerImageSize.width, slicerImageSize.height, slicerOptions);
  }, [manualRects, slicerImageSize, slicerMode, slicerOptions]);

  const activeAtlasSpriteIndex = draggedSpriteIndex ?? hoveredSpriteIndex;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }

    const files = [...fileList]
      .filter((file) => file.type === "image/png" || file.name.toLowerCase().endsWith(".png"))
      .sort((left, right) => left.name.localeCompare(right.name));

    if (!files.length) {
      setError("Only PNG files are supported.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const decoded = await Promise.all(files.map((file) => decodeSprite(file)));
      applySprites(decoded);
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "Failed to process sprites.");
    } finally {
      setBusy(false);
    }
  }

  function rebuild(nextOptions: BuildOptions) {
    setOptions(nextOptions);
    if (!sprites.length) {
      return;
    }
    try {
      setError(null);
      setAtlas(buildAtlas(sprites, nextOptions));
    } catch (buildError) {
      setAtlas(null);
      setError(buildError instanceof Error ? buildError.message : "Failed to rebuild atlas.");
    }
  }

  function applySprites(nextSprites: ImportSprite[]) {
    setSprites(nextSprites);
    setAtlas(nextSprites.length ? buildAtlas(nextSprites, options) : null);
  }

  function appendSprites(nextSprites: ImportSprite[]) {
    const merged = [...sprites, ...nextSprites];
    applySprites(merged);
  }

  function reorderSprites(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
      return;
    }

    const nextSprites = [...sprites];
    const [moved] = nextSprites.splice(fromIndex, 1);
    nextSprites.splice(toIndex, 0, moved);
    applySprites(nextSprites);
  }

  function removeSprite(index: number) {
    applySprites(sprites.filter((_, spriteIndex) => spriteIndex !== index));
  }

  function navigate(nextRoute: AppRoute) {
    window.location.hash = nextRoute === "atlas" ? "#/" : "#/slicer";
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void handleFiles(event.dataTransfer.files);
  }

  function downloadOutputs() {
    if (!atlas) {
      return;
    }

    downloadBlob(
      new Blob([new Uint8Array(atlas.atlasBin)], { type: "application/octet-stream" }),
      "atlas.bin",
    );
    downloadBlob(
      new Blob([new Uint8Array(atlas.atlasMetaBin)], { type: "application/octet-stream" }),
      "atlas.meta.bin",
    );
    if (options.includeDebugJson) {
      downloadBlob(new Blob([atlas.atlasDebugJson], { type: "application/json" }), "atlas.debug.json");
    }
    atlas.pages.forEach((page) => {
      downloadBlob(page.blob, `atlas.page${page.index}.png`);
    });
  }

  async function importSlicedSheet() {
    if (!slicerFile) {
      setError("Select a sprite sheet before slicing.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const sliced =
        slicerMode === "manual"
          ? await sliceSpriteSheetManual(slicerFile, manualRects)
          : await sliceSpriteSheet(slicerFile, slicerOptions);
      appendSprites(sliced);
      setSlicerFile(null);
      setSlicerMode("grid");
      setSlicerOptions({
        ...DEFAULT_SLICER,
        namePrefix: slicerOptions.namePrefix,
      });
      setManualRectDraft(DEFAULT_MANUAL_RECT);
      setManualRects([]);
      setDragStart(null);
      setDragRect(null);
      setSelectedRectIndex(null);
      setMoveStart(null);
      setMoveOrigin(null);
      navigate("atlas");
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "Failed to slice sprite sheet.");
    } finally {
      setBusy(false);
    }
  }

  function addManualRect() {
    setManualRects([
      ...manualRects,
      {
        ...manualRectDraft,
        name:
          manualRectDraft.name.trim() ||
          `slice_${String(manualRects.length).padStart(2, "0")}`,
      },
    ]);
  }

  function removeManualRect(index: number) {
    setManualRects(manualRects.filter((_, rectIndex) => rectIndex !== index));
  }

  function updateManualRectName(index: number, name: string) {
    setManualRects(
      manualRects.map((rect, rectIndex) =>
        rectIndex === index ? { ...rect, name } : rect,
      ),
    );
  }

  function onSlicerFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSlicerFile(event.target.files?.[0] ?? null);
    setManualRectDraft(DEFAULT_MANUAL_RECT);
    setManualRects([]);
    setDragStart(null);
    setDragRect(null);
    setSelectedRectIndex(null);
    setMoveStart(null);
    setMoveOrigin(null);
    setZoom(1);
  }

  function applyZoom(nextZoom: number) {
    setZoom(Math.max(0.25, Math.min(8, nextZoom)));
  }

  function zoomToFit(nextImageSize?: { width: number; height: number } | null) {
    const imageSize = nextImageSize ?? slicerImageSize;
    const viewport = viewportRef.current;
    if (!imageSize || !viewport) {
      return;
    }

    const horizontalPadding = 24;
    const verticalPadding = 24;
    const fitX = (viewport.clientWidth - horizontalPadding) / imageSize.width;
    const fitY = (viewport.clientHeight - verticalPadding) / imageSize.height;
    applyZoom(Math.min(fitX, fitY, 1));
    requestAnimationFrame(() => {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
  }

  function onPreviewPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (slicerMode !== "manual" || !slicerImageSize) {
      return;
    }

    const point = getImagePoint(event, slicerImageSize, previewRef.current);
    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (canvasTool === "move" && selectedRectIndex !== null) {
      const selected = manualRects[selectedRectIndex];
      if (selected && pointInRect(point.x, point.y, selected)) {
        setMoveStart(point);
        setMoveOrigin(selected);
      }
      return;
    }

    setSelectedRectIndex(null);
    setDragStart(point);
    setDragRect({
      x: point.x,
      y: point.y,
      width: 1,
      height: 1,
      name: "",
    });
  }

  function onPreviewPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!slicerImageSize) {
      return;
    }

    const point = getImagePoint(event, slicerImageSize, previewRef.current);
    if (!point) {
      return;
    }

    if (moveStart && moveOrigin && selectedRectIndex !== null) {
      const deltaX = point.x - moveStart.x;
      const deltaY = point.y - moveStart.y;
      const nextX = clamp(moveOrigin.x + deltaX, 0, slicerImageSize.width - moveOrigin.width);
      const nextY = clamp(moveOrigin.y + deltaY, 0, slicerImageSize.height - moveOrigin.height);

      setManualRects((current) =>
        current.map((rect, index) =>
          index === selectedRectIndex ? { ...rect, x: nextX, y: nextY } : rect,
        ),
      );
      return;
    }

    if (!dragStart) {
      return;
    }

    const nextRect = normalizeRect(dragStart.x, dragStart.y, point.x, point.y);
    setDragRect({
      ...nextRect,
      name: "",
    });
    setManualRectDraft((current) => ({
      ...current,
      x: nextRect.x,
      y: nextRect.y,
      width: nextRect.width,
      height: nextRect.height,
    }));
  }

  function commitDragRect() {
    if (!dragRect || dragRect.width <= 1 || dragRect.height <= 1) {
      setDragStart(null);
      setDragRect(null);
      return;
    }

    const nextRect = {
      ...dragRect,
      name: manualRectDraft.name.trim() || `slice_${String(manualRects.length).padStart(2, "0")}`,
    };

    setManualRects([...manualRects, nextRect]);
    setSelectedRectIndex(manualRects.length);
    setManualRectDraft(DEFAULT_MANUAL_RECT);
    setDragStart(null);
    setDragRect(null);
  }

  function onPreviewPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragStart || moveStart) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (moveStart) {
      setMoveStart(null);
      setMoveOrigin(null);
      return;
    }
    commitDragRect();
  }

  return (
    <main className="app-shell">
      <header className="topbar panel">
        <div className="topbar-left">
          <div className="topbar-title">
            <strong>Atlas Manager</strong>
            <span>RGBA32 atlas packing and fixed-layout metadata export</span>
          </div>
          <nav className="route-tabs">
            <button
              className={route === "atlas" ? "secondary active" : "ghost"}
              onClick={() => navigate("atlas")}
            >
              Atlas
            </button>
            <button
              className={route === "slicer" ? "secondary active" : "ghost"}
              onClick={() => navigate("slicer")}
            >
              Slicer
            </button>
          </nav>
        </div>
        <div className="metrics">
          <div className="stat">
            <span>Sprites</span>
            <strong>{sprites.length}</strong>
          </div>
          <div className="stat">
            <span>Pages</span>
            <strong>{atlas?.pages.length ?? 0}</strong>
          </div>
          <div className="stat">
            <span>Trim Gain</span>
            <strong>
              {summary.sourcePixels
                ? `${Math.max(
                    0,
                    Math.round(
                      ((summary.sourcePixels - summary.trimmedPixels) / summary.sourcePixels) * 100,
                    ),
                  )}%`
                : "0%"}
            </strong>
          </div>
        </div>
      </header>

      {route === "slicer" ? (
        <section className="panel route-panel">
          <div className="panel-header">
            <h2>Sheet Slicer</h2>
            <span>{previewRects.length} preview slices</span>
          </div>

          <div className="slicer-layout">
            <aside className="panel slicer-tools">
              <section className="property-section">
                <div className="property-header">
                  <h3>Source</h3>
                </div>
                <label className="dropzone slicer-dropzone">
                  <input type="file" accept=".png,image/png" onChange={onSlicerFileChange} />
                  <span>{slicerFile ? slicerFile.name : "Select sprite sheet"}</span>
                  <small>PNG sheet source</small>
                </label>
              </section>

              <section className="property-section">
                <div className="property-header">
                  <h3>Slice</h3>
                </div>
                <div className="mode-switch compact">
                  <button
                    className={slicerMode === "grid" ? "secondary active" : "ghost"}
                    onClick={() => setSlicerMode("grid")}
                  >
                    Auto
                  </button>
                  <button
                    className={slicerMode === "manual" ? "secondary active" : "ghost"}
                    onClick={() => setSlicerMode("manual")}
                  >
                    Manual
                  </button>
                </div>

                {slicerMode === "grid" ? (
                  <div className="tool-grid">
                    <label>
                      Prefix
                      <input
                        value={slicerOptions.namePrefix}
                        onChange={(event) =>
                          setSlicerOptions({ ...slicerOptions, namePrefix: event.target.value })
                        }
                      />
                    </label>
                    <div className="property-grid">
                      <div className="pair-group">
                        <span>Frame</span>
                        <div className="pair-inputs">
                          <label>
                            <span>X</span>
                            <input
                              type="number"
                              min="1"
                              value={slicerOptions.frameWidth}
                              onChange={(event) =>
                                setSlicerOptions({
                                  ...slicerOptions,
                                  frameWidth: Number(event.target.value) || 1,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>Y</span>
                            <input
                              type="number"
                              min="1"
                              value={slicerOptions.frameHeight}
                              onChange={(event) =>
                                setSlicerOptions({
                                  ...slicerOptions,
                                  frameHeight: Number(event.target.value) || 1,
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                      <div className="pair-group">
                        <span>Spacing</span>
                        <div className="pair-inputs">
                          <label>
                            <span>X</span>
                            <input
                              type="number"
                              min="0"
                              value={slicerOptions.spacingX}
                              onChange={(event) =>
                                setSlicerOptions({
                                  ...slicerOptions,
                                  spacingX: Math.max(0, Number(event.target.value) || 0),
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>Y</span>
                            <input
                              type="number"
                              min="0"
                              value={slicerOptions.spacingY}
                              onChange={(event) =>
                                setSlicerOptions({
                                  ...slicerOptions,
                                  spacingY: Math.max(0, Number(event.target.value) || 0),
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                      <div className="pair-group">
                        <span>Margin</span>
                        <div className="pair-inputs">
                          <label>
                            <span>X</span>
                            <input
                              type="number"
                              min="0"
                              value={slicerOptions.marginX}
                              onChange={(event) =>
                                setSlicerOptions({
                                  ...slicerOptions,
                                  marginX: Math.max(0, Number(event.target.value) || 0),
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>Y</span>
                            <input
                              type="number"
                              min="0"
                              value={slicerOptions.marginY}
                              onChange={(event) =>
                                setSlicerOptions({
                                  ...slicerOptions,
                                  marginY: Math.max(0, Number(event.target.value) || 0),
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                      <div className="pair-group">
                        <span>End Offset</span>
                        <div className="pair-inputs">
                          <label>
                            <span>X</span>
                            <input
                              type="number"
                              min="0"
                              value={slicerOptions.endOffsetX}
                              onChange={(event) =>
                                setSlicerOptions({
                                  ...slicerOptions,
                                  endOffsetX: Math.max(0, Number(event.target.value) || 0),
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>Y</span>
                            <input
                              type="number"
                              min="0"
                              value={slicerOptions.endOffsetY}
                              onChange={(event) =>
                                setSlicerOptions({
                                  ...slicerOptions,
                                  endOffsetY: Math.max(0, Number(event.target.value) || 0),
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                    <label className="checkbox-row property-check">
                      <input
                        type="checkbox"
                        checked={slicerOptions.keepEmpty}
                        onChange={(event) =>
                          setSlicerOptions({ ...slicerOptions, keepEmpty: event.target.checked })
                        }
                      />
                      <span>Keep empty</span>
                    </label>
                  </div>
                ) : (
                  <div className="tool-grid">
                    <label>
                      Name
                      <input
                        value={manualRectDraft.name}
                        onChange={(event) =>
                          setManualRectDraft({ ...manualRectDraft, name: event.target.value })
                        }
                      />
                    </label>
                    <div className="draft-readout compact">
                      <strong>Current</strong>
                      <span>
                        {manualRectDraft.x}, {manualRectDraft.y} {manualRectDraft.width}x{manualRectDraft.height}
                      </span>
                    </div>
                    <div className="manual-actions compact">
                      <button className="secondary" onClick={addManualRect}>
                        Add
                      </button>
                      <button className="ghost" onClick={() => setManualRects([])}>
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="property-section property-actions">
                <div className="property-header">
                  <h3>Actions</h3>
                </div>
                <div className="tool-meta">
                  <strong>{previewRects.length} slices</strong>
                  <span className="muted">{sprites.length} sprites in atlas</span>
                </div>
                <div className="route-actions rail-actions">
                  <button className="ghost" onClick={() => navigate("atlas")}>
                    Back
                  </button>
                  <button className="primary" onClick={() => void importSlicedSheet()}>
                    Import
                  </button>
                </div>
              </section>
            </aside>

            <section className="panel slicer-stage">
              <div className="canvas-shell">
                <div className="canvas-toolbar">
                  <div className="toolbar-left">
                    <span className="tool-badge">{slicerMode === "grid" ? "Auto Preview" : "Manual Markup"}</span>
                    <span className="muted">{slicerFile ? slicerFile.name : "No sheet loaded"}</span>
                  </div>
                  <div className="toolbar-right">
                    <div className={`toolbar-tools ${slicerMode === "manual" ? "" : "toolbar-tools-empty"}`}>
                      {slicerMode === "manual" ? (
                        <>
                          <button
                            className={canvasTool === "draw" ? "ghost active-tool" : "ghost"}
                            onClick={() => setCanvasTool("draw")}
                            title="Draw tool"
                          >
                            Draw
                          </button>
                          <button
                            className={canvasTool === "move" ? "ghost active-tool" : "ghost"}
                            onClick={() => setCanvasTool("move")}
                            title="Move tool"
                          >
                            Move
                          </button>
                        </>
                      ) : null}
                    </div>
                    <div className="zoom-group">
                      <button className="ghost" onClick={() => applyZoom(zoom - 0.25)}>
                        -
                      </button>
                      <input
                        type="range"
                        min="0.25"
                        max="8"
                        step="0.25"
                        value={zoom}
                        onChange={(event) => applyZoom(Number(event.target.value))}
                      />
                      <button className="ghost" onClick={() => applyZoom(zoom + 0.25)}>
                        +
                      </button>
                      <button className="ghost" onClick={() => setZoom(1)}>
                        100%
                      </button>
                      <button className="ghost" onClick={() => zoomToFit()}>
                        Fit
                      </button>
                      <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
                    </div>
                  </div>
                </div>

                {slicerPreviewUrl ? (
                  <div ref={viewportRef} className="canvas-viewport">
                    <div
                      ref={previewRef}
                      className={`slicer-preview ${slicerMode === "manual" ? "manual-active" : "auto-active"}`}
                      onPointerDown={onPreviewPointerDown}
                      onPointerMove={onPreviewPointerMove}
                      onPointerUp={onPreviewPointerUp}
                      style={canvasStyle(slicerImageSize, zoom)}
                    >
                      <img
                        src={slicerPreviewUrl}
                        alt="Sprite sheet preview"
                        draggable={false}
                        onLoad={(event) => {
                          const nextSize = {
                            width: event.currentTarget.naturalWidth,
                            height: event.currentTarget.naturalHeight,
                          };
                          setSlicerImageSize(nextSize);
                          requestAnimationFrame(() => zoomToFit(nextSize));
                        }}
                      />
                      {previewRects.map((rect, index) => (
                        <div
                          key={`${rect.name}-${rect.x}-${rect.y}-${index}`}
                          className={`slice-overlay ${slicerMode === "grid" ? "auto" : ""} ${selectedRectIndex === index ? "selected" : ""}`}
                          style={rectStyle(rect, slicerImageSize)}
                          onPointerDown={(event) => {
                            if (slicerMode !== "manual" || !slicerImageSize) {
                              return;
                            }
                            event.stopPropagation();
                            setSelectedRectIndex(index);
                            if (canvasTool === "move") {
                              const point = getImagePoint(event, slicerImageSize, previewRef.current);
                              if (!point) {
                                return;
                              }
                              event.currentTarget.setPointerCapture(event.pointerId);
                              setMoveStart(point);
                              setMoveOrigin(rect);
                            }
                          }}
                        >
                          <span>{rect.name || `slice_${index}`}</span>
                        </div>
                      ))}
                      {dragRect ? (
                        <div
                          className="slice-overlay pending"
                          style={rectStyle(dragRect, slicerImageSize)}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state stage-empty">
                    <p>No sheet loaded.</p>
                    <small>Load a sprite sheet to preview auto slices or mark manual regions.</small>
                  </div>
                )}
              </div>
            </section>

            <aside className="panel slicer-inspector">
              <div className="panel-header">
                <h2>{slicerMode === "grid" ? "Preview" : "Slices"}</h2>
                <span>{previewRects.length}</span>
              </div>
              {slicerMode === "manual" ? (
                <div className="rect-list inspector-list">
                  {manualRects.length ? (
                    manualRects.map((rect, index) => (
                      <div className="rect-row" key={`${rect.name}-${index}`}>
                        <input
                          value={rect.name}
                          onChange={(event) => updateManualRectName(index, event.target.value)}
                          placeholder={`slice_${index}`}
                        />
                        <span>
                          {rect.x},{rect.y} {rect.width}x{rect.height}
                        </span>
                        <button className="ghost" onClick={() => removeManualRect(index)}>
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Drag on the canvas to create slices.</p>
                  )}
                </div>
              ) : (
                <div className="inspector-stats">
                  <div className="stat-line">
                    <span>Frame</span>
                    <strong>
                      {slicerOptions.frameWidth} x {slicerOptions.frameHeight}
                    </strong>
                  </div>
                  <div className="stat-line">
                    <span>Spacing</span>
                    <strong>
                      {slicerOptions.spacingX}, {slicerOptions.spacingY}
                    </strong>
                  </div>
                  <div className="stat-line">
                    <span>Margins</span>
                    <strong>
                      {slicerOptions.marginX}, {slicerOptions.marginY}
                    </strong>
                  </div>
                  <div className="stat-line">
                    <span>End Offsets</span>
                    <strong>
                      {slicerOptions.endOffsetX}, {slicerOptions.endOffsetY}
                    </strong>
                  </div>
                  <div className="stat-line">
                    <span>Sprites In Atlas</span>
                    <strong>{sprites.length}</strong>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </section>
      ) : (
        <section className="atlas-layout">
          <aside className="panel controls">
            <div className="panel-header">
              <h2>Input</h2>
              <span>PNG only</span>
            </div>
            <label
              className="dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
            >
              <input type="file" accept=".png,image/png" multiple onChange={onFileChange} />
              <span>Drop PNGs here</span>
              <small>or click to import sprite sources</small>
            </label>

            <button className="secondary" onClick={() => navigate("slicer")}>
              Open slicer route
            </button>

            <div className="control-group">
              <div className="panel-header">
                <h2>Settings</h2>
                <span>Deterministic</span>
              </div>
              <label>
                Max Page Size
                <select
                  value={options.maxPageSize}
                  onChange={(event) =>
                    rebuild({
                      ...options,
                      maxPageSize: Number(event.target.value) as PotSize,
                    })
                  }
                >
                  {POT_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} x {size}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rotation
                <select
                  value={options.allowRotation ? "on" : "off"}
                  onChange={(event) =>
                    rebuild({
                      ...options,
                      allowRotation: event.target.value === "on",
                    })
                  }
                >
                  <option value="on">Allow 90 deg</option>
                  <option value="off">Disabled</option>
                </select>
              </label>
              <label>
                Hash Table
                <select
                  value={options.includeHashTable ? "on" : "off"}
                  onChange={(event) =>
                    rebuild({
                      ...options,
                      includeHashTable: event.target.value === "on",
                    })
                  }
                >
                  <option value="on">Included</option>
                  <option value="off">Omitted</option>
                </select>
              </label>
              <label>
                Debug JSON
                <select
                  value={options.includeDebugJson ? "on" : "off"}
                  onChange={(event) =>
                    rebuild({
                      ...options,
                      includeDebugJson: event.target.value === "on",
                    })
                  }
                >
                  <option value="on">Included</option>
                  <option value="off">Omitted</option>
                </select>
              </label>
            </div>

            <button className="primary" onClick={downloadOutputs} disabled={!atlas}>
              Export outputs
            </button>

            {error ? <p className="error">{error}</p> : null}
            {busy ? <p className="muted">Processing sprites...</p> : null}

            <div className="summary-card">
              <h2>Output</h2>
              <p>Raw texture payload: {atlas ? formatBytes(atlas.atlasBin.byteLength) : "0 B"}</p>
              <p>Metadata payload: {atlas ? formatBytes(atlas.atlasMetaBin.byteLength) : "0 B"}</p>
              <p>Padding / extrusion: {options.padding}px / {options.extrusion}px</p>
            </div>
          </aside>

          <section className="panel workspace">
            <div className="panel-header">
              <h2>Atlas Pages</h2>
              <span>{atlas ? `${atlas.pages.length} generated` : "No pages yet"}</span>
            </div>

            <div className="page-grid">
              {atlas?.pages.length ? (
                atlas.pages.map((page) => (
                  <article className="page-card" key={page.index}>
                    <div
                      className="page-preview"
                      style={{ aspectRatio: `${page.width} / ${page.height}` }}
                    >
                      <img src={page.blobUrl} alt={`Atlas page ${page.index}`} />
                      {activeAtlasSpriteIndex !== null
                        ? atlas.placements
                            .filter(
                              (placement) =>
                                placement.pageIndex === page.index &&
                                placement.sprite.id === activeAtlasSpriteIndex,
                            )
                            .map((placement) => (
                              <div
                                key={`${placement.pageIndex}-${placement.sprite.id}-${placement.frameX}-${placement.frameY}`}
                                className="atlas-placement-highlight"
                                style={atlasPlacementStyle(
                                  placement.frameX,
                                  placement.frameY,
                                  placement.sprite.frameWidth,
                                  placement.sprite.frameHeight,
                                  page.width,
                                  page.height,
                                )}
                              />
                            ))
                        : null}
                    </div>
                    <div className="page-meta">
                      <strong>Page {page.index}</strong>
                      <span>
                        {page.width} x {page.height}
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState />
              )}
            </div>

          </section>

          <aside className="panel atlas-sprites">
            <div className="panel-header">
              <h2>Sprites</h2>
              <span>{sprites.length ? `${sprites.length} ordered` : "Awaiting input"}</span>
            </div>

            <div className="sprite-panel-note muted">
              Drag to reorder. The list order becomes your sprite index order.
            </div>

            <div className="sprite-table sprite-list">
              <div className="sprite-row sprite-head">
                <span>Idx</span>
                <span>Name</span>
                <span>Source</span>
                <span>Trim</span>
                <span />
              </div>
              {sprites.map((sprite, index) => (
                <div
                  className={`sprite-row sprite-item ${draggedSpriteIndex === index ? "dragging" : ""} ${dropSpriteIndex === index ? "drop-target" : ""}`}
                  key={`${sprite.fileName}-${index}`}
                  draggable
                  onDragStart={() => {
                    setDraggedSpriteIndex(index);
                    setDropSpriteIndex(index);
                  }}
                  onMouseEnter={() => setHoveredSpriteIndex(index)}
                  onMouseLeave={() => setHoveredSpriteIndex((current) => (current === index ? null : current))}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dropSpriteIndex !== index) {
                      setDropSpriteIndex(index);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedSpriteIndex !== null) {
                      reorderSprites(draggedSpriteIndex, index);
                    }
                    setDraggedSpriteIndex(null);
                    setDropSpriteIndex(null);
                    setHoveredSpriteIndex(null);
                  }}
                  onDragEnd={() => {
                    setDraggedSpriteIndex(null);
                    setDropSpriteIndex(null);
                    setHoveredSpriteIndex(null);
                  }}
                >
                  <span>{index}</span>
                  <span className="sprite-name">{sprite.fileName}</span>
                  <span>
                    {sprite.sourceWidth} x {sprite.sourceHeight}
                  </span>
                  <span>
                    {sprite.trimmedWidth} x {sprite.trimmedHeight}
                  </span>
                  <button
                    className="ghost sprite-remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeSprite(index);
                    }}
                    title={`Remove ${sprite.fileName}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}

function getImagePoint(
  event: PointerEvent<HTMLDivElement>,
  imageSize: { width: number; height: number },
  container: HTMLDivElement | null,
): { x: number; y: number } | null {
  if (!container) {
    return null;
  }

  const image = container.querySelector("img");
  if (!image) {
    return null;
  }

  const bounds = image.getBoundingClientRect();
  const clampedX = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width);
  const clampedY = Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height);
  const x = Math.floor((clampedX / bounds.width) * imageSize.width);
  const y = Math.floor((clampedY / bounds.height) * imageSize.height);
  return { x, y };
}

function normalizeRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Pick<ManualSliceRect, "x" | "y" | "width" | "height"> {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.max(1, Math.abs(endX - startX));
  const height = Math.max(1, Math.abs(endY - startY));
  return { x, y, width, height };
}

function rectStyle(
  rect: Pick<ManualSliceRect, "x" | "y" | "width" | "height">,
  imageSize: { width: number; height: number } | null,
) {
  if (!imageSize) {
    return {};
  }

  return {
    left: `${(rect.x / imageSize.width) * 100}%`,
    top: `${(rect.y / imageSize.height) * 100}%`,
    width: `${(rect.width / imageSize.width) * 100}%`,
    height: `${(rect.height / imageSize.height) * 100}%`,
  };
}

function canvasStyle(
  imageSize: { width: number; height: number } | null,
  zoom: number,
) {
  if (!imageSize) {
    return {};
  }

  return {
    width: `${imageSize.width * zoom}px`,
    height: `${imageSize.height * zoom}px`,
  };
}

function atlasPlacementStyle(
  x: number,
  y: number,
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number,
) {
  return {
    left: `${(x / pageWidth) * 100}%`,
    top: `${(y / pageHeight) * 100}%`,
    width: `${(width / pageWidth) * 100}%`,
    height: `${(height / pageHeight) * 100}%`,
  };
}

function pointInRect(x: number, y: number, rect: ManualSliceRect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function generateGridPreviewRects(
  sheetWidth: number,
  sheetHeight: number,
  options: SheetSliceOptions,
): ManualSliceRect[] {
  if (options.frameWidth <= 0 || options.frameHeight <= 0) {
    return [];
  }

  const pitchX = options.frameWidth + options.spacingX;
  const pitchY = options.frameHeight + options.spacingY;
  const limitX = Math.max(options.marginX, sheetWidth - options.endOffsetX);
  const limitY = Math.max(options.marginY, sheetHeight - options.endOffsetY);
  const rects: ManualSliceRect[] = [];

  for (
    let sourceY = options.marginY, row = 0;
    sourceY + options.frameHeight <= limitY;
    sourceY += pitchY, row += 1
  ) {
    for (
      let sourceX = options.marginX, column = 0;
      sourceX + options.frameWidth <= limitX;
      sourceX += pitchX, column += 1
    ) {
      rects.push({
        x: sourceX,
        y: sourceY,
        width: options.frameWidth,
        height: options.frameHeight,
        name: `${options.namePrefix || "slice"}_${String(row).padStart(2, "0")}_${String(column).padStart(2, "0")}`,
      });
    }
  }

  return rects;
}

function readRoute(): AppRoute {
  return window.location.hash === "#/slicer" ? "slicer" : "atlas";
}

function EmptyState() {
  return (
    <div className="empty-state">
      <p>No atlas output yet.</p>
      <small>Import PNG sprites to generate RGBA32 pages and binary metadata.</small>
    </div>
  );
}
