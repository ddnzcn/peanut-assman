import type { Dispatch, SetStateAction } from "react";
import type {
  BuildOptions,
  GridSliceOptions,
  LevelDocument,
  LevelLayer,
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
        <input
          type="number"
          min="0"
          value={props.settings.padding}
          onChange={(event) =>
            props.dispatch({ type: "updateAtlasSettings", patch: { padding: Math.max(0, Number(event.target.value) || 0) } })
          }
        />
      </label>
      <label>
        Extrusion
        <input
          type="number"
          min="0"
          value={props.settings.extrusion}
          onChange={(event) =>
            props.dispatch({
              type: "updateAtlasSettings",
              patch: { extrusion: Math.max(0, Number(event.target.value) || 0) },
            })
          }
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
                  <input
                    type="number"
                    min="1"
                    value={props.gridOptions.frameWidth}
                    onChange={(event) =>
                      props.onGridOptionsChange((current) => ({ ...current, frameWidth: Math.max(1, Number(event.target.value) || 1) }))
                    }
                  />
                </label>
                <label>
                  Frame Height
                  <input
                    type="number"
                    min="1"
                    value={props.gridOptions.frameHeight}
                    onChange={(event) =>
                      props.onGridOptionsChange((current) => ({ ...current, frameHeight: Math.max(1, Number(event.target.value) || 1) }))
                    }
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
                  <input type="number" value={props.gridOptions.spacingX} onChange={(event) => props.onGridOptionsChange((current) => ({ ...current, spacingX: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
                <label>
                  Spacing Y
                  <input type="number" value={props.gridOptions.spacingY} onChange={(event) => props.onGridOptionsChange((current) => ({ ...current, spacingY: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
              </div>
              <div className="inspector-row inspector-row-2">
                <label>
                  Margin X
                  <input type="number" value={props.gridOptions.marginX} onChange={(event) => props.onGridOptionsChange((current) => ({ ...current, marginX: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
                <label>
                  Margin Y
                  <input type="number" value={props.gridOptions.marginY} onChange={(event) => props.onGridOptionsChange((current) => ({ ...current, marginY: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
              </div>
              <div className="inspector-row inspector-row-2">
                <label>
                  End Offset X
                  <input type="number" value={props.gridOptions.endOffsetX} onChange={(event) => props.onGridOptionsChange((current) => ({ ...current, endOffsetX: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
                <label>
                  End Offset Y
                  <input type="number" value={props.gridOptions.endOffsetY} onChange={(event) => props.onGridOptionsChange((current) => ({ ...current, endOffsetY: Math.max(0, Number(event.target.value) || 0) }))} />
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
                  <input type="number" value={props.manualDraft.x} onChange={(event) => props.onManualDraftChange({ x: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
                <label>
                  Y
                  <input type="number" value={props.manualDraft.y} onChange={(event) => props.onManualDraftChange({ y: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
              </div>
              <div className="inspector-row inspector-row-2">
                <label>
                  Width
                  <input type="number" min="1" value={props.manualDraft.width} onChange={(event) => props.onManualDraftChange({ width: Math.max(1, Number(event.target.value) || 1) })} />
                </label>
                <label>
                  Height
                  <input type="number" min="1" value={props.manualDraft.height} onChange={(event) => props.onManualDraftChange({ height: Math.max(1, Number(event.target.value) || 1) })} />
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

export function LevelInspector(props: {
  level: LevelDocument;
  layer: LevelLayer;
  levelTool: LevelTool;
  dispatch: Dispatch<ProjectAction>;
  project: ProjectDocument;
  recentTileIds: number[];
  recentTerrainSetIds: number[];
  onSelectRecentTile: (tileId: number) => void;
  onSelectRecentTerrainSet: (terrainSetId: number) => void;
}) {
  function update(patch: Partial<LevelLayer>) {
    props.dispatch({
      type: "updateLevel",
      level: {
        ...props.level,
        layers: props.level.layers.map((entry) => (entry.id === props.layer.id ? { ...entry, ...patch } : entry)),
      },
    });
  }

  return (
    <div className="inspector-list">
      <label>
        Name
        <input value={props.layer.name} onChange={(event) => update({ name: event.target.value })} />
      </label>
      <label className="checkbox-row"><span>Visible</span><input type="checkbox" checked={props.layer.visible} onChange={(event) => update({ visible: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Locked</span><input type="checkbox" checked={props.layer.locked} onChange={(event) => update({ locked: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Has Tiles</span><input type="checkbox" checked={props.layer.hasTiles} onChange={(event) => update({ hasTiles: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Has Collision</span><input type="checkbox" checked={props.layer.hasCollision} onChange={(event) => update({ hasCollision: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Has Markers</span><input type="checkbox" checked={props.layer.hasMarkers} onChange={(event) => update({ hasMarkers: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Repeat X</span><input type="checkbox" checked={props.layer.repeatX} onChange={(event) => update({ repeatX: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Repeat Y</span><input type="checkbox" checked={props.layer.repeatY} onChange={(event) => update({ repeatY: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Foreground</span><input type="checkbox" checked={props.layer.foreground} onChange={(event) => update({ foreground: event.target.checked })} /></label>
      <div className="inspector-row inspector-row-2">
        <label>
          Parallax X
          <input type="number" step="0.1" value={props.layer.parallaxX} onChange={(event) => update({ parallaxX: Number(event.target.value) || 0 })} />
        </label>
        <label>
          Parallax Y
          <input type="number" step="0.1" value={props.layer.parallaxY} onChange={(event) => update({ parallaxY: Number(event.target.value) || 0 })} />
        </label>
      </div>
      <div className="inspector-row inspector-row-2">
        <label>
          Offset X
          <input type="number" value={props.layer.offsetX} onChange={(event) => update({ offsetX: Number(event.target.value) || 0 })} />
        </label>
        <label>
          Offset Y
          <input type="number" value={props.layer.offsetY} onChange={(event) => update({ offsetY: Number(event.target.value) || 0 })} />
        </label>
      </div>
      {props.layer.hasMarkers ? (
        <>
          <div className="list-row static">
            <strong>Markers</strong>
            <span>{props.level.markers.filter((entry) => entry.layerId === props.layer.id).length} markers</span>
          </div>
          <div className="list-row static">
            <strong>Active Tool</strong>
            <span>{props.levelTool === "markerRect" ? "Rect Marker" : props.levelTool === "markerPoint" ? "Point Marker" : "Select Marker Tool"}</span>
          </div>
        </>
      ) : null}
      {props.layer.hasCollision ? (
        <>
          <div className="list-row static">
            <strong>Collision</strong>
            <span>{props.level.collisions.filter((entry) => entry.layerId === props.layer.id).length} areas</span>
          </div>
          <div className="list-row static">
            <strong>Active Tool</strong>
            <span>{props.levelTool === "collisionRect" ? "Collision Rect" : "Select Collision Tool"}</span>
          </div>
        </>
      ) : null}
      <RecentLevelAssetsSection
        project={props.project}
        recentTileIds={props.recentTileIds}
        recentTerrainSetIds={props.recentTerrainSetIds}
        onSelectRecentTile={props.onSelectRecentTile}
        onSelectRecentTerrainSet={props.onSelectRecentTerrainSet}
      />
    </div>
  );
}

export function LevelSettingsInspector(props: {
  level: LevelDocument;
  dispatch: Dispatch<ProjectAction>;
  project: ProjectDocument;
  recentTileIds: number[];
  recentTerrainSetIds: number[];
  onSelectRecentTile: (tileId: number) => void;
  onSelectRecentTerrainSet: (terrainSetId: number) => void;
}) {
  function update(patch: Partial<LevelDocument>) {
    props.dispatch({
      type: "updateLevel",
      level: {
        ...props.level,
        ...patch,
        layers: props.level.layers.map((layer) => ({
          ...layer,
          widthTiles: patch.mapWidthTiles ?? props.level.mapWidthTiles,
          heightTiles: patch.mapHeightTiles ?? props.level.mapHeightTiles,
        })),
      },
    });
  }

  return (
    <div className="inspector-list">
      <label>
        Level Name
        <input value={props.level.name} onChange={(event) => update({ name: event.target.value })} />
      </label>
      <div className="inspector-row inspector-row-2">
        <label>
          Map Width
          <input type="number" min="1" value={props.level.mapWidthTiles} onChange={(event) => update({ mapWidthTiles: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
        <label>
          Map Height
          <input type="number" min="1" value={props.level.mapHeightTiles} onChange={(event) => update({ mapHeightTiles: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
      </div>
      <div className="inspector-row inspector-row-2">
        <label>
          Tile Width
          <input type="number" min="1" value={props.level.tileWidth} onChange={(event) => update({ tileWidth: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
        <label>
          Tile Height
          <input type="number" min="1" value={props.level.tileHeight} onChange={(event) => update({ tileHeight: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
      </div>
      <div className="inspector-row inspector-row-2">
        <label>
          Chunk Width
          <input type="number" min="1" value={props.level.chunkWidthTiles} onChange={(event) => update({ chunkWidthTiles: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
        <label>
          Chunk Height
          <input type="number" min="1" value={props.level.chunkHeightTiles} onChange={(event) => update({ chunkHeightTiles: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
      </div>
      <div className="list-row static">
        <strong>Tilesets</strong>
        <span>{props.level.tilesetIds.length}</span>
      </div>
      <div className="list-row static">
        <strong>Layers</strong>
        <span>{props.level.layers.length}</span>
      </div>
      <RecentLevelAssetsSection
        project={props.project}
        recentTileIds={props.recentTileIds}
        recentTerrainSetIds={props.recentTerrainSetIds}
        onSelectRecentTile={props.onSelectRecentTile}
        onSelectRecentTerrainSet={props.onSelectRecentTerrainSet}
      />
    </div>
  );
}
