import {
  AtlasInspector,
  LevelInspector,
  LevelSettingsInspector,
} from "./app-shell/inspectors";
import { LevelNavigator } from "./app-shell/navigator";
import { AtlasAssetsPanel, LevelAssetPicker } from "./app-shell/pickers";
import { TileAssetPreview, ToolButton, ZoomControls } from "./app-shell/shared";
import { AnimationWorkspace } from "./app-shell/timeline";
import { useAppShellController } from "./app-shell/useAppShellController";
import { AtlasWorkspace, LevelWorkspace } from "./app-shell/workspaces";

export function AppShell() {
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
    assetTrayOpen,
    setAssetTrayOpen,
    selectedPaintTileId,
    setSelectedPaintTileId,
    assetSearch,
    setAssetSearch,
    levelAssetTab,
    setLevelAssetTab,
    recentTileIds,
    recentTerrainSetIds,
    pinnedTileIds,
    quickPaletteTileIds,
    levelPan,
    slicerPan,
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
    createExampleProject,
    createLevelLayer,
    createAnimation,
    handleAnimationTick,
  } = controller;

  return (
    <main className="editor-shell">
      <header className="app-topbar panel">
        <span className="toolbar-kicker">Peanut Engine</span>
        <nav className="workspace-tabs">
          {(["atlas", "level", "animation"] as const).map((workspace) => (
            <button
              key={workspace}
              className={
                state.editor.workspace === workspace
                  ? "secondary active"
                  : "ghost"
              }
              onClick={() => {
                dispatch({ type: "setWorkspace", workspace });
                if (workspace === "atlas") {
                  setAssetTrayOpen(false);
                }
              }}
            >
              {workspace === "atlas" ? "◎ Atlas" : workspace === "level" ? "▤ Level" : "▷ Animation"}
            </button>
          ))}
        </nav>
        <div className="topbar-actions app-menubar">
          <details className="app-menu">
            <summary className="app-menu-trigger">File</summary>
            <div className="app-menu-panel panel">
              <label className="app-menu-item file-button">
                <span>Import PNG</span>
                <small>Add one or more source images.</small>
                <input
                  type="file"
                  accept=".png,image/png"
                  multiple
                  onChange={importImages}
                />
              </label>
              <label className="app-menu-item file-button">
                <span>Load Project</span>
                <small>Open a saved Peanut Tools project.</small>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={loadProject}
                />
              </label>
              <button className="app-menu-item" onClick={saveProject}>
                <span>Save Project</span>
                <small>Write the current project to disk.</small>
              </button>
            </div>
          </details>

          <details className="app-menu">
            <summary className="app-menu-trigger">Project</summary>
            <div className="app-menu-panel panel">
              <button
                className="app-menu-item"
                onClick={() =>
                  dispatch({
                    type: "replaceProject",
                    project: createExampleProject(),
                  })
                }
              >
                <span>Load Example</span>
                <small>Replace the current project with the sample.</small>
              </button>
            </div>
          </details>

          <details className="app-menu">
            <summary className="app-menu-trigger">Export</summary>
            <div className="app-menu-panel panel">
              <button
                className="app-menu-item"
                onClick={exportAtlas}
                disabled={!atlas}
              >
                <span>Export Atlas</span>
                <small>Build and save the packed atlas output.</small>
              </button>
              <button
                className="app-menu-item primary app-menu-item-primary"
                onClick={exportLevel}
                disabled={!level}
              >
                <span>Export Level</span>
                <small>Write the active level runtime data.</small>
              </button>
            </div>
          </details>
        </div>
      </header>

      <section className={`main-layout workspace-${state.editor.workspace}`}>
        {state.editor.workspace === "atlas" ? (
          <aside className="panel side-panel atlas-side-panel">
            <AtlasAssetsPanel
              project={state.project}
              sourceImages={state.project.sourceImages}
              selectedSourceImageId={selectedSourceImage?.id ?? null}
              atlasSprites={atlasSprites}
              onSelectSource={(sourceImageId) =>
                dispatch({ type: "setSelectedSourceImage", sourceImageId })
              }
              onDragStart={setDraggedSpriteIndex}
              onDrop={(toIndex) => {
                if (draggedSpriteIndex !== null) {
                  dispatch({
                    type: "reorderSprites",
                    fromIndex: draggedSpriteIndex,
                    toIndex,
                  });
                }
                setDraggedSpriteIndex(null);
              }}
              onRemoveSource={() => {}}
            />
          </aside>
        ) : null}

        {state.editor.workspace === "level" && level ? (
          <aside className="panel side-panel level-side-panel">
            <LevelNavigator
              levels={state.project.levels}
              selectedLevelId={level.id}
              selectedLayerId={layer?.id ?? null}
              onSelectLevel={(levelId) => {
                dispatch({ type: "setSelectedLevel", levelId });
                dispatch({ type: "setSelectedLayer", layerId: null });
              }}
              onSelectLayer={(layerId) =>
                dispatch({ type: "setSelectedLayer", layerId })
              }
              onRenameLevel={(levelId, name) => {
                const targetLevel = state.project.levels.find(
                  (entry) => entry.id === levelId,
                );
                if (!targetLevel) return;
                dispatch({
                  type: "updateLevel",
                  level: { ...targetLevel, name },
                });
              }}
              onRenameLayer={(layerId, name) =>
                dispatch({
                  type: "updateLevel",
                  level: {
                    ...level,
                    layers: level.layers.map((entry) =>
                      entry.id === layerId ? { ...entry, name } : entry,
                    ),
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
                      createLevelLayer(
                        `layer-${layerBase}`,
                        "Ground",
                        level.mapWidthTiles,
                        level.mapHeightTiles,
                        { hasTiles: true },
                      ),
                      createLevelLayer(
                        `layer-${layerBase + 1}`,
                        "Gameplay",
                        level.mapWidthTiles,
                        level.mapHeightTiles,
                        { hasCollision: true, hasMarkers: true },
                      ),
                      createLevelLayer(
                        `layer-${layerBase + 2}`,
                        "Foreground",
                        level.mapWidthTiles,
                        level.mapHeightTiles,
                        { hasTiles: true },
                      ),
                    ],
                    chunks: {},
                    collisions: [],
                    markers: [],
                  },
                });
              }}
              onRemoveLevel={() =>
                dispatch({ type: "removeLevel", levelId: level.id })
              }
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
                layer
                  ? dispatch({
                      type: "reorderLayer",
                      levelId: level.id,
                      layerId: layer.id,
                      direction: "up",
                    })
                  : undefined
              }
              onMoveLayerDown={() =>
                layer
                  ? dispatch({
                      type: "reorderLayer",
                      levelId: level.id,
                      layerId: layer.id,
                      direction: "down",
                    })
                  : undefined
              }
              onReorderLayer={(layerId, toIndex) =>
                dispatch({
                  type: "reorderLayer",
                  levelId: level.id,
                  layerId,
                  toIndex,
                })
              }
              onRemoveLayer={() =>
                layer
                  ? dispatch({
                      type: "removeLayer",
                      levelId: level.id,
                      layerId: layer.id,
                    })
                  : undefined
              }
            />
          </aside>
        ) : null}

        <section
          className={`panel workspace-panel ${state.editor.workspace}-workspace-panel ${state.editor.workspace === "level" ? "level-fullscreen" : ""} ${state.editor.workspace === "animation" ? "animation-fullscreen" : ""}`}
        >
          {state.editor.workspace === "atlas" ? (
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
              canvasRef={atlasCanvasRef}
              stageRef={atlasStageRef}
              onCreateSlices={createAtlasSlices}
              onWheel={(event) => handleWheelZoom(event, "slicer")}
              onStagePanStart={(event) =>
                handlePanStart(event, "slicer", false)
              }
              onStagePanMove={handlePanMove}
              onStagePanEnd={handlePanEnd}
              onCanvasPointerDown={(event) =>
                onSlicerPointerDown(event, "atlas")
              }
              onCanvasPointerMove={(event) =>
                onSlicerPointerMove(event, "atlas")
              }
              onCanvasPointerUp={() => onSlicerPointerUp("atlas")}
              onManualRectSelect={selectManualRect}
              packZoom={1}
              packPan={{ x: 0, y: 0 }}
              packStageRef={{ current: null }}
              onPackWheel={() => {}}
              onPackPanStart={() => {}}
              onPackPanMove={() => {}}
              onPackPanEnd={() => {}}
            />
          ) : state.editor.workspace === "animation" ? (
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
              rectDragStart={controller.rectDragStart}
              rectDragCurrent={controller.rectDragCurrent}
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

        {state.editor.workspace !== "animation" && <aside className="panel inspector-panel">
          <div className="panel-header">
            <h2>Inspector</h2>
            <span>{state.editor.workspace}</span>
          </div>
          {state.editor.workspace === "atlas" ? (
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
              onSlicerModeChange={(mode) =>
                dispatch({ type: "setSlicerMode", mode })
              }
              onClearManual={() => {
                setAtlasManualRects([]);
                setAtlasSelectedManualRectIndex(null);
                setAtlasManualDraft({
                  x: 0,
                  y: 0,
                  width: 32,
                  height: 32,
                  name: "",
                });
              }}
              onManualRectNameChange={(index, name) =>
                updateManualRect(index, { name })
              }
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
        </aside>}
      </section>

      {state.editor.workspace === "level" && assetTrayOpen ? (
        <LevelAssetPicker
          project={state.project}
          level={level}
          sourceImages={state.project.sourceImages}
          selectedSourceImageId={selectedSourceImage?.id ?? null}
          selectedSliceIds={state.editor.selectedSliceIds}
          selectedPaintTileId={selectedPaintTileId}
          selectedTerrainSetId={selectedTerrainSet?.id ?? null}
          terrainSets={levelTerrainSets}
          recentTileIds={recentTileIds}
          pinnedTileIds={pinnedTileIds}
          search={assetSearch}
          tab={levelAssetTab}
          onSearchChange={setAssetSearch}
          onTabChange={setLevelAssetTab}
          onClose={() => setAssetTrayOpen(false)}
          onSelectSource={(sourceImageId) =>
            dispatch({ type: "setSelectedSourceImage", sourceImageId })
          }
          onToggleSlice={(sliceId) =>
            dispatch({ type: "toggleSliceSelection", sliceId })
          }
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
          onSetTerrainSet={(terrainSetId) =>
            dispatch({ type: "setSelectedTerrainSet", terrainSetId })
          }
          onRemoveTerrainSet={(terrainSetId) =>
            dispatch({ type: "removeTerrainSet", terrainSetId })
          }
          onCreateTerrainSet={() => {
            if (!level) return;
            dispatch({
              type: "upsertTerrainSet",
              terrainSet: {
                id: state.project.idCounters.terrainSet,
                name: `${level.name}_terrain`,
                tilesetId: 0,
                levelId: level.id,
                slots: {
                  0: selectedPaintTileId || effectiveLevelTileIds[0] || 0,
                },
                mode: "cardinal",
                blobMap: {},
              },
            });
          }}
          onAssignTerrainSlot={(slot) => {
            if (!selectedTerrainSet) return;
            dispatch({
              type: "upsertTerrainSet",
              terrainSet: {
                ...selectedTerrainSet,
                slots: {
                  ...selectedTerrainSet.slots,
                  [slot]: selectedPaintTileId,
                },
              },
            });
          }}
          onUpdateTerrainSet={(terrainSet) =>
            dispatch({ type: "upsertTerrainSet", terrainSet })
          }
          selectedAnimatedTileId={state.editor.selectedAnimatedTileId}
          animatedTiles={state.project.animatedTiles}
          onSelectAnimatedTile={(id) =>
            dispatch({ type: "setSelectedAnimatedTile", animatedTileId: id })
          }
          onCreateAnimatedTile={() => {
            const id = state.project.idCounters.animatedTile;
            dispatch({
              type: "upsertAnimatedTile",
              animatedTile: {
                id,
                name: `anim_tile_${String(id).padStart(2, "0")}`,
                baseTileId: selectedPaintTileId || effectiveLevelTileIds[0] || 0,
                frames: [],
              },
            });
          }}
          onRemoveAnimatedTile={(id) =>
            dispatch({ type: "removeAnimatedTile", animatedTileId: id })
          }
          onUpdateAnimatedTile={(animatedTile) =>
            dispatch({ type: "upsertAnimatedTile", animatedTile })
          }
        />
      ) : null}

      {state.editor.workspace !== "animation" ? <section className="panel bottom-dock">
        {state.editor.workspace === "level" ? (
          <button
            className={
              assetTrayOpen
                ? "secondary active dock-assets-button"
                : "ghost dock-assets-button"
            }
            onClick={() => setAssetTrayOpen((current) => !current)}
            aria-label="Assets (A)"
            data-tooltip="Assets (A)"
          >
            <span className="dock-assets-icon">◫</span>
          </button>
        ) : null}
        {state.editor.workspace === "level" ? (
          <>
            <div className="dock-group dock-group-history">
              <ToolButton
                icon="↶"
                label="Undo"
                shortcut="Cmd/Ctrl+Z"
                active={false}
                onClick={() => dispatch({ type: "undo" })}
              />
              <ToolButton
                icon="↷"
                label="Redo"
                shortcut="Shift+Z/Y"
                active={false}
                onClick={() => dispatch({ type: "redo" })}
              />
            </div>
            <div className="dock-group dock-group-palette">
              <div className="quick-palette">
                <div className="quick-palette-active">
                  <button
                    className={
                      pinnedTileIds.includes(selectedPaintTileId)
                        ? "quick-palette-active-btn pinned"
                        : "quick-palette-active-btn"
                    }
                    onClick={() => setAssetTrayOpen(true)}
                    aria-label="Brush Tile"
                    data-tooltip="Brush Tile"
                  >
                    <TileAssetPreview
                      project={state.project}
                      tile={
                        state.project.tiles.find(
                          (tile) => tile.tileId === selectedPaintTileId,
                        ) ?? null
                      }
                      scale={2}
                    />
                  </button>
                </div>
                <div className="quick-palette-strip">
                  {quickPaletteTileIds.map((tileId, index) => {
                    const tile =
                      state.project.tiles.find(
                        (entry) => entry.tileId === tileId,
                      ) ?? null;
                    const keyLabel = index === 9 ? "0" : String(index + 1);
                    return (
                      <button
                        key={tileId}
                        className={
                          tileId === selectedPaintTileId
                            ? "quick-palette-slot active"
                            : "quick-palette-slot"
                        }
                        onClick={() => {
                          setSelectedPaintTileId(tileId);
                          pushRecentTile(tileId);
                          dispatch({ type: "setLevelTool", tool: "brush" });
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          togglePinnedTile(tileId);
                        }}
                        aria-label={`${keyLabel}: ${tile?.name ?? `Tile #${tileId}`} (${pinnedTileIds.includes(tileId) ? "pinned" : "recent"})`}
                        data-tooltip={`${keyLabel}: ${tile?.name ?? `Tile #${tileId}`} (${pinnedTileIds.includes(tileId) ? "pinned" : "recent"})`}
                      >
                        <span className="quick-palette-slot-key">
                          {keyLabel}
                        </span>
                        <TileAssetPreview
                          project={state.project}
                          tile={tile}
                          scale={2}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="dock-group dock-group-tools">
              <ToolButton
                icon="⌖"
                label="Select"
                shortcut="V"
                active={state.editor.levelTool === "select"}
                onClick={() =>
                  dispatch({ type: "setLevelTool", tool: "select" })
                }
              />
              <ToolButton
                icon="◧"
                label="Brush"
                shortcut="B"
                active={state.editor.levelTool === "brush"}
                onClick={() =>
                  dispatch({ type: "setLevelTool", tool: "brush" })
                }
              />
              <ToolButton
                icon="≈"
                label="Terrain"
                shortcut="T"
                active={state.editor.levelTool === "terrain"}
                onClick={() =>
                  dispatch({ type: "setLevelTool", tool: "terrain" })
                }
              />
              <ToolButton
                icon="⌫"
                label="Erase"
                shortcut="E"
                active={state.editor.levelTool === "erase"}
                onClick={() =>
                  dispatch({ type: "setLevelTool", tool: "erase" })
                }
              />
              <ToolButton
                icon="▭"
                label="Rect"
                shortcut="R"
                active={state.editor.levelTool === "rect"}
                onClick={() => dispatch({ type: "setLevelTool", tool: "rect" })}
              />
              <ToolButton
                icon="◪"
                label="Fill"
                shortcut="G"
                active={state.editor.levelTool === "bucket"}
                onClick={() =>
                  dispatch({ type: "setLevelTool", tool: "bucket" })
                }
              />
              <ToolButton
                icon="⊠"
                label="Collision"
                shortcut="C"
                active={state.editor.levelTool === "collisionRect"}
                onClick={() =>
                  dispatch({ type: "setLevelTool", tool: "collisionRect" })
                }
              />
              <ToolButton
                icon="✛"
                label="Marker"
                shortcut="M"
                active={
                  state.editor.levelTool === "markerPoint" ||
                  state.editor.levelTool === "markerRect"
                }
                onClick={() =>
                  dispatch({ type: "setLevelTool", tool: "markerPoint" })
                }
              />
              <ToolButton
                icon="✥"
                label="Hand"
                shortcut="H"
                active={state.editor.levelTool === "hand"}
                onClick={() => dispatch({ type: "setLevelTool", tool: "hand" })}
              />
            </div>
            <div className="dock-group dock-group-zoom">
              <ZoomControls
                zoom={state.editor.levelZoom}
                onChange={(value) =>
                  dispatch({ type: "setLevelZoom", zoom: value })
                }
              />
            </div>
          </>
        ) : state.editor.workspace === "atlas" && atlasModule === "slicer" ? (
          <>
            <ToolButton
              icon="▦"
              label="Grid"
              active={state.editor.slicerMode === "grid"}
              onClick={() => dispatch({ type: "setSlicerMode", mode: "grid" })}
            />
            <ToolButton
              icon="✎"
              label="Manual"
              active={state.editor.slicerMode === "manual"}
              onClick={() =>
                dispatch({ type: "setSlicerMode", mode: "manual" })
              }
            />
            <ZoomControls
              zoom={state.editor.slicerZoom}
              onChange={(value) =>
                dispatch({ type: "setSlicerZoom", zoom: value })
              }
            />
          </>
        ) : null}
      </section> : null}
    </main>
  );
}
