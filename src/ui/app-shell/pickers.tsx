import { useState, type DragEvent } from "react";
import { getEffectiveLevelTileIds } from "../../model/selectors";
import { getTerrainSetMarkerTileId } from "../../terrain";
import type { AutotileMode, LevelDocument, ProjectDocument, SliceAsset, SourceImageAsset, TerrainSet, TilesetTileAsset } from "../../types";
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

export function AtlasAssetsPanel(props: {
  project: ProjectDocument;
  sourceImages: SourceImageAsset[];
  selectedSourceImageId: string | null;
  atlasSprites: Array<{ sprite: ProjectDocument["sprites"][number]; slice: SliceAsset | null }>;
  onSelectSource: (sourceImageId: string) => void;
  onDragStart: (index: number) => void;
  onDrop: (toIndex: number) => void;
}) {
  return (
    <>
      <div className="panel-header">
        <h2>Atlas Assets</h2>
        <span>Visible while packing</span>
      </div>
      <div className="asset-list">
        {props.sourceImages.map((source) => (
          <button key={source.id} className={source.id === props.selectedSourceImageId ? "asset-card active" : "asset-card"} onClick={() => props.onSelectSource(source.id)}>
            <strong>{source.fileName}</strong>
            <span>
              {source.width} x {source.height}
            </span>
          </button>
        ))}
      </div>
      <div className="panel-header">
        <h2>Draw Order</h2>
        <span>Drag to reprioritize packing</span>
      </div>
      <div className="dense-picker-container" style={{ flex: 1 }}>
        <div className="dense-picker-grid">
          {props.atlasSprites.map((entry, index) => (
            <div
              key={entry.sprite.id}
              className="dense-tile-btn atlas-drag-card"
              draggable
              onDragStart={() => props.onDragStart(index)}
              onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
              onDrop={() => props.onDrop(index)}
              title={`${entry.sprite.name} (#${entry.sprite.id})`}
            >
              <SliceAssetPreview project={props.project} slice={entry.slice} />
              <div className="dense-tile-label">{entry.sprite.name}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function LevelAssetPicker(props: {
  project: ProjectDocument;
  level: LevelDocument | null;
  sourceImages: SourceImageAsset[];
  selectedSourceImageId: string | null;
  selectedSliceIds: string[];
  selectedPaintTileId: number;
  selectedTerrainSetId: number | null;
  terrainSets: TerrainSet[];
  search: string;
  tab: "slices" | "tiles" | "terrain";
  onSearchChange: (value: string) => void;
  onTabChange: (tab: "slices" | "tiles" | "terrain") => void;
  onClose: () => void;
  onSelectSource: (sourceImageId: string) => void;
  onToggleSlice: (sliceId: string) => void;
  onAddSelectedSlicesToLevel: () => void;
  onSelectTile: (tileId: number) => void;
  onSetPaintTile: (tileId: number) => void;
  onSelectTerrainSet: (terrainSetId: number) => void;
  onSetTerrainSet: (terrainSetId: number) => void;
  onRemoveTerrainSet: (terrainSetId: number) => void;
  onCreateTerrainSet: () => void;
  onAssignTerrainSlot: (slot: keyof TerrainSet["slots"]) => void;
  onUpdateTerrainSet: (terrainSet: TerrainSet) => void;
}) {
  const [editingBrush, setEditingBrush] = useState(false);
  const search = props.search.trim().toLowerCase();
  const effectiveLevelTileIds = getEffectiveLevelTileIds(props.project, props.level);
  const selectedTerrainSet =
    props.terrainSets.find((terrainSet) => terrainSet.id === props.selectedTerrainSetId) ?? props.terrainSets[0] ?? null;
  const filteredSources = props.sourceImages.filter((source) => !search || source.fileName.toLowerCase().includes(search));
  const filteredSlices = props.project.slices.filter(
    (slice) => slice.sourceImageId === props.selectedSourceImageId && (!search || slice.name.toLowerCase().includes(search)),
  );
  const tiles = props.level
    ? effectiveLevelTileIds
        .map((tileId) => props.project.tiles.find((tile) => tile.tileId === tileId))
        .filter((tile): tile is TilesetTileAsset => Boolean(tile))
        .filter((tile) => !search || tile.name.toLowerCase().includes(search))
    : [];
  const filteredTerrainSets = props.terrainSets.filter((terrainSet) => !search || terrainSet.name.toLowerCase().includes(search));

  return (
    <div className="picker-overlay" onClick={props.onClose}>
      <section className="panel tile-picker-modal" onClick={(event) => event.stopPropagation()}>
        <div className="picker-search-row">
          <input className="picker-search" value={props.search} placeholder="Search slices, tiles, or brushes" onChange={(event) => props.onSearchChange(event.target.value)} />
          <button className="ghost picker-close" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="picker-tabs">
          <button className={props.tab === "tiles" ? "secondary active" : "ghost"} onClick={() => props.onTabChange("tiles")}>Tiles</button>
          <button className={props.tab === "slices" ? "secondary active" : "ghost"} onClick={() => props.onTabChange("slices")}>Slices</button>
          <button className={props.tab === "terrain" ? "secondary active" : "ghost"} onClick={() => props.onTabChange("terrain")}>Brushes</button>
        </div>
        {props.tab === "slices" ? (
          <div className="tray-layout">
            <div className="tray-column">
              <h3>Sources</h3>
              <div className="asset-list">
                {filteredSources.map((source) => (
                  <button key={source.id} className={source.id === props.selectedSourceImageId ? "asset-card active" : "asset-card"} onClick={() => props.onSelectSource(source.id)}>
                    <strong>{source.fileName}</strong>
                    <span>{source.width} x {source.height}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="tray-column">
              <div className="picker-section-header">
                <strong>Imported Slices</strong>
                <button className="primary" onClick={props.onAddSelectedSlicesToLevel} disabled={props.selectedSliceIds.length === 0}>Add To Level</button>
              </div>
              <div className="dense-picker-container" style={{ maxHeight: 500 }}>
                <div className="dense-picker-grid">
                  {filteredSlices.map((slice) => {
                    const position = parseTileGridPosition(slice.name);
                    return (
                      <button
                        key={slice.id}
                        className={props.selectedSliceIds.includes(slice.id) ? "dense-tile-btn active" : "dense-tile-btn"}
                        onClick={() => props.onToggleSlice(slice.id)}
                        title={`${slice.name} (${slice.kind})`}
                        style={position ? { gridRow: position.row + 1, gridColumn: position.column + 1 } : undefined}
                      >
                        <SliceAssetPreview project={props.project} slice={slice} />
                        <div className="dense-tile-label">{slice.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : props.tab === "tiles" ? (
          <>
            <div className="picker-section-header">
              <strong>{props.level?.name ?? "No level selected"}</strong>
              <span>{tiles.length} tiles</span>
            </div>
            <div className="dense-picker-container">
              <div className="dense-picker-grid">
                {tiles.map((tile) => {
                  const position = parseTileGridPosition(tile.name);
                  return (
                    <button
                      key={tile.tileId}
                      className={tile.tileId === props.selectedPaintTileId ? "dense-tile-btn active" : "dense-tile-btn"}
                      onClick={() => props.onSelectTile(tile.tileId)}
                      title={`${tile.name} (#${tile.tileId})`}
                      style={position ? { gridRow: position.row + 1, gridColumn: position.column + 1 } : undefined}
                    >
                      <TileAssetPreview project={props.project} tile={tile} />
                      <div className="dense-tile-label">{tile.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="picker-terrain-layout">
            <div className="picker-terrain-list">
              <div className="picker-section-header">
                {editingBrush ? (
                  <>
                    <button className="ghost" onClick={() => setEditingBrush(false)}>← Back</button>
                    <strong>Brush Tiles</strong>
                    {selectedTerrainSet?.mode === "cardinal" ? (
                      <button
                        className="primary"
                        onClick={() => {
                          const currentTile = props.project.tiles.find((tile) => tile.tileId === props.selectedPaintTileId);
                          if (!currentTile || tiles.length === 0) return;
                          const position = parseTileGridPosition(currentTile.name);
                          if (!position) return;
                          const lookup = buildTileGridLookup(tiles);
                          const newSlots = buildCardinalAutoAssignSlots(lookup, position.row, position.column);
                          props.onUpdateTerrainSet({ ...selectedTerrainSet, slots: { ...selectedTerrainSet.slots, ...newSlots } });
                        }}
                      >
                        Auto-Map (4x4)
                      </button>
                    ) : null}
                    {selectedTerrainSet?.mode === "subtile" || selectedTerrainSet?.mode === "rpgmaker" ? (
                      <button
                        className="primary"
                        onClick={() => {
                          const currentTile = props.project.tiles.find((tile) => tile.tileId === props.selectedPaintTileId);
                          if (!currentTile || tiles.length === 0) return;
                          const position = parseTileGridPosition(currentTile.name);
                          if (!position) return;
                          const lookup = buildTileGridLookup(tiles);
                          const newSlots = buildRpgMakerAutoAssignSlots(lookup, position.row, position.column);
                          props.onUpdateTerrainSet({ ...selectedTerrainSet, slots: { ...selectedTerrainSet.slots, ...newSlots } });
                        }}
                      >
                        Auto-Map (4x6)
                      </button>
                    ) : null}
                    {selectedTerrainSet?.mode === "blob47" ? (
                      <button
                        className="primary"
                        onClick={() => {
                          const currentTile = props.project.tiles.find((tile) => tile.tileId === props.selectedPaintTileId);
                          if (!currentTile || tiles.length === 0) return;
                          const position = parseTileGridPosition(currentTile.name);
                          if (!position) return;
                          const lookup = buildTileGridLookup(tiles);
                          const newSlots = buildBlob47AutoAssignSlots(lookup, position.row, position.column);
                          props.onUpdateTerrainSet({ ...selectedTerrainSet, slots: { ...selectedTerrainSet.slots, ...newSlots } });
                        }}
                      >
                        Auto-Map (8x6)
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <strong>Brush Sets</strong>
                    <button className="ghost" onClick={props.onCreateTerrainSet}>New Set</button>
                  </>
                )}
              </div>
              <div className={editingBrush ? "dense-picker-container" : "picker-grid picker-grid-terrain"}>
                {editingBrush ? (
                  <div className="dense-picker-grid">
                    {tiles.map((tile) => {
                      const position = parseTileGridPosition(tile.name);
                      return (
                        <button
                          key={tile.tileId}
                          className={tile.tileId === props.selectedPaintTileId ? "dense-tile-btn active" : "dense-tile-btn"}
                          onClick={() => props.onSetPaintTile(tile.tileId)}
                          title={`${tile.name} (#${tile.tileId})`}
                          style={position ? { gridRow: position.row + 1, gridColumn: position.column + 1 } : undefined}
                        >
                          <TileAssetPreview project={props.project} tile={tile} />
                          <div className="dense-tile-label">{tile.name}</div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  filteredTerrainSets.map((terrainSet) => {
                    const centerTile = props.project.tiles.find((tile) => tile.tileId === getTerrainSetMarkerTileId(terrainSet)) ?? null;
                    return (
                      <div key={terrainSet.id} className="picker-terrain-card-wrapper">
                        <button className={terrainSet.id === selectedTerrainSet?.id ? "tile-picker-card active" : "tile-picker-card"} onClick={() => props.onSelectTerrainSet(terrainSet.id)}>
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
                    <button className="secondary" onClick={() => setEditingBrush(true)}>Edit Tiles</button>
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
                          const tile = tileId ? props.project.tiles.find((entry) => entry.tileId === tileId) ?? null : null;
                          return (
                            <button
                              key={slot}
                              className="dense-tile-btn brush-slot-btn"
                              onClick={() => props.onAssignTerrainSlot(slot)}
                              title={`${getSubtileSlotLabel(slot)} (${slot})`}
                              style={{ gridRow: row + 1, gridColumn: column + 1 }}
                            >
                              {tile ? <TileAssetPreview project={props.project} tile={tile} scale={6} /> : <div className="tile-placeholder" />}
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
                          const tile = tileId ? props.project.tiles.find((entry) => entry.tileId === tileId) ?? null : null;
                          return (
                            <button
                              key={slot}
                              className="dense-tile-btn brush-slot-btn"
                              onClick={() => props.onAssignTerrainSlot(slot)}
                              title={`Blob ${slot}`}
                              style={{ gridRow: row + 1, gridColumn: column + 1 }}
                            >
                              {tile ? <TileAssetPreview project={props.project} tile={tile} scale={6} /> : <div className="tile-placeholder" />}
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
                          const tile = tileId ? props.project.tiles.find((entry) => entry.tileId === tileId) ?? null : null;
                          return (
                            <button key={mask} className="dense-tile-btn brush-slot-btn" onClick={() => props.onAssignTerrainSlot(mask)}>
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
