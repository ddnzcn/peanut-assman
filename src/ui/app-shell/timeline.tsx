import { useEffect, useRef, useState } from "react";
import { getTotalDuration, useAnimationPlayback } from "../../animation/playback";
import { fnv1a32 } from "../../utils";
import type { AnimationFrame, ProjectDocument, SliceAsset, SpriteAnimation } from "../../types";
import { SliceAssetPreview } from "./shared";

function FrameThumb(props: {
  project: ProjectDocument;
  frame: AnimationFrame;
  index: number;
  selected: boolean;
  playing: boolean;
  onClick: () => void;
  onDurationChange: (ms: number) => void;
  onRemove: () => void;
}) {
  const slice = props.project.slices.find((s) => s.id === props.frame.sliceId) ?? null;
  const [editingDuration, setEditingDuration] = useState(false);
  const [draftDuration, setDraftDuration] = useState(String(props.frame.durationMs));

  useEffect(() => {
    setDraftDuration(String(props.frame.durationMs));
  }, [props.frame.durationMs]);

  function commitDuration(value: string) {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      props.onDurationChange(parsed);
    }
    setDraftDuration(String(props.frame.durationMs));
    setEditingDuration(false);
  }

  return (
    <div className={`anim-frame-thumb${props.selected ? " selected" : ""}`} onClick={props.onClick}>
      <div className="anim-frame-preview">
        <SliceAssetPreview project={props.project} slice={slice} scale={2} />
        <button
          className="anim-frame-remove"
          onClick={(e) => { e.stopPropagation(); props.onRemove(); }}
          aria-label="Remove frame"
        >✕</button>
      </div>
      <div className="anim-frame-meta">
        <span className="anim-frame-index">{props.index + 1}</span>
        {editingDuration ? (
          <input
            className="anim-frame-duration-input"
            type="number"
            min={1}
            value={draftDuration}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraftDuration(e.target.value)}
            onBlur={(e) => commitDuration(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDuration((e.target as HTMLInputElement).value);
              if (e.key === "Escape") { setEditingDuration(false); setDraftDuration(String(props.frame.durationMs)); }
              e.stopPropagation();
            }}
          />
        ) : (
          <button
            className="anim-frame-duration"
            onClick={(e) => { e.stopPropagation(); setEditingDuration(true); }}
            title="Click to edit duration"
          >
            {props.frame.durationMs}ms
          </button>
        )}
      </div>
    </div>
  );
}

function AnimViewport(props: { project: ProjectDocument; slice: SliceAsset | null }) {
  const { slice } = props;
  if (!slice) {
    return (
      <div className="anim-viewport-inner anim-viewport-empty">
        <span>No frame</span>
      </div>
    );
  }
  const source = props.project.sourceImages.find((s) => s.id === slice.sourceImageId) ?? null;
  if (!source) {
    return <div className="anim-viewport-inner anim-viewport-empty"><span>No source</span></div>;
  }
  const maxSize = 200;
  const scale = Math.max(1, Math.floor(Math.min(maxSize / slice.sourceRect.width, maxSize / slice.sourceRect.height)));
  return (
    <div className="anim-viewport-inner">
      <div
        className="anim-viewport-sprite"
        style={{
          width: slice.sourceRect.width * scale,
          height: slice.sourceRect.height * scale,
          backgroundImage: `url(${source.dataUrl})`,
          backgroundPosition: `-${slice.sourceRect.x * scale}px -${slice.sourceRect.y * scale}px`,
          backgroundSize: `${source.width * scale}px ${source.height * scale}px`,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

function SliceGridCell(props: {
  project: ProjectDocument;
  slice: SliceAsset;
  active: boolean;
  onClick: () => void;
}) {
  const source = props.project.sourceImages.find((s) => s.id === props.slice.sourceImageId) ?? null;
  const scale = Math.max(1, Math.floor(Math.min(48 / props.slice.sourceRect.width, 48 / props.slice.sourceRect.height)));
  return (
    <button
      className={`anim-slice-cell${props.active ? " active" : ""}`}
      onClick={props.onClick}
      title={props.slice.name}
    >
      {source ? (
        <div
          className="anim-slice-cell-img"
          style={{
            width: props.slice.sourceRect.width * scale,
            height: props.slice.sourceRect.height * scale,
            backgroundImage: `url(${source.dataUrl})`,
            backgroundPosition: `-${props.slice.sourceRect.x * scale}px -${props.slice.sourceRect.y * scale}px`,
            backgroundSize: `${source.width * scale}px ${source.height * scale}px`,
            imageRendering: "pixelated",
          }}
        />
      ) : (
        <div className="anim-slice-cell-empty" />
      )}
      <span className="anim-slice-cell-name">{props.slice.name}</span>
    </button>
  );
}

export function AnimationWorkspace(props: {
  project: ProjectDocument;
  animations: SpriteAnimation[];
  selectedAnimationId: number | null;
  currentFrame: number;
  isPlaying: boolean;
  onSelectAnimation: (id: number) => void;
  onCreateAnimation: () => void;
  onRemoveAnimation: (id: number) => void;
  onUpdateAnimation: (anim: SpriteAnimation) => void;
  onSelectFrame: (index: number) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onTick: (timeMs: number) => void;
}) {
  const selectedAnim = props.animations.find((a) => a.id === props.selectedAnimationId) ?? null;
  const totalDuration = selectedAnim ? getTotalDuration(selectedAnim.frames) : 0;
  const frameCount = selectedAnim?.frames.length ?? 0;
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);
  const [sliceSearch, setSliceSearch] = useState("");
  const stripRef = useRef<HTMLDivElement | null>(null);

  useAnimationPlayback(props.isPlaying, props.onTick);

  useEffect(() => {
    setSelectedFrameIndex(null);
  }, [props.selectedAnimationId]);

  // Scroll active frame into view during playback
  useEffect(() => {
    if (!props.isPlaying || !stripRef.current) return;
    const el = stripRef.current.querySelector<HTMLElement>(".anim-frame-thumb.selected");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [props.currentFrame, props.isPlaying]);

  function addFrame(sliceId: string) {
    if (!selectedAnim) return;
    props.onUpdateAnimation({
      ...selectedAnim,
      frames: [...selectedAnim.frames, { sliceId, durationMs: 100 }],
    });
  }

  function updateFrameDuration(index: number, durationMs: number) {
    if (!selectedAnim) return;
    const frames = selectedAnim.frames.map((f, i) => i === index ? { ...f, durationMs } : f);
    props.onUpdateAnimation({ ...selectedAnim, frames });
  }

  function removeFrame(index: number) {
    if (!selectedAnim) return;
    const frames = selectedAnim.frames.filter((_, i) => i !== index);
    props.onUpdateAnimation({ ...selectedAnim, frames });
    if (selectedFrameIndex !== null && selectedFrameIndex >= frames.length) {
      setSelectedFrameIndex(frames.length - 1 < 0 ? null : frames.length - 1);
    }
  }

  function updateSelectedFrameSlice(sliceId: string) {
    if (!selectedAnim || selectedFrameIndex === null) return;
    const frames = selectedAnim.frames.map((f, i) => i === selectedFrameIndex ? { ...f, sliceId } : f);
    props.onUpdateAnimation({ ...selectedAnim, frames });
  }

  function handleSliceClick(sliceId: string) {
    if (props.isPlaying || !selectedAnim) return;
    if (selectedFrameIndex !== null) {
      updateSelectedFrameSlice(sliceId);
    } else {
      addFrame(sliceId);
    }
  }

  const visibleFrameIndex = props.isPlaying ? props.currentFrame : selectedFrameIndex;
  const selectedFrame = selectedAnim && selectedFrameIndex !== null ? selectedAnim.frames[selectedFrameIndex] ?? null : null;

  const previewFrameIndex = props.isPlaying ? props.currentFrame : (selectedFrameIndex ?? 0);
  const previewSliceId = selectedAnim?.frames[previewFrameIndex]?.sliceId ?? null;
  const previewSlice = previewSliceId ? (props.project.slices.find((s) => s.id === previewSliceId) ?? null) : null;

  const atlasSliceIds = new Set(
    props.project.sprites
      .filter((sp) => sp.includeInAtlas)
      .map((sp) => sp.sliceId),
  );
  const atlasSlices = props.project.slices.filter((s) => atlasSliceIds.has(s.id));
  const filteredSlices = sliceSearch.trim()
    ? atlasSlices.filter((s) => s.name.toLowerCase().includes(sliceSearch.toLowerCase()))
    : atlasSlices;

  return (
    <div className="anim-workspace">
      {/* Left: animation list */}
      <aside className="panel anim-list-panel">
        <div className="anim-list-header">
          <strong>Animations</strong>
          <button className="ghost anim-add-btn" onClick={props.onCreateAnimation} title="New animation">+</button>
        </div>
        <div className="anim-list-items">
          {props.animations.map((anim) => (
            <div
              key={anim.id}
              className={`anim-list-item${anim.id === props.selectedAnimationId ? " active" : ""}`}
              onClick={() => props.onSelectAnimation(anim.id)}
            >
              <span className="anim-list-name">{anim.name}</span>
              <span className="anim-list-frames">{anim.frames.length}f</span>
              <button
                className="ghost anim-list-remove"
                onClick={(e) => { e.stopPropagation(); props.onRemoveAnimation(anim.id); }}
                aria-label="Delete animation"
              >✕</button>
            </div>
          ))}
          {props.animations.length === 0 && (
            <div className="anim-list-empty">No animations yet</div>
          )}
        </div>
      </aside>

      {/* Center: viewport + controls + strip */}
      <div className="anim-center">
        {selectedAnim ? (
          <>
            <div className="anim-viewport">
              <AnimViewport project={props.project} slice={previewSlice} />
            </div>

            <div className="anim-controls">
              <button
                className={`ghost anim-ctrl-btn${props.isPlaying ? " active" : ""}`}
                onClick={props.onTogglePlay}
                disabled={frameCount === 0}
                title={props.isPlaying ? "Pause" : "Play"}
              >
                {props.isPlaying ? "⏸" : "▶"}
              </button>
              <button className="ghost anim-ctrl-btn" onClick={props.onStop} title="Stop">⏹</button>
              <button
                className={`ghost anim-ctrl-btn${selectedAnim.loop ? " active" : ""}`}
                onClick={() => props.onUpdateAnimation({ ...selectedAnim, loop: !selectedAnim.loop })}
                title="Loop"
              >↺</button>
              <span className="anim-ctrl-info">
                {visibleFrameIndex !== null ? visibleFrameIndex + 1 : "-"}/{frameCount}
              </span>
              <span className="anim-ctrl-duration">{totalDuration}ms</span>
              <div className="anim-ctrl-spacer" />
              <label className="anim-name-label">
                Name
                <input
                  type="text"
                  className="anim-name-input"
                  value={selectedAnim.name}
                  onChange={(e) => props.onUpdateAnimation({ ...selectedAnim, name: e.target.value, nameHash: fnv1a32(e.target.value) })}
                />
              </label>
              <label className="checkbox-row anim-loop-label">
                Loop
                <input
                  type="checkbox"
                  checked={selectedAnim.loop}
                  onChange={(e) => props.onUpdateAnimation({ ...selectedAnim, loop: e.target.checked })}
                />
              </label>
            </div>

            <div className="anim-strip-area">
              {selectedFrame && !props.isPlaying && (
                <div className="anim-selected-frame-hint">
                  Frame {(selectedFrameIndex ?? 0) + 1} selected — click a sprite to replace it
                </div>
              )}
              {!selectedFrame && !props.isPlaying && selectedAnim.frames.length > 0 && (
                <div className="anim-selected-frame-hint">
                  Click a frame to select it, or click a sprite to append
                </div>
              )}
              <div className="anim-strip" ref={stripRef}>
                {selectedAnim.frames.map((frame, i) => (
                  <FrameThumb
                    key={i}
                    project={props.project}
                    frame={frame}
                    index={i}
                    selected={i === visibleFrameIndex}
                    playing={props.isPlaying}
                    onClick={() => {
                      if (!props.isPlaying) {
                        setSelectedFrameIndex(i === selectedFrameIndex ? null : i);
                        props.onSelectFrame(i);
                      }
                    }}
                    onDurationChange={(ms) => updateFrameDuration(i, ms)}
                    onRemove={() => removeFrame(i)}
                  />
                ))}
                {selectedAnim.frames.length === 0 && (
                  <div className="anim-strip-empty">Click a sprite on the right to add the first frame.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="anim-workspace-empty">Select or create an animation from the left panel.</div>
        )}
      </div>

      {/* Right: slice grid picker */}
      <aside className="panel anim-picker-panel">
        <div className="anim-picker-header">
          <strong>Sprites</strong>
          <input
            className="anim-picker-search"
            type="search"
            placeholder="Filter…"
            value={sliceSearch}
            onChange={(e) => setSliceSearch(e.target.value)}
          />
        </div>
        <div className="anim-picker-hint">
          {selectedFrame && !props.isPlaying
            ? "Click to replace selected frame"
            : "Click to append frame"}
        </div>
        <div className="anim-slice-grid">
          {filteredSlices.map((slice) => (
            <SliceGridCell
              key={slice.id}
              project={props.project}
              slice={slice}
              active={selectedFrame?.sliceId === slice.id}
              onClick={() => handleSliceClick(slice.id)}
            />
          ))}
          {filteredSlices.length === 0 && (
            <div className="anim-picker-empty">No sprites match.</div>
          )}
        </div>
      </aside>
    </div>
  );
}
