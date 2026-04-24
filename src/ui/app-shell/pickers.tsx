import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { getEffectiveLevelTileIds } from "../../model/selectors";
import { getTerrainSetMarkerTileId } from "../../terrain";
import type {
  AnimatedTileAsset,
  AutotileMode,
  LevelDocument,
  LevelPickerTab,
  ProjectDocument,
  SliceAsset,
  SourceImageAsset,
  TerrainSet,
  TilesetTileAsset,
} from "../../types";
import { buildTileGridLookup, parseTileGridPosition } from "./tileGrid";
import {
  BLOB47_LAYOUT_SLOTS,
  CARDINAL_LAYOUT_MASKS,
  buildBlob47AutoAssignSlots,
  buildCardinalAutoAssignSlots,
  buildRpgMakerAutoAssignSlots,
  getCardinalMaskLabel,
  getSubtileLayoutSlots,
  getSubtileSlotLabel,
} from "./terrainLayout";
import { SliceAssetPreview, TileAssetPreview } from "./shared";
import { AnimatedTilePanel } from "./AnimatedTilePanel";

export { AtlasAssetsPanel } from "./AtlasAssetsPanel";

function formatTilePosition(row?: number, column?: number) {
  if (row === undefined || column === undefined) return "";
  return `r${row + 1} c${column + 1}`;
}

type TileEntry = {
  tile: TilesetTileAsset;
  row?: number;
  column?: number;
  sourceImageId: string | null;
  sourceFileName: string;
};

function buildTileRegionSelection(tileEntries: TileEntry[], startTileId: number, endTileId: number) {
  const start = tileEntries.find((entry) => entry.tile.tileId === startTileId);
  const end = tileEntries.find((entry) => entry.tile.tileId === endTileId);
  if (!start || !end) return [];
  if (
    start.row === undefined ||
    start.column === undefined ||
    end.row === undefined ||
    end.column === undefined
  ) {
    return [start.tile.tileId];
  }
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minColumn = Math.min(start.column, end.column);
  const maxColumn = Math.max(start.column, end.column);
  return tileEntries
    .filter(
      (entry) =>
        entry.row !== undefined &&
        entry.column !== undefined &&
        entry.row >= minRow &&
        entry.row <= maxRow &&
        entry.column >= minColumn &&
        entry.column <= maxColumn,
    )
    .map((entry) => entry.tile.tileId);
}

export function LevelAssetPicker(props: {
  project: ProjectDocument;
  level: LevelDocument | null;
  sourceImages: SourceImageAsset[];
  selectedSourceImageId: string | null;
  selectedSliceIds: string[];
  selectedPaintTileId: number;
  selectedTerrainSetId: number | null;
  selectedAnimatedTileId: number | null;
  terrainSets: TerrainSet[];
  animatedTiles: AnimatedTileAsset[];
  recentTileIds: number[];
  pinnedTileIds: number[];
  search: string;
  tab: LevelPickerTab;
  onSearchChange: (value: string) => void;
  onTabChange: (tab: LevelPickerTab) => void;
  onClose: () => void;
  onSelectSource: (sourceImageId: string) => void;
  onToggleSlice: (sliceId: string) => void;
  onAddSelectedSlicesToLevel: () => void;
  onSelectTile: (tileId: number) => void;
  onSetPaintTile: (tileId: number) => void;
  onTogglePinnedTile: (tileId: number) => void;
  onPinTileRegion: (tileIds: number[]) => void;
  onSelectTerrainSet: (terrainSetId: number) => void;
  onSetTerrainSet: (terrainSetId: number) => void;
  onRemoveTerrainSet: (terrainSetId: number) => void;
  onCreateTerrainSet: () => void;
  onAssignTerrainSlot: (slot: keyof TerrainSet["slots"]) => void;
  onUpdateTerrainSet: (terrainSet: TerrainSet) => void;
  onSelectAnimatedTile: (id: number) => void;
  onCreateAnimatedTile: () => void;
  onRemoveAnimatedTile: (id: number) => void;
  onUpdateAnimatedTile: (animatedTile: AnimatedTileAsset) => void;
}) {
  const [editingBrush, setEditingBrush] = useState(false);
  const [tileFilter, setTileFilter] = useState<"all" | "recent" | "pinned">("all");
  const [tileSourceFilter, setTileSourceFilter] = useState<string>("all");
  const [focusedTileId, setFocusedTileId] = useState<number>(props.selectedPaintTileId);
  const [regionStartTileId, setRegionStartTileId] = useState<number | null>(null);
  const [regionEndTileId, setRegionEndTileId] = useState<number | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);
  const search = props.search.trim().toLowerCase();
  const effectiveLevelTileIds = getEffectiveLevelTileIds(props.project, props.level);
  const selectedTerrainSet =
    props.terrainSets.find((terrainSet) => terrainSet.id === props.selectedTerrainSetId) ??
    props.terrainSets[0] ??
    null;
  const filteredSources = props.sourceImages.filter(
    (source) => !search || source.fileName.toLowerCase().includes(search),
  );
  const filteredSlices = props.project.slices.filter(
    (slice) =>
      slice.sourceImageId === props.selectedSourceImageId &&
      (!search || slice.name.toLowerCase().includes(search)),
  );
  const tileEntries = useMemo(
    () =>
      props.level
        ? effectiveLevelTileIds
            .map((tileId) => props.project.tiles.find((tile) => tile.tileId === tileId))
            .filter((tile): tile is TilesetTileAsset => Boolean(tile))
            .map((tile) => {
              const position = parseTileGridPosition(tile.name);
              const slice = props.project.slices.find((entry) => entry.id === tile.sliceId) ?? null;
              const source = slice
                ? props.project.sourceImages.find((entry) => entry.id === slice.sourceImageId) ?? null
                : null;
              return {
                tile,
                row: position?.row,
                column: position?.column,
                sourceImageId: slice?.sourceImageId ?? null,
                sourceFileName: source?.fileName ?? "",
              };
            })
        : [],
    [effectiveLevelTileIds, props.level, props.project.slices, props.project.sourceImages, props.project.tiles],
  );
  const filteredTerrainSets = props.terrainSets.filter(
    (terrainSet) => !search || terrainSet.name.toLowerCase().includes(search),
  );
  const filteredTileEntries = tileEntries.filter((entry) => {
    if (tileFilter === "recent" && !props.recentTileIds.includes(entry.tile.tileId)) return false;
    if (tileFilter === "pinned" && !props.pinnedTileIds.includes(entry.tile.tileId)) return false;
    if (tileSourceFilter !== "all" && entry.sourceImageId !== tileSourceFilter) return false;
    const positionLabel = formatTilePosition(entry.row, entry.column).toLowerCase();
    return (
      !search ||
      entry.tile.name.toLowerCase().includes(search) ||
      entry.sourceFileName.toLowerCase().includes(search) ||
      positionLabel.includes(search)
    );
  });
  const selectedRegionTileIds =
    regionStartTileId && regionEndTileId
      ? buildTileRegionSelection(filteredTileEntries, regionStartTileId, regionEndTileId)
      : [];
  const previewTileId = selectedRegionTileIds[0] ?? focusedTileId ?? props.selectedPaintTileId;
  const previewTile = props.project.tiles.find((tile) => tile.tileId === previewTileId) ?? null;
  const previewEntry = filteredTileEntries.find((entry) => entry.tile.tileId === previewTileId) ?? null;

  useEffect(() => {
    if (props.tab !== "tiles") return;
    setFocusedTileId(
      (current) => current || props.selectedPaintTileId || filteredTileEntries[0]?.tile.tileId || 0,
    );
  }, [filteredTileEntries, props.selectedPaintTileId, props.tab]);

  useEffect(() => {
    if (props.tab !== "tiles") return;
    modalRef.current?.focus();
  }, [props.tab]);

  function moveTileFocus(delta: "left" | "right" | "up" | "down") {
    if (!filteredTileEntries.length) return;
    const currentIndex = Math.max(
      0,
      filteredTileEntries.findIndex((entry) => entry.tile.tileId === focusedTileId),
    );
    const currentEntry = filteredTileEntries[currentIndex] ?? filteredTileEntries[0];
    let nextEntry = currentEntry;
    if (delta === "left") {
      nextEntry = filteredTileEntries[Math.max(0, currentIndex - 1)];
    } else if (delta === "right") {
      nextEntry = filteredTileEntries[Math.min(filteredTileEntries.length - 1, currentIndex + 1)];
    } else {
      const rowDelta = delta === "up" ? -1 : 1;
      nextEntry =
        filteredTileEntries.find(
          (entry) =>
            entry.row === (currentEntry.row ?? 0) + rowDelta && entry.column === currentEntry.column,
        ) ?? currentEntry;
    }
    setFocusedTileId(nextEntry.tile.tileId);
  }

  function handleTilePointerDown(tileId: number) {
    setFocusedTileId(tileId);
    setRegionStartTileId(tileId);
    setRegionEndTileId(tileId);
  }

  function handleTilePointerEnter(event: ReactPointerEvent<HTMLButtonElement>, tileId: number) {
    setFocusedTileId(tileId);
    if (event.buttons === 1 && regionStartTileId) {
      setRegionEndTileId(tileId);
    }
  }

  function handleTilePointerUp(tileId: number) {
    const regionTileIds =
      regionStartTileId !== null
        ? buildTileRegionSelection(filteredTileEntries, regionStartTileId, regionEndTileId ?? tileId)
        : [];
    if (regionTileIds.length <= 1) {
      props.onSelectTile(tileId);
    }
    setRegionEndTileId(tileId);
  }

  return (
    <div className="picker-overlay" onClick={props.onClose}>
      <section
        ref={modalRef}
        className="panel tile-picker-modal"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (props.tab !== "tiles") return;
          if (event.key === "ArrowLeft") { event.preventDefault(); moveTileFocus("left"); }
          if (event.key === "ArrowRight") { event.preventDefault(); moveTileFocus("right"); }
          if (event.key === "ArrowUp") { event.preventDefault(); moveTileFocus("up"); }
          if (event.key === "ArrowDown") { event.preventDefault(); moveTileFocus("down"); }
          if (event.key === "Enter" && focusedTileId) { event.preventDefault(); props.onSelectTile(focusedTileId); }
        }}
        tabIndex={0}
      >
        <div className="picker-search-row">
          <input
            className="picker-search"
            value={props.search}
            placeholder="Search slices, tiles, brushes, source names, or coordinates"
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
          <button className="ghost picker-close" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="picker-tabs">
          <button
            className={props.tab === "tiles" ? "secondary active" : "ghost"}
            onClick={() => props.onTabChange("tiles")}
          >
            Tiles
          </button>
          <button
            className={props.tab === "slices" ? "secondary active" : "ghost"}
            onClick={() => props.onTabChange("slices")}
          >
            Slices
          </button>
          <button
            className={props.tab === "terrain" ? "secondary active" : "ghost"}
            onClick={() => props.onTabChange("terrain")}
          >
            Brushes
          </button>
          <button
            className={props.tab === "animated" ? "secondary active" : "ghost"}
            onClick={() => props.onTabChange("animated")}
          >
            Animated
          </button>
        </div>
        {props.tab === "slices" ? (
          <div className="tray-layout">
            <div className="tray-column">
              <h3>Sources</h3>
              <div className="asset-list">
                {filteredSources.map((source) => (
                  <button
                    key={source.id}
                    className={source.id === props.selectedSourceImageId ? "asset-card active" : "asset-card"}
                    onClick={() => props.onSelectSource(source.id)}
                  >
                    <strong>{source.fileName}</strong>
                    <span>
                      {source.width} x {source.height}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="tray-column">
              <div className="picker-section-header">
                <strong>Imported Slices</strong>
                <button
                  className="primary"
                  onClick={props.onAddSelectedSlicesToLevel}
                  disabled={props.selectedSliceIds.length === 0}
                >
                  Add To Level
                </button>
              </div>
              {(() => {
                const slicePositions = filteredSlices.map((s) => parseTileGridPosition(s.name));
                const maxCol = slicePositions.reduce((m, p) => (p ? Math.max(m, p.column) : m), -1);
                const gridCols = maxCol >= 0 ? maxCol + 1 : undefined;
                return (
                  <div className="dense-picker-container" style={{ maxHeight: 500 }}>
                    <div
                      className="dense-picker-grid"
                      style={gridCols ? { gridTemplateColumns: `repeat(${gridCols}, auto)` } : undefined}
                    >
                      {filteredSlices.map((slice, i) => {
                        const position = slicePositions[i];
                        return (
                          <button
                            key={slice.id}
                            className={
                              props.selectedSliceIds.includes(slice.id)
                                ? "dense-tile-btn active"
                                : "dense-tile-btn"
                            }
                            onClick={() => props.onToggleSlice(slice.id)}
                            title={`${slice.name} (${slice.kind}) ${formatTilePosition(position?.row, position?.column)}`}
                            style={
                              position
                                ? { gridRow: position.row + 1, gridColumn: position.column + 1 }
                                : undefined
                            }
                          >
                            <SliceAssetPreview project={props.project} slice={slice} />
                            <div className="dense-tile-label">
                              {slice.name}
                              {position ? ` · ${formatTilePosition(position.row, position.column)}` : ""}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : props.tab === "tiles" ? (
          <>
            <div className="picker-section-header">
              <div className="picker-tile-toolbar">
                <strong>{props.level?.name ?? "No level selected"}</strong>
                <div className="picker-filter-row">
                  {(["all", "recent", "pinned"] as const).map((filter) => (
                    <button
                      key={filter}
                      className={tileFilter === filter ? "secondary active" : "ghost"}
                      onClick={() => setTileFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                  <select value={tileSourceFilter} onChange={(event) => setTileSourceFilter(event.target.value)}>
                    <option value="all">All sources</option>
                    {props.sourceImages.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.fileName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <span>{filteredTileEntries.length} tiles</span>
            </div>
            <div className="picker-tile-layout">
              <aside className="panel picker-tile-preview">
                <div className="picker-tile-preview-media">
                  <TileAssetPreview project={props.project} tile={previewTile} scale={8} />
                </div>
                <strong>{previewTile?.name ?? "No tile selected"}</strong>
                <span>{previewTile ? `#${previewTile.tileId}` : "Hover, arrow through, or click a tile"}</span>
                <span>{previewEntry ? formatTilePosition(previewEntry.row, previewEntry.column) : ""}</span>
                {previewEntry?.sourceFileName ? <span>{previewEntry.sourceFileName}</span> : null}
                <div className="picker-preview-actions">
                  {previewTile ? (
                    <button
                      className={
                        props.pinnedTileIds.includes(previewTile.tileId) ? "secondary active" : "ghost"
                      }
                      onClick={() => props.onTogglePinnedTile(previewTile.tileId)}
                    >
                      {props.pinnedTileIds.includes(previewTile.tileId) ? "Unpin" : "Pin"}
                    </button>
                  ) : null}
                  {selectedRegionTileIds.length > 1 ? (
                    <>
                      <button
                        className="secondary"
                        onClick={() => props.onPinTileRegion(selectedRegionTileIds)}
                      >
                        Pin Region
                      </button>
                      <button
                        className="primary"
                        onClick={() => props.onSelectTile(selectedRegionTileIds[0])}
                      >
                        Use First Tile
                      </button>
                    </>
                  ) : null}
                </div>
              </aside>
              <div className="dense-picker-container">
                <div className="dense-picker-grid">
                  {filteredTileEntries.map(({ tile, row, column }) => {
                    const isRegionSelected = selectedRegionTileIds.includes(tile.tileId);
                    const positionLabel = formatTilePosition(row, column);
                    return (
                      <button
                        key={tile.tileId}
                        className={
                          tile.tileId === props.selectedPaintTileId
                            ? "dense-tile-btn active"
                            : isRegionSelected
                              ? "dense-tile-btn dense-tile-btn-region"
                              : focusedTileId === tile.tileId
                                ? "dense-tile-btn dense-tile-btn-focus"
                                : "dense-tile-btn"
                        }
                        onPointerDown={() => handleTilePointerDown(tile.tileId)}
                        onPointerEnter={(event) => handleTilePointerEnter(event, tile.tileId)}
                        onPointerUp={() => handleTilePointerUp(tile.tileId)}
                        onMouseEnter={() => setFocusedTileId(tile.tileId)}
                        title={`${tile.name} (#${tile.tileId}) ${positionLabel}`}
                        style={
                          row !== undefined && column !== undefined
                            ? { gridRow: row + 1, gridColumn: column + 1 }
                            : undefined
                        }
                      >
                        <TileAssetPreview project={props.project} tile={tile} />
                        <div className="dense-tile-label">
                          {tile.name}
                          {positionLabel ? ` · ${positionLabel}` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        ) : props.tab === "animated" ? (
          <AnimatedTilePanel
            project={props.project}
            animatedTiles={props.animatedTiles}
            selectedAnimatedTileId={props.selectedAnimatedTileId}
            onSelect={props.onSelectAnimatedTile}
            onCreate={props.onCreateAnimatedTile}
            onRemove={props.onRemoveAnimatedTile}
            onUpdate={props.onUpdateAnimatedTile}
          />
        ) : (
          <div className="picker-terrain-layout">
            <div className="picker-terrain-list">
              <div className="picker-section-header">
                {editingBrush ? (
                  <>
                    <button className="ghost" onClick={() => setEditingBrush(false)}>
                      ← Back
                    </button>
                    <strong>Brush Tiles</strong>
                    {selectedTerrainSet?.mode === "cardinal" ? (
                      <button
                        className="primary"
                        onClick={() => {
                          const currentTile = props.project.tiles.find(
                            (tile) => tile.tileId === props.selectedPaintTileId,
                          );
                          if (!currentTile || tileEntries.length === 0) return;
                          const position = parseTileGridPosition(currentTile.name);
                          if (!position) return;
                          const lookup = buildTileGridLookup(tileEntries.map((entry) => entry.tile));
                          const newSlots = buildCardinalAutoAssignSlots(lookup, position.row, position.column);
                          props.onUpdateTerrainSet({
                            ...selectedTerrainSet,
                            slots: { ...selectedTerrainSet.slots, ...newSlots },
                          });
                        }}
                      >
                        Auto-Map (4x4)
                      </button>
                    ) : null}
                    {selectedTerrainSet?.mode === "subtile" || selectedTerrainSet?.mode === "rpgmaker" ? (
                      <button
                        className="primary"
                        onClick={() => {
                          const currentTile = props.project.tiles.find(
                            (tile) => tile.tileId === props.selectedPaintTileId,
                          );
                          if (!currentTile || tileEntries.length === 0) return;
                          const position = parseTileGridPosition(currentTile.name);
                          if (!position) return;
                          const lookup = buildTileGridLookup(tileEntries.map((entry) => entry.tile));
                          const newSlots = buildRpgMakerAutoAssignSlots(lookup, position.row, position.column);
                          props.onUpdateTerrainSet({
                            ...selectedTerrainSet,
                            slots: { ...selectedTerrainSet.slots, ...newSlots },
                          });
                        }}
                      >
                        Auto-Map (4x6)
                      </button>
                    ) : null}
                    {selectedTerrainSet?.mode === "blob47" ? (
                      <button
                        className="primary"
                        onClick={() => {
                          const currentTile = props.project.tiles.find(
                            (tile) => tile.tileId === props.selectedPaintTileId,
                          );
                          if (!currentTile || tileEntries.length === 0) return;
                          const position = parseTileGridPosition(currentTile.name);
                          if (!position) return;
                          const lookup = buildTileGridLookup(tileEntries.map((entry) => entry.tile));
                          const newSlots = buildBlob47AutoAssignSlots(lookup, position.row, position.column);
                          props.onUpdateTerrainSet({
                            ...selectedTerrainSet,
                            slots: { ...selectedTerrainSet.slots, ...newSlots },
                          });
                        }}
                      >
                        Auto-Map (8x6)
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <strong>Brush Sets</strong>
                    <button className="ghost" onClick={props.onCreateTerrainSet}>
                      New Set
                    </button>
                  </>
                )}
              </div>
              <div className={editingBrush ? "dense-picker-container" : "picker-grid picker-grid-terrain"}>
                {editingBrush ? (
                  <div className="dense-picker-grid">
                    {tileEntries.map(({ tile, row, column }) => (
                      <button
                        key={tile.tileId}
                        className={
                          tile.tileId === props.selectedPaintTileId
                            ? "dense-tile-btn active"
                            : "dense-tile-btn"
                        }
                        onClick={() => props.onSetPaintTile(tile.tileId)}
                        title={`${tile.name} (#${tile.tileId}) ${formatTilePosition(row, column)}`}
                        style={
                          row !== undefined && column !== undefined
                            ? { gridRow: row + 1, gridColumn: column + 1 }
                            : undefined
                        }
                      >
                        <TileAssetPreview project={props.project} tile={tile} />
                        <div className="dense-tile-label">
                          {tile.name}
                          {row !== undefined && column !== undefined
                            ? ` · ${formatTilePosition(row, column)}`
                            : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  filteredTerrainSets.map((terrainSet) => {
                    const centerTile =
                      props.project.tiles.find(
                        (tile) => tile.tileId === getTerrainSetMarkerTileId(terrainSet),
                      ) ?? null;
                    return (
                      <div key={terrainSet.id} className="picker-terrain-card-wrapper">
                        <button
                          className={
                            terrainSet.id === selectedTerrainSet?.id
                              ? "tile-picker-card active"
                              : "tile-picker-card"
                          }
                          onClick={() => props.onSelectTerrainSet(terrainSet.id)}
                        >
                          <TileAssetPreview project={props.project} tile={centerTile} />
                          <strong>{terrainSet.name}</strong>
                        </button>
                        <div className="picker-terrain-actions">
                          <button
                            className="ghost picker-terrain-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              props.onSelectTerrainSet(terrainSet.id);
                              setEditingBrush(true);
                            }}
                          >
                            ✎
                          </button>
                          <button
                            className="ghost picker-terrain-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              props.onRemoveTerrainSet(terrainSet.id);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div className="picker-terrain-editor">
              <div className="picker-section-header">
                <strong>{selectedTerrainSet ? selectedTerrainSet.name : "No brush selected"}</strong>
                <div className="header-options">
                  {selectedTerrainSet ? (
                    <label>
                      Mode
                      <select
                        value={selectedTerrainSet.mode}
                        onChange={(event) =>
                          props.onUpdateTerrainSet({
                            ...selectedTerrainSet,
                            mode: event.target.value as AutotileMode,
                          })
                        }
                      >
                        <option value="cardinal">Cardinal</option>
                        <option value="subtile">Subtile</option>
                        <option value="blob47">Blob 47</option>
                        <option value="rpgmaker">RPG Maker (A2)</option>
                      </select>
                    </label>
                  ) : null}
                  {selectedTerrainSet && !editingBrush ? (
                    <button className="secondary" onClick={() => setEditingBrush(true)}>
                      Edit Tiles
                    </button>
                  ) : null}
                </div>
              </div>
              {selectedTerrainSet ? (
                <div className="terrain-blob-editor">
                  {selectedTerrainSet.mode === "subtile" || selectedTerrainSet.mode === "rpgmaker" ? (
                    <div className="terrain-dense-group">
                      <div className="terrain-inner-grid-header">Subtile Pieces (4x6 Spatial Layout)</div>
                      <div className="dense-picker-grid" style={{ gridTemplateColumns: "repeat(4, 96px)" }}>
                        {getSubtileLayoutSlots().map(({ slot, row, column }) => {
                          const tileId = selectedTerrainSet.slots[slot];
                          const tile = tileId
                            ? props.project.tiles.find((entry) => entry.tileId === tileId) ?? null
                            : null;
                          return (
                            <button
                              key={slot}
                              className="dense-tile-btn brush-slot-btn"
                              onClick={() => props.onAssignTerrainSlot(slot)}
                              title={`${getSubtileSlotLabel(slot)} (${slot})`}
                              style={{ gridRow: row + 1, gridColumn: column + 1 }}
                            >
                              {tile ? (
                                <TileAssetPreview project={props.project} tile={tile} scale={6} />
                              ) : (
                                <div className="tile-placeholder" />
                              )}
                              <div className="dense-tile-label">{getSubtileSlotLabel(slot)}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : selectedTerrainSet.mode === "blob47" ? (
                    <div className="terrain-dense-group">
                      <div className="terrain-inner-grid-header">Blob 47 Grid (8x6 Spatial Layout)</div>
                      <div className="dense-picker-grid" style={{ gridTemplateColumns: "repeat(8, 96px)" }}>
                        {BLOB47_LAYOUT_SLOTS.map(({ slot, row, column }) => {
                          const tileId = selectedTerrainSet.slots[slot];
                          const tile = tileId
                            ? props.project.tiles.find((entry) => entry.tileId === tileId) ?? null
                            : null;
                          return (
                            <button
                              key={slot}
                              className="dense-tile-btn brush-slot-btn"
                              onClick={() => props.onAssignTerrainSlot(slot)}
                              title={`Blob ${slot}`}
                              style={{ gridRow: row + 1, gridColumn: column + 1 }}
                            >
                              {tile ? (
                                <TileAssetPreview project={props.project} tile={tile} scale={6} />
                              ) : (
                                <div className="tile-placeholder" />
                              )}
                              <div className="dense-tile-label">Blob {slot}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="terrain-dense-group">
                      <div className="terrain-inner-grid-header">Cardinal 4x4 Grid</div>
                      <div className="dense-picker-grid" style={{ gridTemplateColumns: "repeat(4, 96px)" }}>
                        {CARDINAL_LAYOUT_MASKS.map((mask) => {
                          const tileId = selectedTerrainSet.slots[mask];
                          const tile = tileId
                            ? props.project.tiles.find((entry) => entry.tileId === tileId) ?? null
                            : null;
                          return (
                            <button
                              key={mask}
                              className="dense-tile-btn brush-slot-btn"
                              onClick={() => props.onAssignTerrainSlot(mask)}
                            >
                              <TileAssetPreview project={props.project} tile={tile} scale={6} />
                              <div className="dense-tile-label">{getCardinalMaskLabel(mask)}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-note">Create or select a brush set to begin.</div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
