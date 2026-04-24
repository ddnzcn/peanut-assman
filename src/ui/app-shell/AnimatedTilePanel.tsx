import { useEffect, useMemo, useRef, useState } from "react";
import { buildAnimatedTileLookup, resolveAnimatedTileSliceId, useAnimationPlayback } from "../../animation/playback";
import type { AnimatedTileAsset, AnimatedTileFrame, ProjectDocument } from "../../types";
import { SliceAssetPreview } from "./shared";

function TileFrameThumb(props: {
  project: ProjectDocument;
  frame: AnimatedTileFrame;
  index: number;
  selected: boolean;
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
          onClick={(e) => {
            e.stopPropagation();
            props.onRemove();
          }}
          aria-label="Remove frame"
        >
          ✕
        </button>
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
              if (e.key === "Escape") {
                setEditingDuration(false);
                setDraftDuration(String(props.frame.durationMs));
              }
              e.stopPropagation();
            }}
          />
        ) : (
          <button
            className="anim-frame-duration"
            onClick={(e) => {
              e.stopPropagation();
              setEditingDuration(true);
            }}
            title="Click to edit duration"
          >
            {props.frame.durationMs}ms
          </button>
        )}
      </div>
    </div>
  );
}

function SlicePickerCell(props: {
  project: ProjectDocument;
  slice: import("../../types").SliceAsset;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`anim-slice-cell${props.active ? " active" : ""}`} onClick={props.onClick} title={props.slice.name}>
      <SliceAssetPreview project={props.project} slice={props.slice} scale={2} />
      <span className="anim-slice-cell-name">{props.slice.name}</span>
    </button>
  );
}

function AnimatedTilePreview(props: {
  project: ProjectDocument;
  animatedTile: AnimatedTileAsset;
  scale?: number;
}) {
  const [currentSliceId, setCurrentSliceId] = useState<string | null>(
    props.animatedTile.frames[0]?.sliceId ?? null,
  );
  const lookup = useMemo(() => buildAnimatedTileLookup([props.animatedTile]), [props.animatedTile]);

  useAnimationPlayback(true, (timeMs) => {
    const resolved = resolveAnimatedTileSliceId(lookup, props.animatedTile.baseTileId, timeMs);
    setCurrentSliceId(resolved);
  });

  const slice = currentSliceId ? props.project.slices.find((s) => s.id === currentSliceId) ?? null : null;
  const source = slice ? props.project.sourceImages.find((s) => s.id === slice.sourceImageId) ?? null : null;
  const scale = props.scale ?? 6;

  if (!slice || !source) {
    return <div className="tile-preview empty" />;
  }
  return (
    <div className="tile-preview">
      <div
        className="tile-preview-image"
        style={{
          width: slice.sourceRect.width * scale,
          height: slice.sourceRect.height * scale,
          backgroundImage: `url(${source.dataUrl})`,
          backgroundPosition: `-${slice.sourceRect.x * scale}px -${slice.sourceRect.y * scale}px`,
          backgroundSize: `${source.width * scale}px ${source.height * scale}px`,
        }}
      />
    </div>
  );
}

export function AnimatedTilePanel(props: {
  project: ProjectDocument;
  animatedTiles: AnimatedTileAsset[];
  selectedAnimatedTileId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onRemove: (id: number) => void;
  onUpdate: (animatedTile: AnimatedTileAsset) => void;
}) {
  const selected = props.animatedTiles.find((a) => a.id === props.selectedAnimatedTileId) ?? null;
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState(selected?.name ?? "");
  const [sliceSearch, setSliceSearch] = useState("");
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setNameDraft(selected?.name ?? "");
    setSelectedFrameIndex(null);
  }, [selected?.id]);

  function commitName(value: string) {
    if (!selected || !value.trim()) return;
    props.onUpdate({ ...selected, name: value.trim() });
  }

  function updateFrameDuration(index: number, durationMs: number) {
    if (!selected) return;
    const frames = selected.frames.map((f, i) => (i === index ? { ...f, durationMs } : f));
    props.onUpdate({ ...selected, frames });
  }

  function removeFrame(index: number) {
    if (!selected) return;
    const frames = selected.frames.filter((_, i) => i !== index);
    props.onUpdate({ ...selected, frames });
    if (selectedFrameIndex !== null && selectedFrameIndex >= frames.length) {
      setSelectedFrameIndex(frames.length > 0 ? frames.length - 1 : null);
    }
  }

  function setFrameSlice(index: number, sliceId: string) {
    if (!selected) return;
    const frames = selected.frames.map((f, i) => (i === index ? { ...f, sliceId } : f));
    props.onUpdate({ ...selected, frames });
  }

  function handleSliceClick(sliceId: string) {
    if (!selected) return;
    if (selectedFrameIndex !== null) {
      setFrameSlice(selectedFrameIndex, sliceId);
    } else {
      props.onUpdate({
        ...selected,
        frames: [...selected.frames, { sliceId, durationMs: 150 }],
      });
    }
  }

  const selectedFrame =
    selected && selectedFrameIndex !== null ? selected.frames[selectedFrameIndex] ?? null : null;

  const allTileEntries = useMemo(
    () =>
      props.project.tiles
        .map((tile) => {
          const slice = props.project.slices.find((s) => s.id === tile.sliceId) ?? null;
          return { tile, slice };
        })
        .filter(
          (entry): entry is { tile: typeof entry.tile; slice: NonNullable<typeof entry.slice> } =>
            entry.slice !== null,
        ),
    [props.project.tiles, props.project.slices],
  );
  const filteredTileEntries = sliceSearch.trim()
    ? allTileEntries.filter(({ tile }) => tile.name.toLowerCase().includes(sliceSearch.toLowerCase()))
    : allTileEntries;

  return (
    <div className="anim-tile-workspace">
      {/* Left: animated tile list */}
      <aside className="panel anim-list-panel">
        <div className="anim-list-header">
          <strong>Animated Tiles</strong>
          <button className="ghost anim-add-btn" onClick={props.onCreate} title="New animated tile">
            +
          </button>
        </div>
        <div className="anim-list-items">
          {props.animatedTiles.map((anim) => (
            <div
              key={anim.id}
              className={`anim-list-item${anim.id === props.selectedAnimatedTileId ? " active" : ""}`}
              onClick={() => props.onSelect(anim.id)}
            >
              <span className="anim-list-name">{anim.name}</span>
              <span className="anim-list-frames">{anim.frames.length}f</span>
              <button
                className="ghost anim-list-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onRemove(anim.id);
                }}
                aria-label="Delete animated tile"
              >
                ✕
              </button>
            </div>
          ))}
          {props.animatedTiles.length === 0 && <div className="anim-list-empty">No animated tiles yet</div>}
        </div>
      </aside>

      {/* Center: preview + controls + frame strip */}
      <div className="anim-center">
        {selected ? (
          <>
            <div className="anim-viewport">
              <AnimatedTilePreview project={props.project} animatedTile={selected} scale={8} />
            </div>

            <div className="anim-controls">
              <label className="anim-name-label">
                Name
                <input
                  type="text"
                  className="anim-name-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={(e) => commitName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitName((e.target as HTMLInputElement).value);
                  }}
                />
              </label>
              <span className="anim-ctrl-info">Base #{selected.baseTileId}</span>
              <span className="anim-ctrl-info">{selected.frames.length}f</span>
            </div>

            <div className="anim-strip-area">
              {selectedFrame && (
                <div className="anim-selected-frame-hint">
                  Frame {(selectedFrameIndex ?? 0) + 1} selected — click a tile to replace it
                </div>
              )}
              {!selectedFrame && selected.frames.length > 0 && (
                <div className="anim-selected-frame-hint">
                  Click a frame to select it, or click a tile to append
                </div>
              )}
              <div className="anim-strip" ref={stripRef}>
                {selected.frames.map((frame, i) => (
                  <TileFrameThumb
                    key={i}
                    project={props.project}
                    frame={frame}
                    index={i}
                    selected={i === selectedFrameIndex}
                    onClick={() => setSelectedFrameIndex(i === selectedFrameIndex ? null : i)}
                    onDurationChange={(ms) => updateFrameDuration(i, ms)}
                    onRemove={() => removeFrame(i)}
                  />
                ))}
                {selected.frames.length === 0 && (
                  <div className="anim-strip-empty">Click a tile on the right to add the first frame.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="anim-workspace-empty">Select or create an animated tile from the left panel.</div>
        )}
      </div>

      {/* Right: tile picker for frames */}
      <aside className="panel anim-picker-panel">
        <div className="anim-picker-header">
          <strong>Tiles</strong>
          <input
            className="anim-picker-search"
            type="search"
            placeholder="Filter…"
            value={sliceSearch}
            onChange={(e) => setSliceSearch(e.target.value)}
          />
        </div>
        <div className="anim-picker-hint">
          {selectedFrame ? "Click to replace selected frame" : "Click to append frame"}
        </div>
        <div className="anim-slice-grid">
          {filteredTileEntries.map(({ tile, slice }) => (
            <SlicePickerCell
              key={tile.tileId}
              project={props.project}
              slice={slice}
              active={selectedFrame?.sliceId === tile.sliceId}
              onClick={() => handleSliceClick(tile.sliceId)}
            />
          ))}
          {filteredTileEntries.length === 0 && <div className="anim-picker-empty">No tiles in project.</div>}
        </div>
      </aside>
    </div>
  );
}
