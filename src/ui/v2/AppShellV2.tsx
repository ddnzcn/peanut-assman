import { useMemo, useState } from "react";
import { buildAnimatedTileLookup, resolveAnimatedTileSliceId, useAnimationPlayback } from "../../animation/playback";
import {
  ChevronDown,
  Download,
  Eraser,
  Film,
  FolderOpen,
  Grid3x3,
  Layers,
  Map,
  MapPin,
  MousePointer2,
  Move,
  Package,
  PaintBucket,
  Pencil,
  Plus,
  RectangleHorizontal,
  Redo2,
  Save,
  Search,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useAppShellController } from "../app-shell/useAppShellController";
import { AtlasWorkspace, LevelWorkspace } from "../app-shell/workspaces";
import { AnimationWorkspace } from "../app-shell/timeline";
import { LevelNavigator } from "../app-shell/navigator";
import {
  AtlasInspector,
  LevelInspector,
  LevelSettingsInspector,
} from "../app-shell/inspectors";
import { AtlasAssetsPanel, LevelAssetPicker } from "../app-shell/pickers";
import { TileAssetPreview } from "../app-shell/shared";
import { clamp } from "../../utils";
import { sampleBrushFromLevel } from "../../level/editor";
import type { AnimatedTileAsset, LevelDocument, LevelLayer, ProjectDocument, TileBrush, TilesetTileAsset } from "../../types";
import "./styles-v2.css";

// ---------- Animated tile palette cell ----------

function AnimatedTilePaletteCell(props: {
  project: ProjectDocument;
  animatedTile: AnimatedTileAsset;
  selected: boolean;
  onClick: () => void;
}) {
  const lookup = useMemo(() => buildAnimatedTileLookup([props.animatedTile]), [props.animatedTile]);
  const [currentSliceId, setCurrentSliceId] = useState<string | null>(
    props.animatedTile.frames[0]?.sliceId ?? null,
  );

  useAnimationPlayback(true, (timeMs) => {
    setCurrentSliceId(resolveAnimatedTileSliceId(lookup, props.animatedTile.baseTileId, timeMs));
  });

  const slice = currentSliceId
    ? props.project.slices.find((s) => s.id === currentSliceId) ?? null
    : null;
  const source = slice
    ? props.project.sourceImages.find((s) => s.id === slice.sourceImageId) ?? null
    : null;
  const scale = 2;

  return (
    <button
      className={props.selected ? "v2-tile-btn active" : "v2-tile-btn"}
      onClick={props.onClick}
      title={props.animatedTile.name}
      data-tooltip={props.animatedTile.name}
    >
      {slice && source ? (
        <div
          style={{
            width: slice.sourceRect.width * scale,
            height: slice.sourceRect.height * scale,
            backgroundImage: `url(${source.dataUrl})`,
            backgroundPosition: `-${slice.sourceRect.x * scale}px -${slice.sourceRect.y * scale}px`,
            backgroundSize: `${source.width * scale}px ${source.height * scale}px`,
            imageRendering: "pixelated",
          }}
        />
      ) : (
        <div style={{ width: 32, height: 32, background: "rgba(255,200,106,0.15)", borderRadius: 4 }} />
      )}
    </button>
  );
}

// ---------- Brush preview ----------

function BrushPreview({ brush, project, scale = 1 }: { brush: TileBrush; project: ProjectDocument; scale?: number }) {
  const tileById = useMemo(() => {
    const m = new globalThis.Map<number, TilesetTileAsset>();
    project.tiles.forEach((t) => m.set(t.tileId, t));
    return m;
  }, [project.tiles]);
  const cellSize = 16 * scale;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${brush.width}, ${cellSize}px)`, gap: 1, imageRendering: "pixelated" }}>
      {brush.tiles.map((tileId, i) => {
        const tile = tileId ? tileById.get(tileId) : null;
        return tile ? (
          <TileAssetPreview key={i} project={project} tile={tile} scale={scale} />
        ) : (
          <div key={i} style={{ width: cellSize, height: cellSize }} />
        );
      })}
    </div>
  );
}

// ---------- TilePalette sub-component ----------

interface TilePaletteProps {
  project: ProjectDocument;
  tiles: TilesetTileAsset[];
  animatedTiles: AnimatedTileAsset[];
  selectedPaintTileId: number;
  recentTileIds: number[];
  pinnedTileIds: number[];
  onSelectTile: (tileId: number) => void;
  savedBrushes: TileBrush[];
  activeBrushId: number | null;
  levelSelection: { x0: number; y0: number; x1: number; y1: number } | null;
  level: LevelDocument | null;
  layer: LevelLayer | null;
  onSaveBrush: (brush: Omit<TileBrush, "id">) => void;
  onDeleteBrush: (id: number) => void;
  onSelectBrush: (id: number | null) => void;
}

function TilePalette({
  project,
  tiles,
  animatedTiles,
  selectedPaintTileId,
  recentTileIds,
  pinnedTileIds,
  onSelectTile,
  savedBrushes,
  activeBrushId,
  levelSelection,
  level,
  layer,
  onSaveBrush,
  onDeleteBrush,
  onSelectBrush,
}: TilePaletteProps) {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? tiles.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : tiles;

  const pinnedTiles = filtered.filter((t) => pinnedTileIds.includes(t.tileId));
  const recentTiles = filtered.filter(
    (t) => recentTileIds.includes(t.tileId) && !pinnedTileIds.includes(t.tileId),
  );
  const allTiles = filtered.filter(
    (t) => !pinnedTileIds.includes(t.tileId) && !recentTileIds.includes(t.tileId),
  );

  function renderTileGrid(tileList: TilesetTileAsset[]) {
    return (
      <div className="v2-tile-palette-grid">
        {tileList.map((tile) => (
          <button
            key={tile.tileId}
            className={
              tile.tileId === selectedPaintTileId
                ? "v2-tile-btn active"
                : "v2-tile-btn"
            }
            onClick={() => onSelectTile(tile.tileId)}
            title={tile.name}
            aria-label={tile.name}
            data-tooltip={tile.name}
          >
            <TileAssetPreview project={project} tile={tile} scale={1} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="v2-tile-palette">
      <div className="v2-tile-palette-header">
        <Search size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search tiles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: "0.2rem 0.35rem",
            fontSize: "0.78rem",
            border: "1px solid var(--border)",
            borderRadius: "0.35rem",
            background: "rgba(0,0,0,0.25)",
            color: "inherit",
            width: "auto",
          }}
        />
      </div>
      <div className="v2-tile-palette-scroll">
        {pinnedTiles.length > 0 && (
          <>
            <div className="v2-tile-palette-section-label">Pinned</div>
            {renderTileGrid(pinnedTiles)}
          </>
        )}
        {recentTiles.length > 0 && (
          <>
            <div className="v2-tile-palette-section-label">Recent</div>
            {renderTileGrid(recentTiles)}
          </>
        )}
        {allTiles.length > 0 && (
          <>
            {(pinnedTiles.length > 0 || recentTiles.length > 0) && (
              <div className="v2-tile-palette-section-label">All Tiles</div>
            )}
            {renderTileGrid(allTiles)}
          </>
        )}
        {filtered.length === 0 && animatedTiles.length === 0 && (
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", padding: "0.5rem 0" }}>
            No tiles match.
          </p>
        )}
        {animatedTiles.length > 0 && (
          <>
            <div className="v2-tile-palette-section-label">Animated</div>
            <div className="v2-tile-palette-grid">
              {animatedTiles.map((anim) => (
                <AnimatedTilePaletteCell
                  key={anim.id}
                  project={project}
                  animatedTile={anim}
                  selected={selectedPaintTileId === anim.baseTileId}
                  onClick={() => onSelectTile(anim.baseTileId)}
                />
              ))}
            </div>
          </>
        )}

        {/* ---- Brushes section ---- */}
        <div className="v2-tile-palette-section-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Brushes</span>
          <div style={{ display: "flex", gap: 4 }}>
            {levelSelection && level && layer && (
              <button
                className="v2-tool-btn"
                style={{ width: 18, height: 18, fontSize: "0.65rem", padding: 0 }}
                title="Save selection as brush"
                onClick={() => {
                  const sampled = sampleBrushFromLevel(level, layer, levelSelection.x0, levelSelection.y0, levelSelection.x1, levelSelection.y1);
                  const w = Math.abs(levelSelection.x1 - levelSelection.x0) + 1;
                  onSaveBrush({ name: `brush_${String(savedBrushes.length + 1).padStart(2, "0")}`, ...sampled, width: w });
                }}
              >
                <MousePointer2 size={10} />
              </button>
            )}
            {selectedPaintTileId > 0 && (
              <button
                className="v2-tool-btn"
                style={{ width: 18, height: 18, fontSize: "0.65rem", padding: 0 }}
                title="Save current tile as 1×1 brush"
                onClick={() => onSaveBrush({ name: `brush_${String(savedBrushes.length + 1).padStart(2, "0")}`, width: 1, height: 1, tiles: [selectedPaintTileId] })}
              >
                <Plus size={10} />
              </button>
            )}
          </div>
        </div>
        {savedBrushes.length === 0 ? (
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", padding: "0.25rem 0 0.5rem" }}>
            Select a tile and press <strong>+</strong>, or use the <strong>Select</strong> tool to capture a region.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {savedBrushes.map((brush) => (
              <div
                key={brush.id}
                className={brush.id === activeBrushId ? "v2-brush-row active" : "v2-brush-row"}
                onClick={() => onSelectBrush(brush.id === activeBrushId ? null : brush.id)}
              >
                <BrushPreview brush={brush} project={project} scale={1} />
                <span className="v2-brush-name">{brush.name}</span>
                <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "var(--text-muted)", flexShrink: 0 }}>
                  {brush.width}×{brush.height}
                </span>
                <button
                  className="v2-tool-btn"
                  style={{ width: 16, height: 16, padding: 0, flexShrink: 0 }}
                  title="Delete brush"
                  onClick={(e) => { e.stopPropagation(); onDeleteBrush(brush.id); }}
                >
                  <Trash2 size={9} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- V2 Tool button ----------

interface V2ToolBtnProps {
  label: string;
  shortcut?: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function V2ToolBtn({ label, shortcut, active, onClick, children }: V2ToolBtnProps) {
  const tooltip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      className={active ? "v2-tool-btn active" : "v2-tool-btn"}
      onClick={onClick}
      aria-label={tooltip}
      data-tooltip={tooltip}
    >
      {children}
    </button>
  );
}

// ---------- AppShellV2 ----------

export function AppShellV2() {
  const controller = useAppShellController();
  const {
    state,
    dispatch,
    level,
    layer,
    atlas,
    selectedTerrainSet,
    selectedSourceImage,
    atlasSprites,
    levelTerrainSets,
    effectiveLevelTileIds,
    selectedPaintTileId,
    setSelectedPaintTileId,
    recentTileIds,
    recentTerrainSetIds,
    pinnedTileIds,
    levelPan,
    slicerPan,
    packPan,
    packZoom,
    atlasPackStageRef,
    atlasModule,
    setAtlasModule,
    draggedSpriteIndex,
    setDraggedSpriteIndex,
    atlasGridOptions,
    setAtlasGridOptions,
    atlasGridPreview,
    atlasManualRects,
    setAtlasManualRects,
    atlasManualKind,
    setAtlasManualKind,
    atlasManualDraft,
    setAtlasManualDraft,
    atlasSelectedManualRectIndex,
    setAtlasSelectedManualRectIndex,
    slicerCanvasTool,
    setSlicerCanvasTool,
    dragRect,
    atlasCanvasRef,
    atlasStageRef,
    levelStageRef,
    levelCanvasRef,
    levelCursorClass,
    importImages,
    loadProject,
    saveProject,
    exportAtlas,
    exportLevel,
    addSelectedSlicesToAtlas,
    addSelectedSlicesToLevel,
    createAtlasSlices,
    handleWheelZoom,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
    handlePackWheelZoom,
    handlePackPanStart,
    handlePackPanMove,
    handlePackPanEnd,
    onSlicerPointerDown,
    onSlicerPointerMove,
    onSlicerPointerUp,
    handleLevelPointerDown,
    handleLevelPointerMove,
    handleLevelPointerUp,
    updateManualRect,
    removeManualRect,
    selectManualRect,
    pushRecentTile,
    pushRecentTerrainSet,
    togglePinnedTile,
    pinTileRegion,
    assetTrayOpen,
    setAssetTrayOpen,
    assetSearch,
    setAssetSearch,
    levelAssetTab,
    setLevelAssetTab,
    rectDragStart,
    rectDragCurrent,
    createExampleProject,
    createLevelLayer,
    createAnimation,
    handleAnimationTick,
    levelSelection,
    setLevelSelection,
  } = controller;

  const workspace = state.editor.workspace;

  // Derive the tile palette list from effectiveLevelTileIds
  const paletteTiles = effectiveLevelTileIds
    .map((tileId) => state.project.tiles.find((t) => t.tileId === tileId))
    .filter((t): t is TilesetTileAsset => Boolean(t));

  function handleSelectPaintTile(tileId: number) {
    setSelectedPaintTileId(tileId);
    pushRecentTile(tileId);
    dispatch({ type: "setLevelTool", tool: "brush" });
  }

  return (
    <div className={`v2-shell workspace-${workspace}`}>
      {/* ---- TOP BAR ---- */}
      <header className="v2-topbar">
        <div className="v2-logo">
          <span className="v2-logo-dot" />
          Peanut
        </div>

        <nav className="v2-workspace-tabs">
          <button
            className={workspace === "atlas" ? "v2-tab-btn active" : "v2-tab-btn"}
            onClick={() => dispatch({ type: "setWorkspace", workspace: "atlas" })}
          >
            <Package size={13} />
            Atlas
          </button>
          <button
            className={workspace === "level" ? "v2-tab-btn active" : "v2-tab-btn"}
            onClick={() => dispatch({ type: "setWorkspace", workspace: "level" })}
          >
            <Map size={13} />
            Level
          </button>
          <button
            className={workspace === "animation" ? "v2-tab-btn active" : "v2-tab-btn"}
            onClick={() => dispatch({ type: "setWorkspace", workspace: "animation" })}
          >
            <Film size={13} />
            Animation
          </button>
        </nav>

        <div className="v2-topbar-actions">
          <details className="app-menu">
            <summary className="app-menu-trigger" style={{ fontSize: "0.82rem" }}>
              File <ChevronDown size={10} style={{ display: "inline", marginLeft: 2 }} />
            </summary>
            <div className="app-menu-panel panel">
              <label className="app-menu-item file-button">
                <Upload size={14} />
                <span>Import PNG</span>
                <small>Add source images.</small>
                <input type="file" accept=".png,image/png" multiple onChange={importImages} />
              </label>
              <label className="app-menu-item file-button">
                <FolderOpen size={14} />
                <span>Load Project</span>
                <small>Open a saved project.</small>
                <input type="file" accept=".json,application/json" onChange={loadProject} />
              </label>
              <button className="app-menu-item" onClick={saveProject}>
                <Save size={14} />
                <span>Save Project</span>
                <small>Write project to disk.</small>
              </button>
            </div>
          </details>

          <details className="app-menu">
            <summary className="app-menu-trigger" style={{ fontSize: "0.82rem" }}>
              Project <ChevronDown size={10} style={{ display: "inline", marginLeft: 2 }} />
            </summary>
            <div className="app-menu-panel panel">
              <button
                className="app-menu-item"
                onClick={() => dispatch({ type: "replaceProject", project: createExampleProject() })}
              >
                <Sparkles size={14} />
                <span>Load Example</span>
                <small>Replace with sample project.</small>
              </button>
            </div>
          </details>

          <details className="app-menu">
            <summary className="app-menu-trigger" style={{ fontSize: "0.82rem" }}>
              Export <ChevronDown size={10} style={{ display: "inline", marginLeft: 2 }} />
            </summary>
            <div className="app-menu-panel panel">
              <button className="app-menu-item" onClick={exportAtlas} disabled={!atlas}>
                <Grid3x3 size={14} />
                <span>Export Atlas</span>
                <small>Build and save atlas output.</small>
              </button>
              <button
                className="app-menu-item primary app-menu-item-primary"
                onClick={exportLevel}
                disabled={!level}
              >
                <Download size={14} />
                <span>Export Level</span>
                <small>Write level runtime data.</small>
              </button>
            </div>
          </details>
        </div>
      </header>

      {/* ---- LEFT NAVIGATOR (level mode only) ---- */}
      {workspace === "level" && level ? (
        <aside className="v2-sidebar-left">
          <LevelNavigator
            levels={state.project.levels}
            selectedLevelId={level.id}
            selectedLayerId={layer?.id ?? null}
            onSelectLevel={(levelId) => {
              dispatch({ type: "setSelectedLevel", levelId });
              dispatch({ type: "setSelectedLayer", layerId: null });
            }}
            onSelectLayer={(layerId) => dispatch({ type: "setSelectedLayer", layerId })}
            onRenameLevel={(levelId, name) => {
              const target = state.project.levels.find((e) => e.id === levelId);
              if (!target) return;
              dispatch({ type: "updateLevel", level: { ...target, name } });
            }}
            onRenameLayer={(layerId, name) =>
              dispatch({
                type: "updateLevel",
                level: {
                  ...level,
                  layers: level.layers.map((e) => (e.id === layerId ? { ...e, name } : e)),
                },
              })
            }
            onAddLevel={() => {
              const nextId = `level-${state.project.idCounters.level}`;
              const layerBase = state.project.idCounters.layer;
              dispatch({
                type: "addLevel",
                level: {
                  id: nextId,
                  name: `level${String(state.project.idCounters.level).padStart(2, "0")}`,
                  mapWidthTiles: level.mapWidthTiles,
                  mapHeightTiles: level.mapHeightTiles,
                  tileWidth: level.tileWidth,
                  tileHeight: level.tileHeight,
                  chunkWidthTiles: level.chunkWidthTiles,
                  chunkHeightTiles: level.chunkHeightTiles,
                  tileIds: [...level.tileIds],
                  tilesetIds: [...level.tilesetIds],
                  layers: [
                    createLevelLayer(`layer-${layerBase}`, "Ground", level.mapWidthTiles, level.mapHeightTiles, { hasTiles: true }),
                    createLevelLayer(`layer-${layerBase + 1}`, "Gameplay", level.mapWidthTiles, level.mapHeightTiles, { hasCollision: true, hasMarkers: true }),
                    createLevelLayer(`layer-${layerBase + 2}`, "Foreground", level.mapWidthTiles, level.mapHeightTiles, { hasTiles: true }),
                  ],
                  chunks: {},
                  collisions: [],
                  markers: [],
                },
              });
            }}
            onRemoveLevel={() => dispatch({ type: "removeLevel", levelId: level.id })}
            onAddLayer={() =>
              dispatch({
                type: "addLayer",
                levelId: level.id,
                layer: createLevelLayer(
                  `layer-${state.project.idCounters.layer}`,
                  `Layer ${level.layers.length + 1}`,
                  level.mapWidthTiles,
                  level.mapHeightTiles,
                  { hasTiles: true },
                ),
              })
            }
            onMoveLayerUp={() =>
              layer ? dispatch({ type: "reorderLayer", levelId: level.id, layerId: layer.id, direction: "up" }) : undefined
            }
            onMoveLayerDown={() =>
              layer ? dispatch({ type: "reorderLayer", levelId: level.id, layerId: layer.id, direction: "down" }) : undefined
            }
            onReorderLayer={(layerId, toIndex) =>
              dispatch({ type: "reorderLayer", levelId: level.id, layerId, toIndex })
            }
            onRemoveLayer={() =>
              layer ? dispatch({ type: "removeLayer", levelId: level.id, layerId: layer.id }) : undefined
            }
          />
        </aside>
      ) : workspace === "atlas" ? (
        <aside className="v2-sidebar-left">
          <AtlasAssetsPanel
            project={state.project}
            sourceImages={state.project.sourceImages}
            selectedSourceImageId={selectedSourceImage?.id ?? null}
            atlasSprites={atlasSprites}
            onSelectSource={(sourceImageId) =>
              dispatch({ type: "setSelectedSourceImage", sourceImageId })
            }
            onRemoveSource={(sourceImageId) =>
              dispatch({ type: "removeSourceImage", sourceImageId })
            }
            onDragStart={setDraggedSpriteIndex}
            onDrop={(toIndex) => {
              if (draggedSpriteIndex !== null) {
                dispatch({ type: "reorderSprites", fromIndex: draggedSpriteIndex, toIndex });
              }
              setDraggedSpriteIndex(null);
            }}
          />
        </aside>
      ) : null}

      {/* ---- MAIN WORKSPACE ---- */}
      <section className="v2-workspace">
        {workspace === "atlas" ? (
          <AtlasWorkspace
            atlas={atlas}
            module={atlasModule}
            source={selectedSourceImage}
            gridOptions={atlasGridOptions}
            setGridOptions={setAtlasGridOptions}
            gridPreview={state.editor.slicerMode === "grid" ? atlasGridPreview : []}
            manualRects={state.editor.slicerMode === "manual" ? atlasManualRects : []}
            selectedManualRectIndex={state.editor.slicerMode === "manual" ? atlasSelectedManualRectIndex : null}
            slicerCanvasTool={slicerCanvasTool}
            manualKind={atlasManualKind}
            manualDraft={atlasManualDraft}
            setManualKind={setAtlasManualKind}
            dragRect={dragRect}
            slicerZoom={state.editor.slicerZoom}
            slicerPan={slicerPan}
            packZoom={packZoom}
            packPan={packPan}
            packStageRef={atlasPackStageRef}
            canvasRef={atlasCanvasRef}
            stageRef={atlasStageRef}
            onCreateSlices={createAtlasSlices}
            onWheel={(event) => handleWheelZoom(event, "slicer")}
            onPackWheel={handlePackWheelZoom}
            onPackPanStart={handlePackPanStart}
            onPackPanMove={handlePackPanMove}
            onPackPanEnd={handlePackPanEnd}
            onStagePanStart={(event) => handlePanStart(event, "slicer", false)}
            onStagePanMove={handlePanMove}
            onStagePanEnd={handlePanEnd}
            onCanvasPointerDown={(event) => onSlicerPointerDown(event, "atlas")}
            onCanvasPointerMove={(event) => onSlicerPointerMove(event, "atlas")}
            onCanvasPointerUp={() => onSlicerPointerUp("atlas")}
            onManualRectSelect={selectManualRect}
          />
        ) : workspace === "animation" ? (
          <AnimationWorkspace
            project={state.project}
            animations={state.project.spriteAnimations}
            selectedAnimationId={state.editor.selectedSpriteAnimationId}
            currentFrame={state.editor.animCurrentFrame}
            isPlaying={state.editor.animIsPlaying}
            onSelectAnimation={(id) => dispatch({ type: "setSelectedSpriteAnimation", animationId: id })}
            onCreateAnimation={createAnimation}
            onRemoveAnimation={(id) => dispatch({ type: "removeSpriteAnimation", animationId: id })}
            onUpdateAnimation={(anim) => dispatch({ type: "upsertSpriteAnimation", animation: anim })}
            onSelectFrame={(frame) => dispatch({ type: "setAnimFrame", frame })}
            onTogglePlay={() => dispatch({ type: "setAnimPlaying", playing: !state.editor.animIsPlaying })}
            onStop={() => dispatch({ type: "setAnimPlaying", playing: false })}
            onTick={handleAnimationTick}
          />
        ) : (
          <LevelWorkspace
            level={level}
            levelZoom={state.editor.levelZoom}
            levelPan={levelPan}
            levelCanvasRef={levelCanvasRef}
            stageRef={levelStageRef}
            cursorClass={levelCursorClass}
            rectDragStart={rectDragStart}
            rectDragCurrent={rectDragCurrent}
            onCanvasPointerDown={handleLevelPointerDown}
            onCanvasPointerMove={handleLevelPointerMove}
            onCanvasPointerUp={handleLevelPointerUp}
            onWheel={(event) => handleWheelZoom(event, "level")}
            onStagePanStart={(event) => handlePanStart(event, "level", true)}
            onStagePanMove={handlePanMove}
            onStagePanEnd={handlePanEnd}
          />
        )}
      </section>

      {/* ---- RIGHT PANEL (inspector + palette) ---- */}
      {workspace !== "animation" && (
        <aside className="v2-sidebar-right">
          {/* Inspector section */}
          <div className="v2-right-inspector">
            <div className="v2-panel-header">
              <Settings size={12} />
              <h3>Inspector</h3>
            </div>
            {workspace === "atlas" ? (
              <AtlasInspector
                atlas={atlas}
                settings={state.project.atlasSettings}
                module={atlasModule}
                source={selectedSourceImage}
                gridOptions={atlasGridOptions}
                manualRects={atlasManualRects}
                selectedManualRectIndex={atlasSelectedManualRectIndex}
                manualRectCount={atlasManualRects.length}
                slicerCanvasTool={slicerCanvasTool}
                manualKind={atlasManualKind}
                manualDraft={atlasManualDraft}
                slicerMode={state.editor.slicerMode}
                dispatch={dispatch}
                onGridOptionsChange={setAtlasGridOptions}
                onManualKindChange={setAtlasManualKind}
                onManualDraftChange={(patch) =>
                  setAtlasManualDraft((current) => ({ ...current, ...patch }))
                }
                onSlicerCanvasToolChange={setSlicerCanvasTool}
                onSlicerModeChange={(mode) => dispatch({ type: "setSlicerMode", mode })}
                onClearManual={() => {
                  setAtlasManualRects([]);
                  setAtlasSelectedManualRectIndex(null);
                  setAtlasManualDraft({ x: 0, y: 0, width: 32, height: 32, name: "" });
                }}
                onManualRectNameChange={(index, name) => updateManualRect(index, { name })}
                onManualRectRemove={removeManualRect}
                onManualRectSelect={selectManualRect}
                onAddManualRect={() => {
                  setAtlasManualRects((current) => {
                    const next = [
                      ...current,
                      {
                        ...atlasManualDraft,
                        name:
                          atlasManualDraft.name.trim() ||
                          `sprite_${String(current.length).padStart(2, "0")}`,
                      },
                    ];
                    setAtlasSelectedManualRectIndex(next.length - 1);
                    return next;
                  });
                }}
                selectedSliceCount={state.editor.selectedSliceIds.length}
                onAddSelectedToAtlas={addSelectedSlicesToAtlas}
                onAddSelectedToLevel={addSelectedSlicesToLevel}
                currentLevelName={level?.name ?? null}
                onCreateSlices={createAtlasSlices}
                onSetModule={setAtlasModule}
              />
            ) : level ? (
              layer ? (
                <LevelInspector
                  level={level}
                  layer={layer}
                  levelTool={state.editor.levelTool}
                  dispatch={dispatch}
                  project={state.project}
                  recentTileIds={recentTileIds}
                  recentTerrainSetIds={recentTerrainSetIds}
                  onSelectRecentTile={(tileId) => {
                    setSelectedPaintTileId(tileId);
                    pushRecentTile(tileId);
                    dispatch({ type: "setLevelTool", tool: "brush" });
                  }}
                  onSelectRecentTerrainSet={(terrainSetId) => {
                    dispatch({ type: "setSelectedTerrainSet", terrainSetId });
                    pushRecentTerrainSet(terrainSetId);
                    dispatch({ type: "setLevelTool", tool: "terrain" });
                  }}
                />
              ) : (
                <LevelSettingsInspector
                  level={level}
                  dispatch={dispatch}
                  project={state.project}
                  recentTileIds={recentTileIds}
                  recentTerrainSetIds={recentTerrainSetIds}
                  onSelectRecentTile={(tileId) => {
                    setSelectedPaintTileId(tileId);
                    pushRecentTile(tileId);
                    dispatch({ type: "setLevelTool", tool: "brush" });
                  }}
                  onSelectRecentTerrainSet={(terrainSetId) => {
                    dispatch({ type: "setSelectedTerrainSet", terrainSetId });
                    pushRecentTerrainSet(terrainSetId);
                    dispatch({ type: "setLevelTool", tool: "terrain" });
                  }}
                />
              )
            ) : null}
          </div>

          {/* Divider and tile palette (level mode only) */}
          {workspace === "level" && (
            <>
              <div className="v2-right-divider" />
              <div className="v2-panel-header" style={{ paddingBottom: "0.35rem" }}>
                <Layers size={12} />
                <h3>Tile Palette</h3>
                <button
                  className={assetTrayOpen ? "v2-tool-btn active" : "v2-tool-btn"}
                  style={{ width: 22, height: 22 }}
                  onClick={() => setAssetTrayOpen(!assetTrayOpen)}
                  title="Add tiles / manage assets"
                >
                  <Plus size={11} />
                </button>
              </div>
              <TilePalette
                project={state.project}
                tiles={paletteTiles}
                animatedTiles={state.project.animatedTiles ?? []}
                selectedPaintTileId={selectedPaintTileId}
                recentTileIds={recentTileIds}
                pinnedTileIds={pinnedTileIds}
                onSelectTile={handleSelectPaintTile}
                savedBrushes={state.editor.savedBrushes ?? []}
                activeBrushId={state.editor.activeBrushId ?? null}
                levelSelection={levelSelection}
                level={level}
                layer={layer}
                onSaveBrush={(brush) => dispatch({ type: "saveBrush", brush })}
                onDeleteBrush={(brushId) => dispatch({ type: "deleteBrush", brushId })}
                onSelectBrush={(brushId) => {
                  dispatch({ type: "setActiveBrush", brushId });
                  if (brushId !== null) {
                    dispatch({ type: "setLevelTool", tool: "brush" });
                    setLevelSelection(null);
                  }
                }}
              />
            </>
          )}
        </aside>
      )}

      {/* ---- ASSET PICKER OVERLAY ---- */}
      {workspace === "level" && assetTrayOpen && (
        <LevelAssetPicker
          project={state.project}
          level={level}
          sourceImages={state.project.sourceImages}
          selectedSourceImageId={selectedSourceImage?.id ?? null}
          selectedSliceIds={state.editor.selectedSliceIds}
          selectedPaintTileId={selectedPaintTileId}
          selectedTerrainSetId={selectedTerrainSet?.id ?? null}
          terrainSets={levelTerrainSets}
          animatedTiles={state.project.animatedTiles}
          selectedAnimatedTileId={state.editor.selectedAnimatedTileId}
          recentTileIds={recentTileIds}
          pinnedTileIds={pinnedTileIds}
          search={assetSearch}
          tab={levelAssetTab}
          onSearchChange={setAssetSearch}
          onTabChange={setLevelAssetTab}
          onClose={() => setAssetTrayOpen(false)}
          onSelectSource={(sourceImageId) => dispatch({ type: "setSelectedSourceImage", sourceImageId })}
          onToggleSlice={(sliceId) => dispatch({ type: "toggleSliceSelection", sliceId })}
          onAddSelectedSlicesToLevel={() => {
            if (addSelectedSlicesToLevel()) {
              setLevelAssetTab("tiles");
            }
          }}
          onSelectTile={(tileId) => {
            setSelectedPaintTileId(tileId);
            pushRecentTile(tileId);
            dispatch({ type: "setLevelTool", tool: "brush" });
            setAssetTrayOpen(false);
          }}
          onSetPaintTile={setSelectedPaintTileId}
          onTogglePinnedTile={togglePinnedTile}
          onPinTileRegion={pinTileRegion}
          onSelectTerrainSet={(terrainSetId) => {
            dispatch({ type: "setSelectedTerrainSet", terrainSetId });
            pushRecentTerrainSet(terrainSetId);
            dispatch({ type: "setLevelTool", tool: "terrain" });
            setAssetTrayOpen(false);
          }}
          onSetTerrainSet={(terrainSetId) => dispatch({ type: "setSelectedTerrainSet", terrainSetId })}
          onRemoveTerrainSet={(terrainSetId) => dispatch({ type: "removeTerrainSet", terrainSetId })}
          onCreateTerrainSet={() => {
            if (!level) return;
            dispatch({
              type: "upsertTerrainSet",
              terrainSet: {
                id: state.project.idCounters.terrainSet,
                name: `${level.name}_terrain`,
                tilesetId: 0,
                levelId: level.id,
                slots: { 0: selectedPaintTileId || effectiveLevelTileIds[0] || 0 },
                mode: "cardinal",
                blobMap: {},
              },
            });
          }}
          onAssignTerrainSlot={(slot) => {
            if (!selectedTerrainSet) return;
            dispatch({
              type: "upsertTerrainSet",
              terrainSet: { ...selectedTerrainSet, slots: { ...selectedTerrainSet.slots, [slot]: selectedPaintTileId } },
            });
          }}
          onUpdateTerrainSet={(terrainSet) => dispatch({ type: "upsertTerrainSet", terrainSet })}
          onSelectAnimatedTile={(id) => dispatch({ type: "setSelectedAnimatedTile", animatedTileId: id })}
          onCreateAnimatedTile={() => {
            const id = state.project.idCounters.animatedTile;
            // Use a fresh tile ID as baseTileId so each animated tile has a unique paint ID
            const baseTileId = state.project.idCounters.tile;
            dispatch({
              type: "upsertAnimatedTile",
              animatedTile: {
                id,
                name: `anim_tile_${String(id).padStart(2, "0")}`,
                baseTileId,
                frames: [],
              },
            });
          }}
          onRemoveAnimatedTile={(id) => dispatch({ type: "removeAnimatedTile", animatedTileId: id })}
          onUpdateAnimatedTile={(animatedTile) => dispatch({ type: "upsertAnimatedTile", animatedTile })}
        />
      )}

      {/* ---- FLOATING TOOLBAR ---- */}
      {workspace !== "animation" && (
        <footer className="v2-toolbar">
          {workspace === "level" ? (
            <>
              {/* History group */}
              <div className="v2-dock-group">
                <V2ToolBtn label="Undo" shortcut="Cmd/Ctrl+Z" active={false} onClick={() => dispatch({ type: "undo" })}>
                  <Undo2 />
                </V2ToolBtn>
                <V2ToolBtn label="Redo" shortcut="Shift+Z/Y" active={false} onClick={() => dispatch({ type: "redo" })}>
                  <Redo2 />
                </V2ToolBtn>
              </div>

              {/* Active tile group */}
              <div className="v2-dock-group">
                <div className="v2-active-tile-preview" title="Current brush tile" onClick={() => setAssetTrayOpen(true)} style={{ cursor: "pointer" }}>
                  <TileAssetPreview
                    project={state.project}
                    tile={state.project.tiles.find((t) => t.tileId === selectedPaintTileId) ?? null}
                    scale={2}
                  />
                </div>
              </div>

              {/* Tools group */}
              <div className="v2-dock-group">
                <V2ToolBtn label="Brush" shortcut="B" active={state.editor.levelTool === "brush"} onClick={() => dispatch({ type: "setLevelTool", tool: "brush" })}>
                  <Pencil />
                </V2ToolBtn>
                <V2ToolBtn label="Terrain" shortcut="T" active={state.editor.levelTool === "terrain"} onClick={() => dispatch({ type: "setLevelTool", tool: "terrain" })}>
                  <Grid3x3 />
                </V2ToolBtn>
                <V2ToolBtn label="Erase" shortcut="E" active={state.editor.levelTool === "erase"} onClick={() => dispatch({ type: "setLevelTool", tool: "erase" })}>
                  <Eraser />
                </V2ToolBtn>
                <V2ToolBtn label="Rect" shortcut="R" active={state.editor.levelTool === "rect"} onClick={() => dispatch({ type: "setLevelTool", tool: "rect" })}>
                  <RectangleHorizontal />
                </V2ToolBtn>
                <V2ToolBtn label="Fill" shortcut="G" active={state.editor.levelTool === "bucket"} onClick={() => dispatch({ type: "setLevelTool", tool: "bucket" })}>
                  <PaintBucket />
                </V2ToolBtn>
                <V2ToolBtn label="Collision" shortcut="C" active={state.editor.levelTool === "collisionRect"} onClick={() => dispatch({ type: "setLevelTool", tool: "collisionRect" })}>
                  <Shield />
                </V2ToolBtn>
                <V2ToolBtn
                  label="Marker"
                  shortcut="M"
                  active={state.editor.levelTool === "markerPoint" || state.editor.levelTool === "markerRect"}
                  onClick={() => dispatch({ type: "setLevelTool", tool: "markerPoint" })}
                >
                  <MapPin />
                </V2ToolBtn>
                <V2ToolBtn label="Hand" shortcut="H" active={state.editor.levelTool === "hand"} onClick={() => dispatch({ type: "setLevelTool", tool: "hand" })}>
                  <Move />
                </V2ToolBtn>
              </div>

              {/* Zoom group */}
              <div className="v2-dock-group">
                <V2ToolBtn label="Zoom Out" active={false} onClick={() => dispatch({ type: "setLevelZoom", zoom: clamp(state.editor.levelZoom * 0.9, 0.5, 8) })}>
                  <ZoomOut />
                </V2ToolBtn>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", minWidth: 42, textAlign: "center" }}>
                  {Math.round(state.editor.levelZoom * 100)}%
                </span>
                <V2ToolBtn label="Zoom In" active={false} onClick={() => dispatch({ type: "setLevelZoom", zoom: clamp(state.editor.levelZoom * 1.1, 0.5, 8) })}>
                  <ZoomIn />
                </V2ToolBtn>
              </div>
            </>
          ) : workspace === "atlas" && atlasModule === "slicer" ? (
            <>
              {/* Slicer mode group */}
              <div className="v2-dock-group">
                <V2ToolBtn label="Grid Slicer" active={state.editor.slicerMode === "grid"} onClick={() => dispatch({ type: "setSlicerMode", mode: "grid" })}>
                  <Grid3x3 />
                </V2ToolBtn>
                <V2ToolBtn label="Manual Slicer" active={state.editor.slicerMode === "manual"} onClick={() => dispatch({ type: "setSlicerMode", mode: "manual" })}>
                  <Pencil />
                </V2ToolBtn>
              </div>

              {/* Zoom group */}
              <div className="v2-dock-group">
                <V2ToolBtn label="Zoom Out" active={false} onClick={() => dispatch({ type: "setSlicerZoom", zoom: clamp(state.editor.slicerZoom * 0.9, 0.25, 8) })}>
                  <ZoomOut />
                </V2ToolBtn>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", minWidth: 42, textAlign: "center" }}>
                  {Math.round(state.editor.slicerZoom * 100)}%
                </span>
                <V2ToolBtn label="Zoom In" active={false} onClick={() => dispatch({ type: "setSlicerZoom", zoom: clamp(state.editor.slicerZoom * 1.1, 0.25, 8) })}>
                  <ZoomIn />
                </V2ToolBtn>
              </div>
            </>
          ) : null}
        </footer>
      )}
    </div>
  );
}
