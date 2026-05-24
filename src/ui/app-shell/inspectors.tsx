import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  BuildOptions,
  GridSliceOptions,
  LevelTool,
  ManualSliceRect,
  PackedAtlas,
  ProjectAction,
  ProjectDocument,
  SliceKind,
  SourceImageAsset,
  TerrainSet,
  TilesetTileAsset,
} from "../../types";
import { formatBytes } from "../../utils";
import { getTerrainSetMarkerTileId } from "../../terrain";
import type { SlicerCanvasTool } from "./constants";
import { TileAssetPreview } from "./shared";

function DraftNumberInput(props: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(() => String(props.value));

  useEffect(() => {
    setDraft(String(props.value));
  }, [props.value]);

  function commit(nextDraft: string) {
    if (nextDraft.trim() === "" || nextDraft === "-" || nextDraft === "." || nextDraft === "-.") {
      setDraft(String(props.value));
      return;
    }
    const parsed = Number(nextDraft);
    if (Number.isNaN(parsed)) {
      setDraft(String(props.value));
      return;
    }
    const nextValue = props.min !== undefined ? Math.max(props.min, parsed) : parsed;
    props.onCommit(nextValue);
    setDraft(String(nextValue));
  }

  return (
    <input
      type="number"
      min={props.min}
      step={props.step}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit((event.target as HTMLInputElement).value);
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function RecentLevelAssetsSection(props: {
  project: ProjectDocument;
  recentTileIds: number[];
  recentTerrainSetIds: number[];
  onSelectRecentTile: (tileId: number) => void;
  onSelectRecentTerrainSet: (terrainSetId: number) => void;
}) {
  const recentTiles = props.recentTileIds
    .map((tileId) => props.project.tiles.find((tile) => tile.tileId === tileId) ?? null)
    .filter((tile): tile is TilesetTileAsset => Boolean(tile));
  const recentTerrainSets = props.recentTerrainSetIds
    .map((terrainSetId) => props.project.terrainSets.find((terrainSet) => terrainSet.id === terrainSetId) ?? null)
    .filter((terrainSet): terrainSet is TerrainSet => Boolean(terrainSet));

  if (!recentTiles.length && !recentTerrainSets.length) {
    return null;
  }

  return (
    <div className="inspector-section">
      {recentTiles.length ? (
        <div className="inspector-subsection">
          <div className="inspector-subheader">
            <strong>Recent Tiles</strong>
          </div>
          <div className="recent-chip-list">
            {recentTiles.map((tile) => (
              <button key={tile.tileId} className="recent-chip" onClick={() => props.onSelectRecentTile(tile.tileId)}>
                <TileAssetPreview project={props.project} tile={tile} />
                <span>{tile.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {recentTerrainSets.length ? (
        <div className="inspector-subsection">
          <div className="inspector-subheader">
            <strong>Recent Brushes</strong>
          </div>
          <div className="recent-chip-list recent-chip-list-terrain">
            {recentTerrainSets.map((terrainSet) => {
              const centerTile =
                props.project.tiles.find((tile) => tile.tileId === getTerrainSetMarkerTileId(terrainSet)) ?? null;
              return (
                <button key={terrainSet.id} className="recent-chip" onClick={() => props.onSelectRecentTerrainSet(terrainSet.id)}>
                  <TileAssetPreview project={props.project} tile={centerTile} />
                  <span>{terrainSet.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AtlasInspector(props: {
  atlas: PackedAtlas | null;
  settings: BuildOptions;
  module: "pack" | "slicer";
  source: SourceImageAsset | null;
  gridOptions: GridSliceOptions;
  manualRects: ManualSliceRect[];
  selectedManualRectIndex: number | null;
  manualRectCount: number;
  slicerCanvasTool: SlicerCanvasTool;
  manualKind: SliceKind;
  manualDraft: ManualSliceRect;
  slicerMode: "grid" | "manual";
  dispatch: Dispatch<ProjectAction>;
  onGridOptionsChange: Dispatch<SetStateAction<GridSliceOptions>>;
  onManualKindChange: Dispatch<SetStateAction<SliceKind>>;
  onManualDraftChange: (patch: Partial<ManualSliceRect>) => void;
  onSlicerCanvasToolChange: (tool: SlicerCanvasTool) => void;
  onSlicerModeChange: (mode: "grid" | "manual") => void;
  onClearManual: () => void;
  onManualRectNameChange: (index: number, name: string) => void;
  onManualRectRemove: (index: number) => void;
  onManualRectSelect: (index: number | null) => void;
  onAddManualRect: () => void;
  selectedSliceCount: number;
  onAddSelectedToAtlas: () => void;
  onAddSelectedToLevel: () => void;
  currentLevelName: string | null;
  onCreateSlices: () => void;
  onSetModule: React.Dispatch<React.SetStateAction<"pack" | "slicer">>;
}) {
  return (
    <div className="inspector-list">
      <div className="mode-tools">
        <button className={props.module === "pack" ? "secondary active" : "ghost"} onClick={() => props.onSetModule("pack")}>
          Pack
        </button>
        <button className={props.module === "slicer" ? "secondary active" : "ghost"} onClick={() => props.onSetModule("slicer")}>
          Slice
        </button>
      </div>
      <label>
        Max Page Size
        <select
          value={props.settings.maxPageSize}
          onChange={(event) =>
            props.dispatch({
              type: "updateAtlasSettings",
              patch: { maxPageSize: Number(event.target.value) as BuildOptions["maxPageSize"] },
            })
          }
        >
          {[64, 128, 256, 512, 1024].map((size) => (
            <option key={size} value={size}>
              {size} x {size}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-row">
        <span>Allow rotation (unsupported by engine)</span>
        <input type="checkbox" checked={false} disabled />
      </label>
      <label>
        Padding
        <DraftNumberInput
          min={0}
          value={props.settings.padding}
          onCommit={(value) => props.dispatch({ type: "updateAtlasSettings", patch: { padding: value } })}
        />
      </label>
      <label>
        Extrusion
        <DraftNumberInput
          min={0}
          value={props.settings.extrusion}
          onCommit={(value) => props.dispatch({ type: "updateAtlasSettings", patch: { extrusion: value } })}
        />
      </label>
      <label className="checkbox-row">
        <span>Include hash table</span>
        <input
          type="checkbox"
          checked={props.settings.includeHashTable}
          onChange={(event) =>
            props.dispatch({ type: "updateAtlasSettings", patch: { includeHashTable: event.target.checked } })
          }
        />
      </label>
      <label className="checkbox-row">
        <span>Include debug JSON</span>
        <input
          type="checkbox"
          checked={props.settings.includeDebugJson}
          onChange={(event) =>
            props.dispatch({ type: "updateAtlasSettings", patch: { includeDebugJson: event.target.checked } })
          }
        />
      </label>
      <div className="list-row static">
        <strong>Pages</strong>
        <span>{props.atlas?.pages.length ?? 0}</span>
      </div>
      <div className="list-row static">
        <strong>Atlas Bin</strong>
        <span>{props.atlas ? formatBytes(props.atlas.atlasBin.byteLength) : "0 B"}</span>
      </div>
      <div className="list-row static">
        <strong>Meta Bin</strong>
        <span>{props.atlas ? formatBytes(props.atlas.atlasMetaBin.byteLength) : "0 B"}</span>
      </div>
      {props.module === "slicer" ? (
        <>
          <div className="list-row static">
            <strong>Source</strong>
            <span>{props.source?.fileName ?? "No source selected"}</span>
          </div>
          <div className="mode-tools">
            <button className={props.slicerMode === "grid" ? "secondary active" : "ghost"} onClick={() => props.onSlicerModeChange("grid")}>
              Grid
            </button>
            <button className={props.slicerMode === "manual" ? "secondary active" : "ghost"} onClick={() => props.onSlicerModeChange("manual")}>
              Manual
            </button>
          </div>
          {props.slicerMode === "grid" ? (
            <>
              <div className="inspector-row inspector-row-2">
                <label>
                  Frame Width
                  <DraftNumberInput
                    min={1}
                    value={props.gridOptions.frameWidth}
                    onCommit={(value) => props.onGridOptionsChange((current) => ({ ...current, frameWidth: value }))}
                  />
                </label>
                <label>
                  Frame Height
                  <DraftNumberInput
                    min={1}
                    value={props.gridOptions.frameHeight}
                    onCommit={(value) => props.onGridOptionsChange((current) => ({ ...current, frameHeight: value }))}
                  />
                </label>
              </div>
              <label>
                Name Prefix
                <input value={props.gridOptions.namePrefix} onChange={(event) => props.onGridOptionsChange((current) => ({ ...current, namePrefix: event.target.value }))} />
              </label>
              <div className="inspector-row inspector-row-2">
                <label>
                  Spacing X
                  <DraftNumberInput value={props.gridOptions.spacingX} min={0} onCommit={(value) => props.onGridOptionsChange((current) => ({ ...current, spacingX: value }))} />
                </label>
                <label>
                  Spacing Y
                  <DraftNumberInput value={props.gridOptions.spacingY} min={0} onCommit={(value) => props.onGridOptionsChange((current) => ({ ...current, spacingY: value }))} />
                </label>
              </div>
              <div className="inspector-row inspector-row-2">
                <label>
                  Margin X
                  <DraftNumberInput value={props.gridOptions.marginX} min={0} onCommit={(value) => props.onGridOptionsChange((current) => ({ ...current, marginX: value }))} />
                </label>
                <label>
                  Margin Y
                  <DraftNumberInput value={props.gridOptions.marginY} min={0} onCommit={(value) => props.onGridOptionsChange((current) => ({ ...current, marginY: value }))} />
                </label>
              </div>
              <div className="inspector-row inspector-row-2">
                <label>
                  End Offset X
                  <DraftNumberInput value={props.gridOptions.endOffsetX} min={0} onCommit={(value) => props.onGridOptionsChange((current) => ({ ...current, endOffsetX: value }))} />
                </label>
                <label>
                  End Offset Y
                  <DraftNumberInput value={props.gridOptions.endOffsetY} min={0} onCommit={(value) => props.onGridOptionsChange((current) => ({ ...current, endOffsetY: value }))} />
                </label>
              </div>
              <label className="checkbox-row">
                <span>Keep Empty</span>
                <input type="checkbox" checked={props.gridOptions.keepEmpty} onChange={(event) => props.onGridOptionsChange((current) => ({ ...current, keepEmpty: event.target.checked }))} />
              </label>
              <label>
                Slice Kind
                <select value={props.gridOptions.sliceKind} onChange={(event) => props.onGridOptionsChange((current) => ({ ...current, sliceKind: event.target.value as SliceKind }))}>
                  <option value="tile">Tile</option>
                  <option value="sprite">Sprite</option>
                  <option value="both">Both</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <div className="mode-tools">
                <button className={props.slicerCanvasTool === "draw" ? "secondary active" : "ghost"} onClick={() => props.onSlicerCanvasToolChange("draw")}>
                  Draw
                </button>
                <button className={props.slicerCanvasTool === "move" ? "secondary active" : "ghost"} onClick={() => props.onSlicerCanvasToolChange("move")}>
                  Move
                </button>
              </div>
              <label>
                Manual Kind
                <select value={props.manualKind} onChange={(event) => props.onManualKindChange(event.target.value as SliceKind)}>
                  <option value="tile">Tile</option>
                  <option value="sprite">Sprite</option>
                  <option value="both">Both</option>
                </select>
              </label>
              <label>
                Name
                <input value={props.manualDraft.name} onChange={(event) => props.onManualDraftChange({ name: event.target.value })} />
              </label>
              <div className="inspector-row inspector-row-2">
                <label>
                  X
                  <DraftNumberInput value={props.manualDraft.x} min={0} onCommit={(value) => props.onManualDraftChange({ x: value })} />
                </label>
                <label>
                  Y
                  <DraftNumberInput value={props.manualDraft.y} min={0} onCommit={(value) => props.onManualDraftChange({ y: value })} />
                </label>
              </div>
              <div className="inspector-row inspector-row-2">
                <label>
                  Width
                  <DraftNumberInput value={props.manualDraft.width} min={1} onCommit={(value) => props.onManualDraftChange({ width: value })} />
                </label>
                <label>
                  Height
                  <DraftNumberInput value={props.manualDraft.height} min={1} onCommit={(value) => props.onManualDraftChange({ height: value })} />
                </label>
              </div>
              <div className="list-row static">
                <strong>Manual Regions</strong>
                <span>{props.manualRectCount}</span>
              </div>
              <div className="manual-rect-list">
                {props.manualRects.length ? (
                  props.manualRects.map((rect, index) => (
                    <div
                      key={`${rect.name}-${rect.x}-${rect.y}-${index}`}
                      className={`manual-rect-row ${props.selectedManualRectIndex === index ? "active" : ""}`}
                      onClick={() => props.onManualRectSelect(index)}
                    >
                      <input
                        value={rect.name}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => props.onManualRectNameChange(index, event.target.value)}
                        placeholder={`slice_${index}`}
                      />
                      <span>
                        {rect.x},{rect.y} {rect.width}x{rect.height}
                      </span>
                      <button
                        className="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onManualRectRemove(index);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty-note">Drag on the atlas viewport to add manual slices.</div>
                )}
              </div>
              <button className="secondary" onClick={props.onAddManualRect}>
                Add Manual Region
              </button>
              <button className="ghost" onClick={props.onClearManual} disabled={props.manualRectCount === 0}>
                Clear Manual Regions
              </button>
            </>
          )}
          <button className="primary" onClick={props.onCreateSlices} disabled={!props.source}>
            Create Slices
          </button>
          <button className="secondary" onClick={props.onAddSelectedToAtlas} disabled={props.selectedSliceCount === 0}>
            Add Selected To Atlas
          </button>
          <button className="secondary" onClick={props.onAddSelectedToLevel} disabled={props.selectedSliceCount === 0 || !props.currentLevelName}>
            Add Selected To {props.currentLevelName ?? "Level"}
          </button>
        </>
      ) : null}
    </div>
  );
}

// TODO: NodeInspector components per scene node type (Phase 5)
