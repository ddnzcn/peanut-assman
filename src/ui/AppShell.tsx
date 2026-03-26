import {
  ChangeEvent,
  DragEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createExampleProject } from "../model/exampleProject";
import { createLevelLayer } from "../model/project";
import { buildAtlasFromProject, getSelectedLayer, getSelectedLevel, getSelectedTerrainSet, getSelectedTileset } from "../model/selectors";
import { useProjectStore } from "../model/store";
import { createGridSlices, createManualSlices, createSourceSlicesFromImages, fileToSourceImageAsset, previewGridSlices } from "../image";
import { addCollision, addMarker, bucketFill, buildMarker, fillRect, getTileAt, paintTile } from "../level/editor";
import { buildProjectJsonBlob, exportLevelDebugJson, exportTilemapBin, loadProjectFromFile } from "../export";
import type {
  BuildOptions,
  CollisionObject,
  GridSliceOptions,
  LevelDocument,
  LevelLayer,
  LevelTool,
  ManualSliceRect,
  MarkerObject,
  PackedAtlas,
  ProjectDocument,
  SliceAsset,
  SliceKind,
  SliceRect,
  SourceImageAsset,
  TerrainSet,
  TilesetAsset,
  TilesetTileAsset,
} from "../types";
import { clamp, downloadBlob, fileNameBase, fnv1a32, formatBytes } from "../utils";

const DEFAULT_TILESET_GRID: GridSliceOptions = {
  frameWidth: 16,
  frameHeight: 16,
  spacingX: 0,
  spacingY: 0,
  marginX: 0,
  marginY: 0,
  endOffsetX: 0,
  endOffsetY: 0,
  keepEmpty: true,
  namePrefix: "tile",
  sliceKind: "tile",
};

const DEFAULT_ATLAS_GRID: GridSliceOptions = {
  ...DEFAULT_TILESET_GRID,
  namePrefix: "sprite",
  sliceKind: "sprite",
};

const DEFAULT_MANUAL_RECT: ManualSliceRect = {
  x: 0,
  y: 0,
  width: 32,
  height: 32,
  name: "",
};

type SlicerCanvasTool = "draw" | "move";

export const CARDINAL_MASKS: Record<string, number> = {
  // 4x4 Grid (Row_Col) mapping to bitmasks 0-15
  "00_00": 0,  "00_01": 1,  "00_02": 2,  "00_03": 3,
  "01_00": 4,  "01_01": 5,  "01_02": 6,  "01_03": 7,
  "02_00": 8,  "02_01": 9,  "02_02": 10, "02_03": 11,
  "03_00": 12, "03_01": 13, "03_02": 14, "03_03": 15,
};

export function AppShell() {
  const { state, dispatch } = useProjectStore();
  const level = getSelectedLevel(state);
  const layer = getSelectedLayer(state);
  const selectedTileset = getSelectedTileset(state);
  const selectedTerrainSet = getSelectedTerrainSet(state);
  const selectedSourceImage =
    state.project.sourceImages.find((source) => source.id === state.editor.selectedSourceImageId) ??
    state.project.sourceImages[0] ??
    null;
  const selectedSlices = state.project.slices.filter((slice) =>
    state.editor.selectedSliceIds.includes(slice.id),
  );

  const [atlas, setAtlas] = useState<PackedAtlas | null>(null);
  const [status, setStatus] = useState("Ready");
  const [assetTrayOpen, setAssetTrayOpen] = useState(false);
  const [selectedPaintTileId, setSelectedPaintTileId] = useState(0);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetTab, setAssetTab] = useState<"tilesets" | "tiles">("tiles");
  const [levelAssetTab, setLevelAssetTab] = useState<"tilesets" | "tiles" | "terrain">("tiles");
  const [recentTileIds, setRecentTileIds] = useState<number[]>([]);
  const [recentTerrainSetIds, setRecentTerrainSetIds] = useState<number[]>([]);
  const [levelPan, setLevelPan] = useState({ x: 0, y: 0 });
  const [slicerPan, setSlicerPan] = useState({ x: 0, y: 0 });
  const [draggedSpriteIndex, setDraggedSpriteIndex] = useState<number | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [atlasModule, setAtlasModule] = useState<"pack" | "slicer">("pack");



  const [tilesetGridOptions, setTilesetGridOptions] = useState<GridSliceOptions>(DEFAULT_TILESET_GRID);
  const [atlasGridOptions, setAtlasGridOptions] = useState<GridSliceOptions>(DEFAULT_ATLAS_GRID);
  const [tilesetManualRects, setTilesetManualRects] = useState<ManualSliceRect[]>([]);
  const [atlasManualRects, setAtlasManualRects] = useState<ManualSliceRect[]>([]);
  const [tilesetManualKind, setTilesetManualKind] = useState<SliceKind>("tile");
  const [atlasManualKind, setAtlasManualKind] = useState<SliceKind>("sprite");
  const [tilesetManualDraft, setTilesetManualDraft] = useState<ManualSliceRect>(DEFAULT_MANUAL_RECT);
  const [atlasManualDraft, setAtlasManualDraft] = useState<ManualSliceRect>(DEFAULT_MANUAL_RECT);
  const [tilesetSelectedManualRectIndex, setTilesetSelectedManualRectIndex] = useState<number | null>(null);
  const [atlasSelectedManualRectIndex, setAtlasSelectedManualRectIndex] = useState<number | null>(null);

  function updateManualRect(target: "tileset" | "atlas", index: number, patch: Partial<ManualSliceRect>) {
    if (target === "tileset") {
      setTilesetManualRects((current) =>
        current.map((rect, rectIndex) => (rectIndex === index ? { ...rect, ...patch } : rect)),
      );
      if (tilesetSelectedManualRectIndex === index) {
        setTilesetManualDraft((current) => ({ ...current, ...patch }));
      }
      return;
    }
    setAtlasManualRects((current) =>
      current.map((rect, rectIndex) => (rectIndex === index ? { ...rect, ...patch } : rect)),
    );
    if (atlasSelectedManualRectIndex === index) {
      setAtlasManualDraft((current) => ({ ...current, ...patch }));
    }
  }
  const [slicerCanvasTool, setSlicerCanvasTool] = useState<SlicerCanvasTool>("draw");
  const [dragRect, setDragRect] = useState<SliceRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [moveStart, setMoveStart] = useState<{ x: number; y: number } | null>(null);
  const [moveOrigin, setMoveOrigin] = useState<ManualSliceRect | null>(null);
  const [movingTarget, setMovingTarget] = useState<"tileset" | "atlas" | null>(null);

  const tilesetCanvasRef = useRef<HTMLDivElement | null>(null);
  const atlasCanvasRef = useRef<HTMLDivElement | null>(null);
  const tilesetStageRef = useRef<HTMLDivElement | null>(null);
  const atlasStageRef = useRef<HTMLDivElement | null>(null);
  const levelStageRef = useRef<HTMLDivElement | null>(null);
  const levelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    workspace: "level" | "slicer";
  } | null>(null);

  const atlasSprites = useMemo(
    () =>
      state.project.sprites.filter((sprite) => sprite.includeInAtlas).map((sprite) => ({
        sprite,
        slice: state.project.slices.find((slice) => slice.id === sprite.sliceId) ?? null,
      })),
    [state.project.slices, state.project.sprites],
  );

  const tilePalette = useMemo(() => {
    if (!selectedTileset) {
      return [];
    }
    return selectedTileset.tileIds
      .map((tileId) => state.project.tiles.find((tile) => tile.tileId === tileId))
      .filter((tile): tile is TilesetTileAsset => Boolean(tile));
  }, [selectedTileset, state.project.tiles]);
  const tilesetTerrainSets = useMemo(
    () =>
      selectedTileset
        ? state.project.terrainSets.filter((terrainSet) => terrainSet.tilesetId === selectedTileset.id)
        : [],
    [selectedTileset, state.project.terrainSets],
  );
  const terrainTileToSetId = useMemo(() => {
    const map = new Map<number, number>();
    state.project.terrainSets.forEach((terrainSet) => {
      Object.values(terrainSet.slots).forEach((tileId) => {
        if (tileId) {
          map.set(tileId, terrainSet.id);
        }
      });
    });
    return map;
  }, [state.project.terrainSets]);

  const tilesetGridPreview = useMemo(
    () => (selectedSourceImage ? previewGridSlices(selectedSourceImage, tilesetGridOptions) : []),
    [selectedSourceImage, tilesetGridOptions],
  );
  const atlasGridPreview = useMemo(
    () => (selectedSourceImage ? previewGridSlices(selectedSourceImage, atlasGridOptions) : []),
    [selectedSourceImage, atlasGridOptions],
  );

  useEffect(() => {
    let cancelled = false;
    buildAtlasFromProject(state.project)
      .then((result) => {
        if (!cancelled) {
          setAtlas((current) => {
            current?.pages.forEach((page) => URL.revokeObjectURL(page.blobUrl));
            return result;
          });
        }
      })
      .catch((error) => dispatch({ type: "setError", error: error instanceof Error ? error.message : String(error) }));
    return () => {
      cancelled = true;
    };
  }, [dispatch, state.project]);

  useEffect(() => {
    renderLevelCanvas(levelCanvasRef.current, state.project, level, layer, state.editor.levelZoom);
  }, [level, layer, state.project, state.editor.levelZoom]);

  useEffect(() => {
    if (!selectedPaintTileId && tilePalette[0]) {
      setSelectedPaintTileId(tilePalette[0].tileId);
    }
  }, [selectedPaintTileId, tilePalette]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.code === "Space") {
        setSpaceHeld(true);
      }
      if ((event.metaKey || event.ctrlKey) && ["=", "-", "0"].includes(event.key)) {
        event.preventDefault();
        if (event.key === "=") zoomWorkspace(0.25);
        if (event.key === "-") zoomWorkspace(-0.25);
        if (event.key === "0") resetWorkspaceZoom();
      }
      if (state.editor.workspace === "level") {
        if (event.key === "v") dispatch({ type: "setLevelTool", tool: "select" });
        if (event.key === "b") dispatch({ type: "setLevelTool", tool: "brush" });
        if (event.key === "t") dispatch({ type: "setLevelTool", tool: "terrain" });
        if (event.key === "e") dispatch({ type: "setLevelTool", tool: "erase" });
        if (event.key === "r") dispatch({ type: "setLevelTool", tool: "rect" });
        if (event.key === "g") dispatch({ type: "setLevelTool", tool: "bucket" });
        if (event.key === "h") dispatch({ type: "setLevelTool", tool: "hand" });
        if (event.key === "c") dispatch({ type: "setLevelTool", tool: "collisionRect" });
        if (event.key === "m") dispatch({ type: "setLevelTool", tool: event.shiftKey ? "markerRect" : "markerPoint" });
      }

      if (
        state.editor.slicerMode === "manual" &&
        (state.editor.workspace === "tileset" || (state.editor.workspace === "atlas" && atlasModule === "slicer"))
      ) {
        if (event.key === "v") {
          setSlicerCanvasTool("move");
        }
        if (event.key === "d") {
          setSlicerCanvasTool("draw");
        }
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && selectedSourceImage) {
          event.preventDefault();
          const target = state.editor.workspace === "tileset" ? "tileset" : "atlas";
          const selectedIndex =
            target === "tileset" ? tilesetSelectedManualRectIndex : atlasSelectedManualRectIndex;
          if (selectedIndex === null) {
            return;
          }
          const step = event.shiftKey ? 10 : 1;
          const rects = target === "tileset" ? tilesetManualRects : atlasManualRects;
          const rect = rects[selectedIndex];
          if (!rect) {
            return;
          }
          const patch: Partial<ManualSliceRect> = {};
          if (event.key === "ArrowLeft") patch.x = clamp(rect.x - step, 0, selectedSourceImage.width - rect.width);
          if (event.key === "ArrowRight") patch.x = clamp(rect.x + step, 0, selectedSourceImage.width - rect.width);
          if (event.key === "ArrowUp") patch.y = clamp(rect.y - step, 0, selectedSourceImage.height - rect.height);
          if (event.key === "ArrowDown") patch.y = clamp(rect.y + step, 0, selectedSourceImage.height - rect.height);
          updateManualRect(target, selectedIndex, patch);
          if (target === "tileset") {
            setTilesetManualDraft((current) => ({ ...current, ...patch }));
          } else {
            setAtlasManualDraft((current) => ({ ...current, ...patch }));
          }
        }
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setSpaceHeld(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    atlasManualRects,
    atlasModule,
    atlasSelectedManualRectIndex,
    dispatch,
    selectedSourceImage,
    state.editor.levelZoom,
    state.editor.slicerMode,
    state.editor.slicerZoom,
    state.editor.workspace,
    tilesetManualRects,
    tilesetSelectedManualRectIndex,
  ]);

  useEffect(() => {
    function onWheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const stage =
      state.editor.workspace === "atlas" && atlasModule === "slicer"
        ? atlasStageRef.current
        : state.editor.workspace === "tileset"
          ? tilesetStageRef.current
          : null;
    if (!selectedSourceImage || !stage) {
      return;
    }
    const fitX = (stage.clientWidth - 48) / selectedSourceImage.width;
    const fitY = (stage.clientHeight - 48) / selectedSourceImage.height;
    const nextZoom = clamp(Math.min(fitX, fitY, 8), 1, 8);
    dispatch({ type: "setSlicerZoom", zoom: nextZoom });
    requestAnimationFrame(() => {
      setSlicerPan({
        x: (stage.clientWidth - selectedSourceImage.width * nextZoom) * 0.5,
        y: (stage.clientHeight - selectedSourceImage.height * nextZoom) * 0.5,
      });
    });
  }, [atlasModule, dispatch, selectedSourceImage, state.editor.workspace]);

  useEffect(() => {
    const stage = levelStageRef.current;
    if (!stage || !level) {
      return;
    }
    requestAnimationFrame(() => {
      setLevelPan({
        x: (stage.clientWidth - level.mapWidthTiles * level.tileWidth * state.editor.levelZoom) * 0.5,
        y: (stage.clientHeight - level.mapHeightTiles * level.tileHeight * state.editor.levelZoom) * 0.5,
      });
    });
  }, [level?.id]);

  function zoomWorkspace(delta: number) {
    if (state.editor.workspace === "level") {
      dispatch({ type: "setLevelZoom", zoom: state.editor.levelZoom + delta });
    } else {
      dispatch({ type: "setSlicerZoom", zoom: state.editor.slicerZoom + delta });
    }
  }

  function resetWorkspaceZoom() {
    if (state.editor.workspace === "level") {
      dispatch({ type: "setLevelZoom", zoom: 1 });
    } else {
      dispatch({ type: "setSlicerZoom", zoom: 1 });
    }
  }

  function setError(error: string | null) {
    dispatch({ type: "setError", error });
  }

  function pushRecentTile(tileId: number) {
    if (!tileId) {
      return;
    }
    setRecentTileIds((current) => [tileId, ...current.filter((entry) => entry !== tileId)].slice(0, 8));
  }

  function pushRecentTerrainSet(terrainSetId: number | null) {
    if (!terrainSetId) {
      return;
    }
    setRecentTerrainSetIds((current) => [terrainSetId, ...current.filter((entry) => entry !== terrainSetId)].slice(0, 6));
  }

  async function importImages(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList?.length) {
      return;
    }
    dispatch({ type: "setBusy", busy: true });
    try {
      const nextSources: SourceImageAsset[] = [];
      let nextId = state.project.idCounters.sourceImage;
      for (const file of [...fileList]) {
        if (!file.type.includes("png") && !file.name.toLowerCase().endsWith(".png")) {
          continue;
        }
        nextSources.push(await fileToSourceImageAsset(file, `source-${nextId}`));
        nextId += 1;
      }
      dispatch({ type: "addSourceImages", sources: nextSources });
      if (state.editor.workspace === "atlas") {
        const result = await createSourceSlicesFromImages(
          nextSources,
          state.project.idCounters.slice,
          state.project.idCounters.sprite,
        );
        dispatch({ type: "addSlices", slices: result.slices, sprites: result.sprites });
      }
      if (nextSources[0]) {
        setTilesetGridOptions((current) => ({ ...current, namePrefix: fileNameBase(nextSources[0].fileName) }));
        setAtlasGridOptions((current) => ({ ...current, namePrefix: fileNameBase(nextSources[0].fileName) }));
      }
      setStatus(`Imported ${nextSources.length} PNG source${nextSources.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to import PNGs.");
    } finally {
      dispatch({ type: "setBusy", busy: false });
    }
  }

  async function createTilesetSlices() {
    if (!selectedSourceImage) {
      return;
    }
    const result =
      state.editor.slicerMode === "manual"
        ? await createManualSlices(
            selectedSourceImage,
            tilesetManualRects,
            tilesetManualKind,
            state.project.idCounters.slice,
          )
        : await createGridSlices(
            selectedSourceImage,
            tilesetGridOptions,
            state.project.idCounters.slice,
          );
    dispatch({ type: "addSlices", slices: result.slices });
    setTilesetManualRects([]);
    setTilesetManualDraft(DEFAULT_MANUAL_RECT);
    setTilesetSelectedManualRectIndex(null);
    setStatus(`Created ${result.slices.length} level slices.`);
  }

  async function createAtlasSlices() {
    if (!selectedSourceImage) {
      return;
    }
    const fullSourceSliceIds = state.project.slices
      .filter(
        (slice) =>
          slice.sourceImageId === selectedSourceImage.id &&
          slice.sourceRect.x === 0 &&
          slice.sourceRect.y === 0 &&
          slice.sourceRect.width === selectedSourceImage.width &&
          slice.sourceRect.height === selectedSourceImage.height,
      )
      .map((slice) => slice.id);
    const result =
      state.editor.slicerMode === "manual"
        ? await createManualSlices(
            selectedSourceImage,
            atlasManualRects,
            atlasManualKind,
            state.project.idCounters.slice,
          )
        : await createGridSlices(
            selectedSourceImage,
            atlasGridOptions,
            state.project.idCounters.slice,
          );
    if (fullSourceSliceIds.length) {
      dispatch({ type: "removeSlicesFromAtlas", sliceIds: fullSourceSliceIds });
    }
    dispatch({ type: "addSlices", slices: result.slices });
    setAtlasManualRects([]);
    setAtlasManualDraft(DEFAULT_MANUAL_RECT);
    setAtlasSelectedManualRectIndex(null);
    setStatus(`Created ${result.slices.length} atlas slices.`);
  }

  function addSelectedSlicesToAtlas() {
    if (!state.editor.selectedSliceIds.length) {
      setError("Select slices first.");
      return;
    }
    dispatch({ type: "addSlicesToAtlas", sliceIds: state.editor.selectedSliceIds });
    setStatus(`Added ${state.editor.selectedSliceIds.length} slice${state.editor.selectedSliceIds.length === 1 ? "" : "s"} to atlas.`);
    setAtlasModule("pack");
  }

  function publishTileset() {
    if (!selectedSlices.length) {
      setError("Select imported slices in the asset tray before publishing.");
      return;
    }
    const tileSlices = selectedSlices.filter((slice) => slice.kind === "tile" || slice.kind === "both");
    const spriteBySliceId = new Map(state.project.sprites.map((sprite) => [sprite.sliceId, sprite]));
    const nextSprites: ProjectDocument["sprites"] = [];
    let nextSpriteId = state.project.idCounters.sprite;
    const firstTileId = Math.max(1, state.project.idCounters.tile);
    const tiles: TilesetTileAsset[] = tileSlices.flatMap((slice, index) => {
      let sprite = spriteBySliceId.get(slice.id);
      if (!sprite) {
        const name = `${slice.name}.png`;
        sprite = {
          id: nextSpriteId,
          sliceId: slice.id,
          name,
          nameHash: fnv1a32(name),
          includeInAtlas: false,
        };
        nextSprites.push(sprite);
        nextSpriteId += 1;
      }
      return [
        {
          tileId: firstTileId + index,
          sliceId: slice.id,
          spriteId: sprite.id,
          name: slice.name,
        },
      ];
    });
    if (!tiles.length) {
      setError("Selected slices need tile-tagged slices before they can become a tileset.");
      return;
    }
    const tileset: TilesetAsset = {
      id: state.project.idCounters.tileset,
      name: state.editor.tilesetDraft.name,
      nameHash: fnv1a32(state.editor.tilesetDraft.name),
      tileWidth: state.editor.tilesetDraft.tileWidth,
      tileHeight: state.editor.tilesetDraft.tileHeight,
      columns: state.editor.tilesetDraft.columns,
      flags: 0,
      firstTileId,
      firstAtlasSpriteId: Math.min(...tiles.map((tile) => tile.spriteId)),
      tileCount: tiles.length,
      tileIds: tiles.map((tile) => tile.tileId),
    };
    dispatch({ type: "publishTileset", tileset, tiles, sprites: nextSprites });
    setSelectedPaintTileId(tiles[0]?.tileId ?? 0);
    setStatus(`Published level tileset "${tileset.name}".`);
  }

  async function saveProject() {
    downloadBlob(buildProjectJsonBlob(state.project), `${fileNameBase(state.project.name)}.project.json`);
  }

  async function loadProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      dispatch({ type: "replaceProject", project: await loadProjectFromFile(file) });
      setStatus(`Loaded ${file.name}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load project.");
    }
  }

  function exportAtlas() {
    if (!atlas) {
      return;
    }
    downloadBlob(new Blob([new Uint8Array(atlas.atlasBin)]), "atlas.bin");
    downloadBlob(new Blob([new Uint8Array(atlas.atlasMetaBin)]), "atlas.meta.bin");
    if (state.project.atlasSettings.includeDebugJson) {
      downloadBlob(new Blob([atlas.atlasDebugJson], { type: "application/json" }), "atlas.debug.json");
    }
  }

  function exportLevel() {
    if (!level) {
      return;
    }
    const bytes = exportTilemapBin(state.project, level);
    downloadBlob(new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }), `${level.name}.tmap.bin`);
    downloadBlob(new Blob([exportLevelDebugJson(state.project, level)], { type: "application/json" }), `${level.name}.debug.json`);
  }


  function resolveTerrainTileId(levelDocument: LevelDocument, levelLayer: LevelLayer, tileX: number, tileY: number, terrainSet: TerrainSet) {
    const isTerrainAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= levelLayer.widthTiles || y >= levelLayer.heightTiles) {
        return false;
      }
      const tileId = getTileAt(levelDocument, levelLayer, x, y).tileId;
      return terrainTileToSetId.get(tileId) === terrainSet.id;
    };

    // 4-Bit Cardinal Bitmask (N:1, S:2, W:4, E:8)
    let mask = 0;
    if (isTerrainAt(tileX, tileY - 1)) mask |= 1;
    if (isTerrainAt(tileX, tileY + 1)) mask |= 2;
    if (isTerrainAt(tileX - 1, tileY)) mask |= 4;
    if (isTerrainAt(tileX + 1, tileY)) mask |= 8;

    return terrainSet.slots[mask] || terrainSet.slots[0] || 0;
  }

  function applyTerrainBrush(levelDocument: LevelDocument, levelLayer: LevelLayer, tileX: number, tileY: number, terrainSet: TerrainSet) {
    let next = paintTile(levelDocument, levelLayer, tileX, tileY, terrainSet.slots[0] || 0);
    for (let sampleY = tileY - 1; sampleY <= tileY + 1; sampleY += 1) {
      for (let sampleX = tileX - 1; sampleX <= tileX + 1; sampleX += 1) {
        if (sampleX < 0 || sampleY < 0 || sampleX >= levelLayer.widthTiles || sampleY >= levelLayer.heightTiles) {
          continue;
        }
        const currentTile = getTileAt(next, levelLayer, sampleX, sampleY).tileId;
        if (terrainTileToSetId.get(currentTile) !== terrainSet.id) {
          continue;
        }
        next = paintTile(next, levelLayer, sampleX, sampleY, resolveTerrainTileId(next, levelLayer, sampleX, sampleY, terrainSet));
      }
    }
    return next;
  }

  function handleLevelPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!level || !layer || spaceHeld || state.editor.levelTool === "hand") {
      return;
    }
    const point = getCanvasTile(event, levelCanvasRef.current, level, state.editor.levelZoom);
    if (!point) {
      return;
    }
    const paintTileId = selectedPaintTileId || selectedTileset?.tileIds[0] || 0;
    if (layer.hasTiles && state.editor.levelTool === "brush") {
      dispatch({ type: "updateLevel", level: paintTile(level, layer, point.x, point.y, paintTileId) });
    } else if (layer.hasTiles && state.editor.levelTool === "terrain" && selectedTerrainSet) {
      dispatch({ type: "updateLevel", level: applyTerrainBrush(level, layer, point.x, point.y, selectedTerrainSet) });
    } else if (layer.hasTiles && state.editor.levelTool === "erase") {
      dispatch({ type: "updateLevel", level: paintTile(level, layer, point.x, point.y, 0) });
    } else if (layer.hasTiles && state.editor.levelTool === "bucket") {
      dispatch({ type: "updateLevel", level: bucketFill(level, layer, point.x, point.y, paintTileId) });
    } else if (layer.hasTiles && state.editor.levelTool === "rect") {
      setDragStart(point);
    } else if (layer.hasCollision && state.editor.levelTool === "collisionRect") {
      const collision: CollisionObject = {
        id: state.project.idCounters.collision,
        layerId: layer.id,
        type: "Solid",
        flags: 4,
        x: point.x * level.tileWidth,
        y: point.y * level.tileHeight,
        w: level.tileWidth,
        h: level.tileHeight,
        userData0: 0,
        userData1: 0,
      };
      dispatch({ type: "updateLevel", level: addCollision(level, collision) });
    } else if (layer.hasMarkers && (state.editor.levelTool === "markerPoint" || state.editor.levelTool === "markerRect")) {
      const marker: MarkerObject = buildMarker(
        state.project.idCounters.marker,
        layer.id,
        state.editor.levelTool === "markerPoint" ? "Point" : "Rect",
        point.x,
        point.y,
        level.tileWidth,
        level.tileHeight,
      );
      dispatch({ type: "updateLevel", level: addMarker(level, marker) });
    }
  }

  function handleLevelPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!level || !layer || !layer.hasTiles || spaceHeld) {
      return;
    }
    const point = getCanvasTile(event, levelCanvasRef.current, level, state.editor.levelZoom);
    if (!point) {
      return;
    }
    const paintTileId = selectedPaintTileId || selectedTileset?.tileIds[0] || 0;
    if (state.editor.levelTool === "brush" && event.buttons === 1) {
      dispatch({ type: "updateLevel", level: paintTile(level, layer, point.x, point.y, paintTileId) });
    }
    if (state.editor.levelTool === "terrain" && event.buttons === 1 && selectedTerrainSet) {
      dispatch({ type: "updateLevel", level: applyTerrainBrush(level, layer, point.x, point.y, selectedTerrainSet) });
    }
    if (state.editor.levelTool === "erase" && event.buttons === 1) {
      dispatch({ type: "updateLevel", level: paintTile(level, layer, point.x, point.y, 0) });
    }
  }

  function handleLevelPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!level || !layer || !dragStart || !layer.hasTiles || state.editor.levelTool !== "rect") {
      setDragStart(null);
      return;
    }
    const point = getCanvasTile(event, levelCanvasRef.current, level, state.editor.levelZoom);
    if (!point) {
      setDragStart(null);
      return;
    }
    const paintTileId = selectedPaintTileId || selectedTileset?.tileIds[0] || 0;
    dispatch({
      type: "updateLevel",
      level: fillRect(level, layer, dragStart.x, dragStart.y, point.x, point.y, paintTileId),
    });
    setDragStart(null);
  }

  function onSlicerPointerDown(event: ReactPointerEvent<HTMLDivElement>, target: "tileset" | "atlas") {
    if (!selectedSourceImage || state.editor.slicerMode !== "manual" || spaceHeld) {
      return;
    }
    const point = getImagePoint(
      event,
      target === "tileset" ? tilesetCanvasRef.current : atlasCanvasRef.current,
      selectedSourceImage,
      state.editor.slicerZoom,
    );
    if (!point) {
      return;
    }
    const rects = target === "tileset" ? tilesetManualRects : atlasManualRects;
    const selectedIndex = target === "tileset" ? tilesetSelectedManualRectIndex : atlasSelectedManualRectIndex;
    if (slicerCanvasTool === "move" && selectedIndex !== null) {
      const selectedRect = rects[selectedIndex];
      if (selectedRect && pointInRect(point.x, point.y, selectedRect)) {
        setMoveStart(point);
        setMoveOrigin(selectedRect);
        setMovingTarget(target);
        return;
      }
    }
    if (target === "tileset") {
      setTilesetSelectedManualRectIndex(null);
    } else {
      setAtlasSelectedManualRectIndex(null);
    }
    setDragStart(point);
    setDragRect({ x: point.x, y: point.y, width: 1, height: 1 });
  }

  function onSlicerPointerMove(event: ReactPointerEvent<HTMLDivElement>, target: "tileset" | "atlas") {
    if (!selectedSourceImage || state.editor.slicerMode !== "manual") {
      return;
    }
    const point = getImagePoint(
      event,
      target === "tileset" ? tilesetCanvasRef.current : atlasCanvasRef.current,
      selectedSourceImage,
      state.editor.slicerZoom,
    );
    if (!point) {
      return;
    }
    if (moveStart && moveOrigin && movingTarget === target) {
      const selectedIndex = target === "tileset" ? tilesetSelectedManualRectIndex : atlasSelectedManualRectIndex;
      if (selectedIndex === null) {
        return;
      }
      const nextX = clamp(moveOrigin.x + (point.x - moveStart.x), 0, selectedSourceImage.width - moveOrigin.width);
      const nextY = clamp(moveOrigin.y + (point.y - moveStart.y), 0, selectedSourceImage.height - moveOrigin.height);
      updateManualRect(target, selectedIndex, { x: nextX, y: nextY });
      if (target === "tileset") {
        setTilesetManualDraft((current) => ({ ...current, x: nextX, y: nextY }));
      } else {
        setAtlasManualDraft((current) => ({ ...current, x: nextX, y: nextY }));
      }
      return;
    }
    if (!dragStart) {
      return;
    }
    const nextRect = normalizeRect(dragStart.x, dragStart.y, point.x, point.y);
    setDragRect(nextRect);
    if (target === "tileset") {
      setTilesetManualDraft((current) => ({ ...current, x: nextRect.x, y: nextRect.y, width: nextRect.width, height: nextRect.height }));
    } else {
      setAtlasManualDraft((current) => ({ ...current, x: nextRect.x, y: nextRect.y, width: nextRect.width, height: nextRect.height }));
    }
  }

  function onSlicerPointerUp(target: "tileset" | "atlas") {
    if (moveStart && movingTarget === target) {
      setMoveStart(null);
      setMoveOrigin(null);
      setMovingTarget(null);
      return;
    }
    commitDragRect(target);
    setDragStart(null);
    setDragRect(null);
  }

  function addManualRect(target: "tileset" | "atlas") {
    const draft = target === "tileset" ? tilesetManualDraft : atlasManualDraft;
    if (draft.width <= 0 || draft.height <= 0) {
      return;
    }
    const namePrefix = target === "tileset" ? "tile" : "sprite";
    const setRects = target === "tileset" ? setTilesetManualRects : setAtlasManualRects;
    const setSelectedIndex = target === "tileset" ? setTilesetSelectedManualRectIndex : setAtlasSelectedManualRectIndex;
    setRects((current) => {
      const next = [
        ...current,
        {
          ...draft,
          name: draft.name.trim() || `${namePrefix}_${String(current.length).padStart(2, "0")}`,
        },
      ];
      setSelectedIndex(next.length - 1);
      return next;
    });
  }

  function commitDragRect(target: "tileset" | "atlas") {
    if (!dragRect || dragRect.width <= 1 || dragRect.height <= 1) {
      return;
    }
    addManualRect(target);
    if (target === "tileset") {
      setTilesetManualDraft(DEFAULT_MANUAL_RECT);
    } else {
      setAtlasManualDraft(DEFAULT_MANUAL_RECT);
    }
  }



  function removeManualRect(target: "tileset" | "atlas", index: number) {
    if (target === "tileset") {
      setTilesetManualRects((current) => current.filter((_, rectIndex) => rectIndex !== index));
      setTilesetSelectedManualRectIndex((current) => {
        if (current === null) return null;
        if (current === index) return null;
        return current > index ? current - 1 : current;
      });
      return;
    }
    setAtlasManualRects((current) => current.filter((_, rectIndex) => rectIndex !== index));
    setAtlasSelectedManualRectIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  function selectManualRect(target: "tileset" | "atlas", index: number | null) {
    if (target === "tileset") {
      setTilesetSelectedManualRectIndex(index);
      if (index === null) {
        return;
      }
      const rect = tilesetManualRects[index];
      if (rect) {
        setTilesetManualDraft(rect);
      }
      return;
    }
    setAtlasSelectedManualRectIndex(index);
    if (index === null) {
      return;
    }
    const rect = atlasManualRects[index];
    if (rect) {
      setAtlasManualDraft(rect);
    }
  }

  function handleWheelZoom(event: ReactWheelEvent<HTMLDivElement>, workspace: "level" | "slicer") {
    if (!(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    const currentZoom = workspace === "level" ? state.editor.levelZoom : state.editor.slicerZoom;
    const nextZoom = clamp(currentZoom * Math.exp(-event.deltaY * 0.0025), workspace === "level" ? 0.5 : 0.25, 8);
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    if (workspace === "level") {
      const worldX = (pointerX - levelPan.x) / currentZoom;
      const worldY = (pointerY - levelPan.y) / currentZoom;
      setLevelPan({
        x: pointerX - worldX * nextZoom,
        y: pointerY - worldY * nextZoom,
      });
      dispatch({ type: "setLevelZoom", zoom: nextZoom });
    } else {
      const worldX = (pointerX - slicerPan.x) / currentZoom;
      const worldY = (pointerY - slicerPan.y) / currentZoom;
      setSlicerPan({
        x: pointerX - worldX * nextZoom,
        y: pointerY - worldY * nextZoom,
      });
      dispatch({ type: "setSlicerZoom", zoom: nextZoom });
    }
  }

  function handlePanStart(event: ReactPointerEvent<HTMLDivElement>, workspace: "level" | "slicer", requiresHandTool: boolean) {
    if (requiresHandTool && !spaceHeld && state.editor.levelTool !== "hand") {
      return;
    }
    if (!requiresHandTool && !spaceHeld) {
      return;
    }
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startPanX: workspace === "level" ? levelPan.x : slicerPan.x,
      startPanY: workspace === "level" ? levelPan.y : slicerPan.y,
      workspace,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePanMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panRef.current) {
      return;
    }
    const nextPan = {
      x: panRef.current.startPanX + (event.clientX - panRef.current.startX),
      y: panRef.current.startPanY + (event.clientY - panRef.current.startY),
    };
    if (panRef.current.workspace === "level") {
      setLevelPan(nextPan);
    } else {
      setSlicerPan(nextPan);
    }
  }

  function handlePanEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panRef.current) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
  }

  const levelCursorClass =
    state.editor.levelTool === "hand"
      ? "cursor-hand"
      : state.editor.levelTool === "erase"
        ? "cursor-erase"
        : state.editor.levelTool === "terrain"
          ? "cursor-brush"
        : state.editor.levelTool === "collisionRect"
          ? "cursor-collision"
          : state.editor.levelTool === "markerPoint" || state.editor.levelTool === "markerRect"
            ? "cursor-marker"
            : state.editor.levelTool === "rect"
              ? "cursor-rect"
              : "cursor-brush";

  return (
    <main className="editor-shell">
      <header className="app-topbar panel">
        <div className="toolbar-title">
          <strong>Atlas Manager</strong>
          <span>Atlases for entities, tilesets for levels, one fast editor.</span>
        </div>
        <nav className="workspace-tabs">
          {(["atlas", "tileset", "level"] as const).map((workspace) => (
            <button
              key={workspace}
              className={state.editor.workspace === workspace ? "secondary active" : "ghost"}
              onClick={() => {
                dispatch({ type: "setWorkspace", workspace });
                if (workspace === "atlas") {
                  setAssetTrayOpen(false);
                }
              }}
            >
              {workspace === "atlas" ? "◎ Atlas" : workspace === "tileset" ? "▦ Tileset" : "▤ Level"}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          <label className="ghost file-button">
            Import PNG
            <input type="file" accept=".png,image/png" multiple onChange={importImages} />
          </label>
          <label className="ghost file-button">
            Load Project
            <input type="file" accept=".json,application/json" onChange={loadProject} />
          </label>
          <button className="ghost" onClick={saveProject}>Save Project</button>
          <button className="ghost" onClick={() => dispatch({ type: "replaceProject", project: createExampleProject() })}>Load Example</button>
          <button className="ghost" onClick={exportAtlas} disabled={!atlas}>Export Atlas</button>
          <button className="primary" onClick={exportLevel} disabled={!level}>Export Level</button>
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
              onSelectSource={(sourceImageId) => dispatch({ type: "setSelectedSourceImage", sourceImageId })}
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
              onSelectLayer={(layerId) => dispatch({ type: "setSelectedLayer", layerId })}
              onRenameLevel={(levelId, name) => {
                const targetLevel = state.project.levels.find((entry) => entry.id === levelId);
                if (!targetLevel) {
                  return;
                }
                dispatch({ type: "updateLevel", level: { ...targetLevel, name } });
              }}
              onRenameLayer={(layerId, name) => {
                dispatch({
                  type: "updateLevel",
                  level: {
                    ...level,
                    layers: level.layers.map((entry) => (entry.id === layerId ? { ...entry, name } : entry)),
                  },
                });
              }}
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
              onAddLayer={() => {
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
                });
              }}
              onMoveLayerUp={() => (layer ? dispatch({ type: "reorderLayer", levelId: level.id, layerId: layer.id, direction: "up" }) : undefined)}
              onMoveLayerDown={() => (layer ? dispatch({ type: "reorderLayer", levelId: level.id, layerId: layer.id, direction: "down" }) : undefined)}
              onReorderLayer={(layerId, toIndex) => dispatch({ type: "reorderLayer", levelId: level.id, layerId, toIndex })}
              onRemoveLayer={() => (layer ? dispatch({ type: "removeLayer", levelId: level.id, layerId: layer.id }) : undefined)}
            />
          </aside>
        ) : null}

        <section
          className={`panel workspace-panel ${state.editor.workspace}-workspace-panel ${
            state.editor.workspace === "level" ? "level-fullscreen" : ""
          }`}
        >
          {state.editor.workspace === "atlas" ? (
            <AtlasWorkspace
              project={state.project}
              atlas={atlas}
              module={atlasModule}
              setModule={setAtlasModule}
              source={selectedSourceImage}
              gridOptions={atlasGridOptions}
              setGridOptions={setAtlasGridOptions}
              gridPreview={atlasGridPreview}
              manualRects={atlasManualRects}
              selectedManualRectIndex={atlasSelectedManualRectIndex}
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
              onStagePanStart={(event) => handlePanStart(event, "slicer", false)}
              onStagePanMove={handlePanMove}
              onStagePanEnd={handlePanEnd}
              onCanvasPointerDown={(event) => onSlicerPointerDown(event, "atlas")}
              onCanvasPointerMove={(event) => onSlicerPointerMove(event, "atlas")}
              onCanvasPointerUp={() => onSlicerPointerUp("atlas")}
              onManualRectSelect={(index) => selectManualRect("atlas", index)}
            />
          ) : state.editor.workspace === "tileset" ? (
            <TilesetWorkspace
              source={selectedSourceImage}
              gridOptions={tilesetGridOptions}
              setGridOptions={setTilesetGridOptions}
              gridPreview={tilesetGridPreview}
              manualRects={tilesetManualRects}
              selectedManualRectIndex={tilesetSelectedManualRectIndex}
              slicerCanvasTool={slicerCanvasTool}
              manualKind={tilesetManualKind}
              manualDraft={tilesetManualDraft}
              setManualKind={setTilesetManualKind}
              dragRect={dragRect}
              slicerZoom={state.editor.slicerZoom}
              slicerPan={slicerPan}
              slicerMode={state.editor.slicerMode}
              canvasRef={tilesetCanvasRef}
              stageRef={tilesetStageRef}
              onCreateSlices={createTilesetSlices}
              onPublishTileset={publishTileset}
              onWheel={(event) => handleWheelZoom(event, "slicer")}
              onStagePanStart={(event) => handlePanStart(event, "slicer", false)}
              onStagePanMove={handlePanMove}
              onStagePanEnd={handlePanEnd}
              onCanvasPointerDown={(event) => onSlicerPointerDown(event, "tileset")}
              onCanvasPointerMove={(event) => onSlicerPointerMove(event, "tileset")}
              onCanvasPointerUp={() => onSlicerPointerUp("tileset")}
              onManualRectSelect={(index) => selectManualRect("tileset", index)}
            />
          ) : (
            <LevelWorkspace
              level={level}
              layer={layer}
              levelZoom={state.editor.levelZoom}
              levelPan={levelPan}
              levelCanvasRef={levelCanvasRef}
              stageRef={levelStageRef}
              cursorClass={levelCursorClass}
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

        <aside className="panel inspector-panel">
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
              onManualDraftChange={(patch) => setAtlasManualDraft((current) => ({ ...current, ...patch }))}
              onSlicerCanvasToolChange={setSlicerCanvasTool}
              onSlicerModeChange={(mode) => dispatch({ type: "setSlicerMode", mode })}
              onClearManual={() => {
                setAtlasManualRects([]);
                setAtlasSelectedManualRectIndex(null);
                setAtlasManualDraft(DEFAULT_MANUAL_RECT);
              }}
              onManualRectNameChange={(index, name) => updateManualRect("atlas", index, { name })}
              onManualRectRemove={(index) => removeManualRect("atlas", index)}
              onManualRectSelect={(index) => selectManualRect("atlas", index)}
              onAddManualRect={() => addManualRect("atlas")}
              selectedSliceCount={selectedSlices.length}
              onAddSelectedToAtlas={addSelectedSlicesToAtlas}
              onCreateSlices={createAtlasSlices}
              onSetModule={setAtlasModule}
            />
          ) : state.editor.workspace === "tileset" ? (
            <TilesetInspector
              source={selectedSourceImage}
              selectedSlices={selectedSlices}
              project={state.project}
              gridOptions={tilesetGridOptions}
              manualRects={tilesetManualRects}
              selectedManualRectIndex={tilesetSelectedManualRectIndex}
              manualRectCount={tilesetManualRects.length}
              slicerCanvasTool={slicerCanvasTool}
              manualKind={tilesetManualKind}
              manualDraft={tilesetManualDraft}
              slicerMode={state.editor.slicerMode}
              tilesetName={state.editor.tilesetDraft.name}
              tileWidth={state.editor.tilesetDraft.tileWidth}
              tileHeight={state.editor.tilesetDraft.tileHeight}
              columns={state.editor.tilesetDraft.columns}
              onDraftChange={(patch) => dispatch({ type: "setTilesetDraft", draft: patch })}
              onGridOptionsChange={setTilesetGridOptions}
              onManualKindChange={setTilesetManualKind}
              onManualDraftChange={(patch) => setTilesetManualDraft((current) => ({ ...current, ...patch }))}
              onSlicerCanvasToolChange={setSlicerCanvasTool}
              onSlicerModeChange={(mode) => dispatch({ type: "setSlicerMode", mode })}
              onClearManual={() => {
                setTilesetManualRects([]);
                setTilesetSelectedManualRectIndex(null);
                setTilesetManualDraft(DEFAULT_MANUAL_RECT);
              }}
              onManualRectNameChange={(index, name) => updateManualRect("tileset", index, { name })}
              onManualRectRemove={(index) => removeManualRect("tileset", index)}
              onManualRectSelect={(index) => selectManualRect("tileset", index)}
              onAddManualRect={() => addManualRect("tileset")}
              onCreateSlices={createTilesetSlices}
              onPublishTileset={publishTileset}
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
        </aside>
      </section>

      {state.editor.workspace === "tileset" && assetTrayOpen ? (
        <TilesetAssetPicker
          project={state.project}
          sourceImages={state.project.sourceImages}
          selectedSourceImageId={selectedSourceImage?.id ?? null}
          slices={state.project.slices.filter((slice) => slice.sourceImageId === selectedSourceImage?.id)}
          selectedSliceIds={state.editor.selectedSliceIds}
          search={assetSearch}
          tab={assetTab}
          onSearchChange={setAssetSearch}
          onTabChange={setAssetTab}
          onClose={() => setAssetTrayOpen(false)}
          onSelectSource={(sourceImageId) => {
            dispatch({ type: "setSelectedSourceImage", sourceImageId });
            setAssetTab("tilesets");
          }}
          onToggleSlice={(sliceId) => dispatch({ type: "toggleSliceSelection", sliceId })}
        />
      ) : null}

      {state.editor.workspace === "level" && assetTrayOpen ? (
        <LevelAssetPicker
          project={state.project}
          selectedTilesetId={selectedTileset?.id ?? null}
          selectedPaintTileId={selectedPaintTileId}
          selectedTerrainSetId={selectedTerrainSet?.id ?? null}
          terrainSets={tilesetTerrainSets}
          search={assetSearch}
          tab={levelAssetTab}
          onSearchChange={setAssetSearch}
          onTabChange={setLevelAssetTab}
          onClose={() => setAssetTrayOpen(false)}
          onSelectTileset={(tilesetId) => {
            dispatch({ type: "setSelectedTileset", tilesetId });
            setLevelAssetTab("tiles");
          }}
          onSelectTile={(tileId) => {
            dispatch({ type: "setSelectedTileset", tilesetId: selectedTileset?.id ?? null });
            setSelectedPaintTileId(tileId);
            pushRecentTile(tileId);
            dispatch({ type: "setLevelTool", tool: "brush" });
            setAssetTrayOpen(false);
          }}
          onSetPaintTile={(tileId) => {
            dispatch({ type: "setSelectedTileset", tilesetId: selectedTileset?.id ?? null });
            setSelectedPaintTileId(tileId);
          }}
          onSelectTerrainSet={(terrainSetId) => {
            dispatch({ type: "setSelectedTerrainSet", terrainSetId });
            pushRecentTerrainSet(terrainSetId);
            dispatch({ type: "setLevelTool", tool: "terrain" });
            setAssetTrayOpen(false);
          }}
          onRemoveTerrainSet={(terrainSetId: number) => {
            dispatch({ type: "removeTerrainSet", terrainSetId });
          }}
          onSetTerrainSet={(terrainSetId: number) => {
            dispatch({ type: "setSelectedTerrainSet", terrainSetId });
          }}
          onCreateTerrainSet={() => {
            if (!selectedTileset) {
              return;
            }
            dispatch({
              type: "upsertTerrainSet",
              terrainSet: {
                id: state.project.idCounters.terrainSet,
                name: `${selectedTileset.name}_terrain`,
                tilesetId: selectedTileset.id,
                slots: { 0: selectedPaintTileId || selectedTileset.tileIds[0] || 0 },
                blobMap: {},
              },
            });
          }}
          onAssignTerrainSlot={(slot) => {
            if (!selectedTerrainSet) {
              return;
            }
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
          onUpdateTerrainSet={(terrainSet) => {
            dispatch({ type: "upsertTerrainSet", terrainSet });
          }}
        />
      ) : null}

      <section className="panel bottom-dock">
        {state.editor.workspace !== "atlas" ? (
          <button className={assetTrayOpen ? "secondary active" : "ghost"} onClick={() => setAssetTrayOpen((current) => !current)}>
            ◫ Assets
          </button>
        ) : (
          <div className="dock-label">Atlas assets stay visible for ordering.</div>
        )}
        {state.editor.workspace === "level" ? (
          <>
            <ToolButton icon="V" label="Select" active={state.editor.levelTool === "select"} onClick={() => dispatch({ type: "setLevelTool", tool: "select" })} />
            <ToolButton icon="B" label="Brush" active={state.editor.levelTool === "brush"} onClick={() => dispatch({ type: "setLevelTool", tool: "brush" })} />
            <ToolButton icon="T" label="Terrain" active={state.editor.levelTool === "terrain"} onClick={() => dispatch({ type: "setLevelTool", tool: "terrain" })} />
            <ToolButton icon="E" label="Erase" active={state.editor.levelTool === "erase"} onClick={() => dispatch({ type: "setLevelTool", tool: "erase" })} />
            <ToolButton icon="R" label="Rect" active={state.editor.levelTool === "rect"} onClick={() => dispatch({ type: "setLevelTool", tool: "rect" })} />
            <ToolButton icon="G" label="Fill" active={state.editor.levelTool === "bucket"} onClick={() => dispatch({ type: "setLevelTool", tool: "bucket" })} />
            <ToolButton icon="C" label="Collision" active={state.editor.levelTool === "collisionRect"} onClick={() => dispatch({ type: "setLevelTool", tool: "collisionRect" })} />
            <ToolButton icon="M" label="Marker" active={state.editor.levelTool === "markerPoint" || state.editor.levelTool === "markerRect"} onClick={() => dispatch({ type: "setLevelTool", tool: "markerPoint" })} />
            <ToolButton icon="H" label="Hand" active={state.editor.levelTool === "hand"} onClick={() => dispatch({ type: "setLevelTool", tool: "hand" })} />
            <ZoomControls zoom={state.editor.levelZoom} onChange={(value) => dispatch({ type: "setLevelZoom", zoom: value })} />
          </>
        ) : state.editor.workspace === "tileset" || (state.editor.workspace === "atlas" && atlasModule === "slicer") ? (
          <>
            <ToolButton icon="▦" label="Grid" active={state.editor.slicerMode === "grid"} onClick={() => dispatch({ type: "setSlicerMode", mode: "grid" })} />
            <ToolButton icon="✎" label="Manual" active={state.editor.slicerMode === "manual"} onClick={() => dispatch({ type: "setSlicerMode", mode: "manual" })} />
            <ZoomControls zoom={state.editor.slicerZoom} onChange={(value) => dispatch({ type: "setSlicerZoom", zoom: value })} />
          </>
        ) : null}
      </section>

    </main>
  );
}

function AtlasWorkspace(props: {
  project: ProjectDocument;
  atlas: PackedAtlas | null;
  module: "pack" | "slicer";
  setModule: React.Dispatch<React.SetStateAction<"pack" | "slicer">>;
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
  canvasRef: React.RefObject<HTMLDivElement>;
  stageRef: React.RefObject<HTMLDivElement>;
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
                  <span>{page.width} x {page.height}</span>
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
          gridOptions={props.gridOptions}
          setGridOptions={props.setGridOptions}
          gridPreview={props.gridPreview}
          manualRects={props.manualRects}
          selectedManualRectIndex={props.selectedManualRectIndex}
          slicerCanvasTool={props.slicerCanvasTool}
          manualKind={props.manualKind}
          manualDraft={props.manualDraft}
          setManualKind={props.setManualKind}
          dragRect={props.dragRect}
          slicerZoom={props.slicerZoom}
          slicerPan={props.slicerPan}
          canvasRef={props.canvasRef}
          stageRef={props.stageRef}
          onCreateSlices={props.onCreateSlices}
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

function TilesetWorkspace(props: {
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
  slicerMode: "grid" | "manual";
  canvasRef: React.RefObject<HTMLDivElement>;
  stageRef: React.RefObject<HTMLDivElement>;
  onCreateSlices: () => void;
  onPublishTileset: () => void;
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
      <SlicerSurface
        source={props.source}
        gridOptions={props.gridOptions}
        setGridOptions={props.setGridOptions}
        gridPreview={props.gridPreview}
        manualRects={props.manualRects}
        selectedManualRectIndex={props.selectedManualRectIndex}
        slicerCanvasTool={props.slicerCanvasTool}
        manualKind={props.manualKind}
        manualDraft={props.manualDraft}
        setManualKind={props.setManualKind}
        dragRect={props.dragRect}
        slicerZoom={props.slicerZoom}
        slicerPan={props.slicerPan}
        canvasRef={props.canvasRef}
        stageRef={props.stageRef}
        onCreateSlices={props.onCreateSlices}
        publishLabel="Publish as Level Tileset"
        onPublish={props.onPublishTileset}
        onWheel={props.onWheel}
        onStagePanStart={props.onStagePanStart}
        onStagePanMove={props.onStagePanMove}
        onStagePanEnd={props.onStagePanEnd}
        onCanvasPointerDown={props.onCanvasPointerDown}
        onCanvasPointerMove={props.onCanvasPointerMove}
        onCanvasPointerUp={props.onCanvasPointerUp}
        onManualRectSelect={props.onManualRectSelect}
      />
    </div>
  );
}

function SlicerSurface(props: {
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
  canvasRef: React.RefObject<HTMLDivElement>;
  stageRef: React.RefObject<HTMLDivElement>;
  onCreateSlices: () => void;
  publishLabel?: string;
  onPublish?: () => void;
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
                <div key={`${preview.name}-${preview.rect.x}-${preview.rect.y}`} className="slice-outline" style={rectStyle(preview.rect, props.slicerZoom)}>
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

function LevelWorkspace(props: {
  level: LevelDocument | null;
  layer: LevelLayer | null;
  levelZoom: number;
  levelPan: { x: number; y: number };
  cursorClass: string;
  levelCanvasRef: React.RefObject<HTMLCanvasElement>;
  stageRef: React.RefObject<HTMLDivElement>;
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

function AtlasInspector({
  atlas,
  settings,
  module,
  source,
  gridOptions,
  manualRects,
  selectedManualRectIndex,
  manualRectCount,
  slicerCanvasTool,
  manualKind,
  manualDraft,
  slicerMode,
  dispatch,
  onGridOptionsChange,
  onManualKindChange,
  onManualDraftChange,
  onSlicerCanvasToolChange,
  onSlicerModeChange,
  onClearManual,
  onManualRectNameChange,
  onManualRectRemove,
  onManualRectSelect,
  onAddManualRect,
  selectedSliceCount,
  onAddSelectedToAtlas,
  onCreateSlices,
  onSetModule,
}: {
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
  dispatch: ReturnType<typeof useProjectStore>["dispatch"];
  onGridOptionsChange: React.Dispatch<React.SetStateAction<GridSliceOptions>>;
  onManualKindChange: React.Dispatch<React.SetStateAction<SliceKind>>;
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
  onCreateSlices: () => void;
  onSetModule: React.Dispatch<React.SetStateAction<"pack" | "slicer">>;
}) {
  return (
    <div className="inspector-list">
      <div className="mode-tools">
        <button className={module === "pack" ? "secondary active" : "ghost"} onClick={() => onSetModule("pack")}>Pack</button>
        <button className={module === "slicer" ? "secondary active" : "ghost"} onClick={() => onSetModule("slicer")}>Slice</button>
      </div>
      <label>
        Max Page Size
        <select value={settings.maxPageSize} onChange={(event) => dispatch({ type: "updateAtlasSettings", patch: { maxPageSize: Number(event.target.value) as BuildOptions["maxPageSize"] } })}>
          {[64, 128, 256, 512, 1024].map((size) => (
            <option key={size} value={size}>{size} x {size}</option>
          ))}
        </select>
      </label>
      <label className="checkbox-row">
        <span>Allow rotation</span>
        <input type="checkbox" checked={settings.allowRotation} onChange={(event) => dispatch({ type: "updateAtlasSettings", patch: { allowRotation: event.target.checked } })} />
      </label>
      <label>
        Padding
        <input type="number" min="0" value={settings.padding} onChange={(event) => dispatch({ type: "updateAtlasSettings", patch: { padding: Math.max(0, Number(event.target.value) || 0) } })} />
      </label>
      <label>
        Extrusion
        <input type="number" min="0" value={settings.extrusion} onChange={(event) => dispatch({ type: "updateAtlasSettings", patch: { extrusion: Math.max(0, Number(event.target.value) || 0) } })} />
      </label>
      <label className="checkbox-row">
        <span>Include hash table</span>
        <input type="checkbox" checked={settings.includeHashTable} onChange={(event) => dispatch({ type: "updateAtlasSettings", patch: { includeHashTable: event.target.checked } })} />
      </label>
      <label className="checkbox-row">
        <span>Include debug JSON</span>
        <input type="checkbox" checked={settings.includeDebugJson} onChange={(event) => dispatch({ type: "updateAtlasSettings", patch: { includeDebugJson: event.target.checked } })} />
      </label>
      <div className="list-row static">
        <strong>Pages</strong>
        <span>{atlas?.pages.length ?? 0}</span>
      </div>
      <div className="list-row static">
        <strong>Atlas Bin</strong>
        <span>{atlas ? formatBytes(atlas.atlasBin.byteLength) : "0 B"}</span>
      </div>
      <div className="list-row static">
        <strong>Meta Bin</strong>
        <span>{atlas ? formatBytes(atlas.atlasMetaBin.byteLength) : "0 B"}</span>
      </div>
      {module === "slicer" ? (
        <>
          <div className="list-row static">
            <strong>Source</strong>
            <span>{source?.fileName ?? "No source selected"}</span>
          </div>
          <div className="mode-tools">
            <button className={slicerMode === "grid" ? "secondary active" : "ghost"} onClick={() => onSlicerModeChange("grid")}>Grid</button>
            <button className={slicerMode === "manual" ? "secondary active" : "ghost"} onClick={() => onSlicerModeChange("manual")}>Manual</button>
          </div>
          {slicerMode === "grid" ? (
            <>
              <div className="inspector-row inspector-row-2">
                <label>
                  Frame Width
                  <input type="number" min="1" value={gridOptions.frameWidth} onChange={(event) => onGridOptionsChange((current) => ({ ...current, frameWidth: Math.max(1, Number(event.target.value) || 1) }))} />
                </label>
                <label>
                  Frame Height
                  <input type="number" min="1" value={gridOptions.frameHeight} onChange={(event) => onGridOptionsChange((current) => ({ ...current, frameHeight: Math.max(1, Number(event.target.value) || 1) }))} />
                </label>
              </div>
              <label>
                Name Prefix
                <input value={gridOptions.namePrefix} onChange={(event) => onGridOptionsChange((current) => ({ ...current, namePrefix: event.target.value }))} />
              </label>
              <div className="inspector-row inspector-row-2">
                <label>
                  Spacing X
                  <input type="number" value={gridOptions.spacingX} onChange={(event) => onGridOptionsChange((current) => ({ ...current, spacingX: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
                <label>
                  Spacing Y
                  <input type="number" value={gridOptions.spacingY} onChange={(event) => onGridOptionsChange((current) => ({ ...current, spacingY: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
              </div>
              <div className="inspector-row inspector-row-2">
                <label>
                  Margin X
                  <input type="number" value={gridOptions.marginX} onChange={(event) => onGridOptionsChange((current) => ({ ...current, marginX: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
                <label>
                  Margin Y
                  <input type="number" value={gridOptions.marginY} onChange={(event) => onGridOptionsChange((current) => ({ ...current, marginY: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
              </div>
              <div className="inspector-row inspector-row-2">
                <label>
                  End Offset X
                  <input type="number" value={gridOptions.endOffsetX} onChange={(event) => onGridOptionsChange((current) => ({ ...current, endOffsetX: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
                <label>
                  End Offset Y
                  <input type="number" value={gridOptions.endOffsetY} onChange={(event) => onGridOptionsChange((current) => ({ ...current, endOffsetY: Math.max(0, Number(event.target.value) || 0) }))} />
                </label>
              </div>
              <label className="checkbox-row">
                <span>Keep Empty</span>
                <input type="checkbox" checked={gridOptions.keepEmpty} onChange={(event) => onGridOptionsChange((current) => ({ ...current, keepEmpty: event.target.checked }))} />
              </label>
              <label>
                Slice Kind
                <select value={gridOptions.sliceKind} onChange={(event) => onGridOptionsChange((current) => ({ ...current, sliceKind: event.target.value as SliceKind }))}>
                  <option value="tile">Tile</option>
                  <option value="sprite">Sprite</option>
                  <option value="both">Both</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <div className="mode-tools">
                <button className={slicerCanvasTool === "draw" ? "secondary active" : "ghost"} onClick={() => onSlicerCanvasToolChange("draw")}>Draw</button>
                <button className={slicerCanvasTool === "move" ? "secondary active" : "ghost"} onClick={() => onSlicerCanvasToolChange("move")}>Move</button>
              </div>
              <label>
                Manual Kind
                <select value={manualKind} onChange={(event) => onManualKindChange(event.target.value as SliceKind)}>
                  <option value="tile">Tile</option>
                  <option value="sprite">Sprite</option>
                  <option value="both">Both</option>
                </select>
              </label>
              <label>
                Name
                <input value={manualDraft.name} onChange={(event) => onManualDraftChange({ name: event.target.value })} />
              </label>
              <div className="inspector-row inspector-row-2">
                <label>
                  X
                  <input type="number" value={manualDraft.x} onChange={(event) => onManualDraftChange({ x: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
                <label>
                  Y
                  <input type="number" value={manualDraft.y} onChange={(event) => onManualDraftChange({ y: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
              </div>
              <div className="inspector-row inspector-row-2">
                <label>
                  Width
                  <input type="number" min="1" value={manualDraft.width} onChange={(event) => onManualDraftChange({ width: Math.max(1, Number(event.target.value) || 1) })} />
                </label>
                <label>
                  Height
                  <input type="number" min="1" value={manualDraft.height} onChange={(event) => onManualDraftChange({ height: Math.max(1, Number(event.target.value) || 1) })} />
                </label>
              </div>
              <div className="list-row static">
                <strong>Manual Regions</strong>
                <span>{manualRectCount}</span>
              </div>
              <div className="manual-rect-list">
                {manualRects.length ? (
                  manualRects.map((rect, index) => (
                    <div
                      key={`${rect.name}-${rect.x}-${rect.y}-${index}`}
                      className={`manual-rect-row ${selectedManualRectIndex === index ? "active" : ""}`}
                      onClick={() => onManualRectSelect(index)}
                    >
                      <input
                        value={rect.name}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => onManualRectNameChange(index, event.target.value)}
                        placeholder={`slice_${index}`}
                      />
                      <span>
                        {rect.x},{rect.y} {rect.width}x{rect.height}
                      </span>
                      <button className="ghost" onClick={(event) => {
                        event.stopPropagation();
                        onManualRectRemove(index);
                      }}>Remove</button>
                    </div>
                  ))
                ) : (
                  <div className="empty-note">Drag on the atlas viewport to add manual slices.</div>
                )}
              </div>
              <button className="secondary" onClick={onAddManualRect}>Add Manual Region</button>
              <button className="ghost" onClick={onClearManual} disabled={manualRectCount === 0}>Clear Manual Regions</button>
            </>
          )}
          <button className="primary" onClick={onCreateSlices} disabled={!source}>Create Slices</button>
          <button className="secondary" onClick={onAddSelectedToAtlas} disabled={selectedSliceCount === 0}>Add Selected To Atlas</button>
        </>
      ) : null}
    </div>
  );
}

function TilesetInspector(props: {
  source: SourceImageAsset | null;
  selectedSlices: SliceAsset[];
  project: ProjectDocument;
  gridOptions: GridSliceOptions;
  manualRects: ManualSliceRect[];
  selectedManualRectIndex: number | null;
  manualRectCount: number;
  slicerCanvasTool: SlicerCanvasTool;
  manualKind: SliceKind;
  manualDraft: ManualSliceRect;
  slicerMode: "grid" | "manual";
  tilesetName: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  onDraftChange: (patch: Partial<{ name: string; tileWidth: number; tileHeight: number; columns: number }>) => void;
  onGridOptionsChange: React.Dispatch<React.SetStateAction<GridSliceOptions>>;
  onManualKindChange: React.Dispatch<React.SetStateAction<SliceKind>>;
  onManualDraftChange: (patch: Partial<ManualSliceRect>) => void;
  onSlicerCanvasToolChange: (tool: SlicerCanvasTool) => void;
  onSlicerModeChange: (mode: "grid" | "manual") => void;
  onClearManual: () => void;
  onManualRectNameChange: (index: number, name: string) => void;
  onManualRectRemove: (index: number) => void;
  onManualRectSelect: (index: number | null) => void;
  onAddManualRect: () => void;
  onCreateSlices: () => void;
  onPublishTileset: () => void;
}) {
  return (
    <div className="inspector-list">
      <div className="list-row static">
        <strong>Source</strong>
        <span>{props.source?.fileName ?? "No source selected"}</span>
      </div>
      <div className="mode-tools">
        <button className={props.slicerMode === "grid" ? "secondary active" : "ghost"} onClick={() => props.onSlicerModeChange("grid")}>Grid</button>
        <button className={props.slicerMode === "manual" ? "secondary active" : "ghost"} onClick={() => props.onSlicerModeChange("manual")}>Manual</button>
      </div>
      {props.slicerMode === "grid" ? (
        <>
          <div className="inspector-row inspector-row-2">
            <label>
              Frame Width
              <input type="number" min="1" value={props.gridOptions.frameWidth} onChange={(event) => props.onGridOptionsChange((current) => ({ ...current, frameWidth: Math.max(1, Number(event.target.value) || 1) }))} />
            </label>
            <label>
              Frame Height
              <input type="number" min="1" value={props.gridOptions.frameHeight} onChange={(event) => props.onGridOptionsChange((current) => ({ ...current, frameHeight: Math.max(1, Number(event.target.value) || 1) }))} />
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
            <button className={props.slicerCanvasTool === "draw" ? "secondary active" : "ghost"} onClick={() => props.onSlicerCanvasToolChange("draw")}>Draw</button>
            <button className={props.slicerCanvasTool === "move" ? "secondary active" : "ghost"} onClick={() => props.onSlicerCanvasToolChange("move")}>Move</button>
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
                    placeholder={`tile_${index}`}
                  />
                  <span>
                    {rect.x},{rect.y} {rect.width}x{rect.height}
                  </span>
                  <button className="ghost" onClick={(event) => {
                    event.stopPropagation();
                    props.onManualRectRemove(index);
                  }}>Remove</button>
                </div>
              ))
            ) : (
              <div className="empty-note">Drag on the tileset viewport to add manual slices.</div>
            )}
          </div>
          <button className="secondary" onClick={props.onAddManualRect}>Add Manual Region</button>
          <button className="ghost" onClick={props.onClearManual} disabled={props.manualRectCount === 0}>Clear Manual Regions</button>
        </>
      )}
      <button className="primary" onClick={props.onCreateSlices} disabled={!props.source}>Create Slices</button>
      <label>
        Tileset Name
        <input value={props.tilesetName} onChange={(event) => props.onDraftChange({ name: event.target.value })} />
      </label>
      <label>
        Tile Width
        <input type="number" min="1" value={props.tileWidth} onChange={(event) => props.onDraftChange({ tileWidth: Math.max(1, Number(event.target.value) || 1) })} />
      </label>
      <label>
        Tile Height
        <input type="number" min="1" value={props.tileHeight} onChange={(event) => props.onDraftChange({ tileHeight: Math.max(1, Number(event.target.value) || 1) })} />
      </label>
      <label>
        Palette Columns
        <input type="number" min="1" value={props.columns} onChange={(event) => props.onDraftChange({ columns: Math.max(1, Number(event.target.value) || 1) })} />
      </label>
      <div className="list-row static">
        <strong>Source</strong>
        <span>{props.source?.fileName ?? "No source selected"}</span>
      </div>
      <div className="list-row static">
        <strong>Selected Slices</strong>
        <span>{props.selectedSlices.length}</span>
      </div>
      <div className="list-row static">
        <strong>Published Tilesets</strong>
        <span>{props.project.tilesets.length}</span>
      </div>
      <button className="ghost" onClick={props.onPublishTileset}>Publish as Level Tileset</button>
    </div>
  );
}

function LevelInspector({
  level,
  layer,
  levelTool,
  dispatch,
  project,
  recentTileIds,
  recentTerrainSetIds,
  onSelectRecentTile,
  onSelectRecentTerrainSet,
}: {
  level: LevelDocument;
  layer: LevelLayer;
  levelTool: LevelTool;
  dispatch: ReturnType<typeof useProjectStore>["dispatch"];
  project: ProjectDocument;
  recentTileIds: number[];
  recentTerrainSetIds: number[];
  onSelectRecentTile: (tileId: number) => void;
  onSelectRecentTerrainSet: (terrainSetId: number) => void;
}) {
  function update(patch: Partial<LevelLayer>) {
    dispatch({
      type: "updateLevel",
      level: {
        ...level,
        layers: level.layers.map((entry) => (entry.id === layer.id ? { ...entry, ...patch } : entry)),
      },
    });
  }
  return (
    <div className="inspector-list">
      <label>
        Name
        <input value={layer.name} onChange={(event) => update({ name: event.target.value })} />
      </label>
      <label className="checkbox-row"><span>Visible</span><input type="checkbox" checked={layer.visible} onChange={(event) => update({ visible: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Locked</span><input type="checkbox" checked={layer.locked} onChange={(event) => update({ locked: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Has Tiles</span><input type="checkbox" checked={layer.hasTiles} onChange={(event) => update({ hasTiles: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Has Collision</span><input type="checkbox" checked={layer.hasCollision} onChange={(event) => update({ hasCollision: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Has Markers</span><input type="checkbox" checked={layer.hasMarkers} onChange={(event) => update({ hasMarkers: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Repeat X</span><input type="checkbox" checked={layer.repeatX} onChange={(event) => update({ repeatX: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Repeat Y</span><input type="checkbox" checked={layer.repeatY} onChange={(event) => update({ repeatY: event.target.checked })} /></label>
      <label className="checkbox-row"><span>Foreground</span><input type="checkbox" checked={layer.foreground} onChange={(event) => update({ foreground: event.target.checked })} /></label>
      <div className="inspector-row inspector-row-2">
        <label>
          Parallax X
          <input type="number" step="0.1" value={layer.parallaxX} onChange={(event) => update({ parallaxX: Number(event.target.value) || 0 })} />
        </label>
        <label>
          Parallax Y
          <input type="number" step="0.1" value={layer.parallaxY} onChange={(event) => update({ parallaxY: Number(event.target.value) || 0 })} />
        </label>
      </div>
      <div className="inspector-row inspector-row-2">
        <label>
          Offset X
          <input type="number" value={layer.offsetX} onChange={(event) => update({ offsetX: Number(event.target.value) || 0 })} />
        </label>
        <label>
          Offset Y
          <input type="number" value={layer.offsetY} onChange={(event) => update({ offsetY: Number(event.target.value) || 0 })} />
        </label>
      </div>
      {layer.hasMarkers ? (
        <>
          <div className="list-row static">
            <strong>Markers</strong>
            <span>{level.markers.filter((entry) => entry.layerId === layer.id).length} markers</span>
          </div>
          <div className="list-row static">
            <strong>Active Tool</strong>
            <span>{levelTool === "markerRect" ? "Rect Marker" : levelTool === "markerPoint" ? "Point Marker" : "Select Marker Tool"}</span>
          </div>
        </>
      ) : null}
      {layer.hasCollision ? (
        <>
          <div className="list-row static">
            <strong>Collision</strong>
            <span>{level.collisions.filter((entry) => entry.layerId === layer.id).length} areas</span>
          </div>
          <div className="list-row static">
            <strong>Active Tool</strong>
            <span>{levelTool === "collisionRect" ? "Collision Rect" : "Select Collision Tool"}</span>
          </div>
        </>
      ) : null}
      <RecentLevelAssetsSection
        project={project}
        recentTileIds={recentTileIds}
        recentTerrainSetIds={recentTerrainSetIds}
        onSelectRecentTile={onSelectRecentTile}
        onSelectRecentTerrainSet={onSelectRecentTerrainSet}
      />
    </div>
  );
}

function LevelSettingsInspector({
  level,
  dispatch,
  project,
  recentTileIds,
  recentTerrainSetIds,
  onSelectRecentTile,
  onSelectRecentTerrainSet,
}: {
  level: LevelDocument;
  dispatch: ReturnType<typeof useProjectStore>["dispatch"];
  project: ProjectDocument;
  recentTileIds: number[];
  recentTerrainSetIds: number[];
  onSelectRecentTile: (tileId: number) => void;
  onSelectRecentTerrainSet: (terrainSetId: number) => void;
}) {
  function update(patch: Partial<LevelDocument>) {
    dispatch({
      type: "updateLevel",
      level: {
        ...level,
        ...patch,
        layers: level.layers.map((layer) => ({
          ...layer,
          widthTiles: patch.mapWidthTiles ?? level.mapWidthTiles,
          heightTiles: patch.mapHeightTiles ?? level.mapHeightTiles,
        })),
      },
    });
  }

  return (
    <div className="inspector-list">
      <label>
        Level Name
        <input value={level.name} onChange={(event) => update({ name: event.target.value })} />
      </label>
      <div className="inspector-row inspector-row-2">
        <label>
          Map Width
          <input type="number" min="1" value={level.mapWidthTiles} onChange={(event) => update({ mapWidthTiles: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
        <label>
          Map Height
          <input type="number" min="1" value={level.mapHeightTiles} onChange={(event) => update({ mapHeightTiles: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
      </div>
      <div className="inspector-row inspector-row-2">
        <label>
          Tile Width
          <input type="number" min="1" value={level.tileWidth} onChange={(event) => update({ tileWidth: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
        <label>
          Tile Height
          <input type="number" min="1" value={level.tileHeight} onChange={(event) => update({ tileHeight: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
      </div>
      <div className="inspector-row inspector-row-2">
        <label>
          Chunk Width
          <input type="number" min="1" value={level.chunkWidthTiles} onChange={(event) => update({ chunkWidthTiles: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
        <label>
          Chunk Height
          <input type="number" min="1" value={level.chunkHeightTiles} onChange={(event) => update({ chunkHeightTiles: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
      </div>
      <div className="list-row static">
        <strong>Tilesets</strong>
        <span>{level.tilesetIds.length}</span>
      </div>
      <div className="list-row static">
        <strong>Layers</strong>
        <span>{level.layers.length}</span>
      </div>
      <RecentLevelAssetsSection
        project={project}
        recentTileIds={recentTileIds}
        recentTerrainSetIds={recentTerrainSetIds}
        onSelectRecentTile={onSelectRecentTile}
        onSelectRecentTerrainSet={onSelectRecentTerrainSet}
      />
    </div>
  );
}

function RecentLevelAssetsSection({
  project,
  recentTileIds,
  recentTerrainSetIds,
  onSelectRecentTile,
  onSelectRecentTerrainSet,
}: {
  project: ProjectDocument;
  recentTileIds: number[];
  recentTerrainSetIds: number[];
  onSelectRecentTile: (tileId: number) => void;
  onSelectRecentTerrainSet: (terrainSetId: number) => void;
}) {
  const recentTiles = recentTileIds
    .map((tileId) => project.tiles.find((tile) => tile.tileId === tileId) ?? null)
    .filter((tile): tile is TilesetTileAsset => Boolean(tile));
  const recentTerrainSets = recentTerrainSetIds
    .map((terrainSetId) => project.terrainSets.find((terrainSet) => terrainSet.id === terrainSetId) ?? null)
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
              <button key={tile.tileId} className="recent-chip" onClick={() => onSelectRecentTile(tile.tileId)}>
                <TileAssetPreview project={project} tile={tile} />
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
              const centerTile = project.tiles.find((tile) => tile.tileId === (terrainSet.slots[0] || 0)) ?? null;
              return (
                <button key={terrainSet.id} className="recent-chip" onClick={() => onSelectRecentTerrainSet(terrainSet.id)}>
                  <TileAssetPreview project={project} tile={centerTile} />
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

function AtlasAssetsPanel(props: {
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
            <span>{source.width} x {source.height}</span>
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

function LevelNavigator(props: {
  levels: ProjectDocument["levels"];
  selectedLevelId: string | null;
  selectedLayerId: string | null;
  onSelectLevel: (levelId: string) => void;
  onSelectLayer: (layerId: string) => void;
  onRenameLevel: (levelId: string, name: string) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onAddLevel: () => void;
  onRemoveLevel: () => void;
  onAddLayer: () => void;
  onMoveLayerUp: () => void;
  onMoveLayerDown: () => void;
  onReorderLayer: (layerId: string, toIndex: number) => void;
  onRemoveLayer: () => void;
}) {
  const selectedLevel = props.levels.find((level) => level.id === props.selectedLevelId) ?? props.levels[0] ?? null;
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [editingLevelName, setEditingLevelName] = useState("");
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState("");
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  return (
    <div className="navigator-sections">
      <section className="navigator-section">
        <div className="navigator-header">
          <h2>Pages</h2>
          <div className="navigator-actions">
            <button className="ghost navigator-action" onClick={props.onAddLevel} title="Add page">+</button>
            <button className="ghost navigator-action" onClick={props.onRemoveLevel} title="Remove page">−</button>
          </div>
        </div>
        <div className="navigator-list">
          {props.levels.map((level) => (
            <div key={level.id} className={level.id === selectedLevel?.id ? "navigator-row active" : "navigator-row"}>
              {editingLevelId === level.id ? (
                <input
                  className="navigator-inline-input"
                  value={editingLevelName}
                  autoFocus
                  onChange={(event) => setEditingLevelName(event.target.value)}
                  onBlur={() => {
                    props.onRenameLevel(level.id, editingLevelName.trim() || level.name);
                    setEditingLevelId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      props.onRenameLevel(level.id, editingLevelName.trim() || level.name);
                      setEditingLevelId(null);
                    }
                    if (event.key === "Escape") {
                      setEditingLevelId(null);
                    }
                  }}
                />
              ) : (
                <button
                  className="navigator-row-button"
                  onClick={() => props.onSelectLevel(level.id)}
                  onDoubleClick={() => {
                    setEditingLevelId(level.id);
                    setEditingLevelName(level.name);
                  }}
                >
                  <span className="navigator-copy">
                    <strong>{level.name}</strong>
                    <small>{level.mapWidthTiles} x {level.mapHeightTiles}</small>
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="navigator-section">
        <div className="navigator-header">
          <h2>Layers</h2>
          <div className="navigator-actions">
            <button className="ghost navigator-action" onClick={props.onAddLayer} title="Add layer">+</button>
            <button className="ghost navigator-action" onClick={props.onMoveLayerUp} title="Move layer up">↑</button>
            <button className="ghost navigator-action" onClick={props.onMoveLayerDown} title="Move layer down">↓</button>
            <button className="ghost navigator-action" onClick={props.onRemoveLayer} title="Remove layer">−</button>
          </div>
        </div>
        <div className="navigator-list">
          {selectedLevel?.layers.map((layer) => (
            <div
              key={layer.id}
              className={
                draggedLayerId === layer.id
                  ? "navigator-row active navigator-row-dragging"
                  : layer.id === props.selectedLayerId
                    ? "navigator-row active"
                    : "navigator-row"
              }
              draggable={editingLayerId !== layer.id}
              onDragStart={() => setDraggedLayerId(layer.id)}
              onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
              onDrop={() => {
                if (!selectedLevel || !draggedLayerId || draggedLayerId === layer.id) {
                  setDraggedLayerId(null);
                  return;
                }
                const toIndex = selectedLevel.layers.findIndex((entry) => entry.id === layer.id);
                props.onReorderLayer(draggedLayerId, toIndex);
                setDraggedLayerId(null);
              }}
              onDragEnd={() => setDraggedLayerId(null)}
            >
              {editingLayerId === layer.id ? (
                <input
                  className="navigator-inline-input"
                  value={editingLayerName}
                  autoFocus
                  onChange={(event) => setEditingLayerName(event.target.value)}
                  onBlur={() => {
                    props.onRenameLayer(layer.id, editingLayerName.trim() || layer.name);
                    setEditingLayerId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      props.onRenameLayer(layer.id, editingLayerName.trim() || layer.name);
                      setEditingLayerId(null);
                    }
                    if (event.key === "Escape") {
                      setEditingLayerId(null);
                    }
                  }}
                />
              ) : (
                <button
                  className="navigator-row-button navigator-row-sortable"
                  onClick={() => props.onSelectLayer(layer.id)}
                  onDoubleClick={() => {
                    setEditingLayerId(layer.id);
                    setEditingLayerName(layer.name);
                  }}
                >
                  <span className="navigator-copy">
                    <strong>{layer.name}</strong>
                    <small>{layerCapabilityLabel(layer)}</small>
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TilesetAssetTray(props: {
  project: ProjectDocument;
  sourceImages: SourceImageAsset[];
  selectedSourceImageId: string | null;
  slices: SliceAsset[];
  selectedSliceIds: string[];
  onSelectSource: (sourceImageId: string) => void;
  onToggleSlice: (sliceId: string) => void;
}) {
  return (
    <div className="tray-layout">
      <div className="tray-column">
        <h3>Tilesheets</h3>
        <div className="asset-list">
          {props.sourceImages.map((source) => (
            <button key={source.id} className={source.id === props.selectedSourceImageId ? "asset-card active" : "asset-card"} onClick={() => props.onSelectSource(source.id)}>
              <strong>{source.fileName}</strong>
              <span>{source.width} x {source.height}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="tray-column">
        <h3>Imported Slices</h3>
        <div className="dense-picker-container" style={{ flex: 1 }}>
          <div className="dense-picker-grid">
            {props.slices.map((slice) => {
              const match = slice.name.match(/_(\d+)_(\d+)(?:\.\w+)?$/);
              const gridRow = match ? parseInt(match[1], 10) + 1 : undefined;
              const gridColumn = match ? parseInt(match[2], 10) + 1 : undefined;
              return (
                <button 
                  key={slice.id} 
                  className={props.selectedSliceIds.includes(slice.id) ? "dense-tile-btn active" : "dense-tile-btn"} 
                  onClick={() => props.onToggleSlice(slice.id)}
                  title={`${slice.name} (${slice.kind})`}
                  style={gridRow && gridColumn ? { gridRow, gridColumn } : undefined}
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
  );
}

function TilesetAssetPicker(props: {
  project: ProjectDocument;
  sourceImages: SourceImageAsset[];
  selectedSourceImageId: string | null;
  slices: SliceAsset[];
  selectedSliceIds: string[];
  search: string;
  tab: "tilesets" | "tiles";
  onSearchChange: (value: string) => void;
  onTabChange: (tab: "tilesets" | "tiles") => void;
  onClose: () => void;
  onSelectSource: (sourceImageId: string) => void;
  onToggleSlice: (sliceId: string) => void;
}) {
  const search = props.search.trim().toLowerCase();
  const filteredSources = props.sourceImages.filter((source) => !search || source.fileName.toLowerCase().includes(search));
  const filteredSlices = props.slices.filter((slice) => !search || slice.name.toLowerCase().includes(search));
  return (
    <div className="picker-overlay" onClick={props.onClose}>
      <section className="panel tile-picker-modal" onClick={(event) => event.stopPropagation()}>
        <div className="picker-search-row">
          <input className="picker-search" value={props.search} placeholder="Search sources or slices" onChange={(event) => props.onSearchChange(event.target.value)} />
          <button className="ghost picker-close" onClick={props.onClose}>✕</button>
        </div>
        <div className="picker-tabs">
          <button className={props.tab === "tilesets" ? "secondary active" : "ghost"} onClick={() => props.onTabChange("tilesets")}>Sources</button>
          <button className={props.tab === "tiles" ? "secondary active" : "ghost"} onClick={() => props.onTabChange("tiles")}>Slices</button>
        </div>
        {props.tab === "tilesets" ? (
          <div className="picker-grid">
            {filteredSources.map((source) => (
              <button key={source.id} className={source.id === props.selectedSourceImageId ? "tile-picker-card active" : "tile-picker-card"} onClick={() => props.onSelectSource(source.id)}>
                <div className="tile-preview">
                  <div className="tile-preview-image" style={{ width: Math.max(32, Math.min(96, source.width)), height: Math.max(32, Math.min(96, source.height)), backgroundImage: `url(${source.dataUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                </div>
                <strong>{source.fileName}</strong>
                <span>{source.width} x {source.height}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="dense-picker-container" style={{ maxHeight: 500 }}>
            <div className="dense-picker-grid">
              {filteredSlices.map((slice) => {
                const match = slice.name.match(/_(\d+)_(\d+)(?:\.\w+)?$/);
                const gridRow = match ? parseInt(match[1], 10) + 1 : undefined;
                const gridColumn = match ? parseInt(match[2], 10) + 1 : undefined;
                return (
                  <button 
                    key={slice.id} 
                    className={props.selectedSliceIds.includes(slice.id) ? "dense-tile-btn active" : "dense-tile-btn"} 
                    onClick={() => props.onToggleSlice(slice.id)}
                    title={`${slice.name} (${slice.kind})`}
                    style={gridRow && gridColumn ? { gridRow, gridColumn } : undefined}
                  >
                    <SliceAssetPreview project={props.project} slice={slice} />
                    <div className="dense-tile-label">{slice.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function LevelAssetTray(props: {
  project: ProjectDocument;
  selectedTilesetId: number | null;
  selectedPaintTileId: number;
  onSelectTileset: (tilesetId: number) => void;
  onSelectTile: (tileId: number) => void;
}) {
  const selectedTileset = props.project.tilesets.find((tileset) => tileset.id === props.selectedTilesetId) ?? props.project.tilesets[0] ?? null;
  const tiles = selectedTileset
    ? selectedTileset.tileIds
        .map((tileId) => props.project.tiles.find((tile) => tile.tileId === tileId))
        .filter((tile): tile is TilesetTileAsset => Boolean(tile))
    : [];
  return (
    <div className="tray-layout">
      <div className="tray-column">
        <h3>Tilesets</h3>
        <div className="asset-list">
          {props.project.tilesets.map((tileset) => (
            <button key={tileset.id} className={tileset.id === selectedTileset?.id ? "asset-card active" : "asset-card"} onClick={() => props.onSelectTileset(tileset.id)}>
              <strong>{tileset.name}</strong>
              <span>{tileset.tileCount} tiles</span>
            </button>
          ))}
        </div>
      </div>
      <div className="tray-column">
        <h3>Tile Palette</h3>
        <div className="dense-picker-container" style={{ flex: 1 }}>
          <div className="dense-picker-grid">
            {tiles.map((tile) => {
              const match = tile.name.match(/_(\d+)_(\d+)(?:\.\w+)?$/);
              const gridRow = match ? parseInt(match[1], 10) + 1 : undefined;
              const gridColumn = match ? parseInt(match[2], 10) + 1 : undefined;
              return (
                <button 
                  key={tile.tileId} 
                  className={tile.tileId === props.selectedPaintTileId ? "dense-tile-btn active" : "dense-tile-btn"} 
                  onClick={() => props.onSelectTile(tile.tileId)}
                  title={`${tile.name} (#${tile.tileId})`}
                  style={gridRow && gridColumn ? { gridRow, gridColumn } : undefined}
                >
                  <TileAssetPreview project={props.project} tile={tile} />
                  <div className="dense-tile-label">{tile.name}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function LevelAssetPicker(props: {
  project: ProjectDocument;
  selectedTilesetId: number | null;
  selectedPaintTileId: number;
  selectedTerrainSetId: number | null;
  terrainSets: TerrainSet[];
  search: string;
  tab: "tilesets" | "tiles" | "terrain";
  onSearchChange: (value: string) => void;
  onTabChange: (tab: "tilesets" | "tiles" | "terrain") => void;
  onClose: () => void;
  onSelectTileset: (tilesetId: number) => void;
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
  const selectedTileset =
    props.project.tilesets.find((tileset) => tileset.id === props.selectedTilesetId) ?? props.project.tilesets[0] ?? null;
  const selectedTerrainSet =
    props.terrainSets.find((terrainSet) => terrainSet.id === props.selectedTerrainSetId) ?? props.terrainSets[0] ?? null;
  const filteredTilesets = props.project.tilesets.filter((tileset) =>
    !search || tileset.name.toLowerCase().includes(search),
  );
  const tiles = selectedTileset
    ? selectedTileset.tileIds
        .map((tileId) => props.project.tiles.find((tile) => tile.tileId === tileId))
        .filter((tile): tile is TilesetTileAsset => Boolean(tile))
        .filter((tile) => !search || tile.name.toLowerCase().includes(search))
    : [];
  const filteredTerrainSets = props.terrainSets.filter((terrainSet) => !search || terrainSet.name.toLowerCase().includes(search));
  const currentTile = props.project.tiles.find((tile) => tile.tileId === props.selectedPaintTileId) ?? null;


  return (
    <div className="picker-overlay" onClick={props.onClose}>
      <section className="panel tile-picker-modal" onClick={(event) => event.stopPropagation()}>
        <div className="picker-search-row">
          <input
            className="picker-search"
            value={props.search}
            placeholder="Search tilesets or tiles"
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
          <button className="ghost picker-close" onClick={props.onClose}>✕</button>
        </div>
        <div className="picker-tabs">
          <button className={props.tab === "tiles" ? "secondary active" : "ghost"} onClick={() => props.onTabChange("tiles")}>Tiles</button>
          <button className={props.tab === "tilesets" ? "secondary active" : "ghost"} onClick={() => props.onTabChange("tilesets")}>Tilesets</button>
          <button className={props.tab === "terrain" ? "secondary active" : "ghost"} onClick={() => props.onTabChange("terrain")}>Brushes</button>
        </div>
        {props.tab === "tilesets" ? (
          <div className="picker-grid">
            {filteredTilesets.map((tileset) => (
              <button
                key={tileset.id}
                className={tileset.id === selectedTileset?.id ? "tile-picker-card active" : "tile-picker-card"}
                onClick={() => props.onSelectTileset(tileset.id)}
              >
                <TileAssetPreview
                  project={props.project}
                  tile={
                    tileset.tileIds
                      .map((tileId) => props.project.tiles.find((tile) => tile.tileId === tileId))
                      .find((tile): tile is TilesetTileAsset => Boolean(tile)) ?? null
                  }
                />
                <strong>{tileset.name}</strong>
                <span>{tileset.tileCount} tiles</span>
              </button>
            ))}
          </div>
        ) : props.tab === "tiles" ? (
          <>
            <div className="picker-section-header">
              <strong>{selectedTileset?.name ?? "No tileset selected"}</strong>
              <span>{tiles.length} tiles</span>
            </div>
            <div className="dense-picker-container">
              <div className="dense-picker-grid">
                {tiles.map((tile) => {
                  const match = tile.name.match(/_(\d+)_(\d+)(?:\.\w+)?$/);
                  const gridRow = match ? parseInt(match[1], 10) + 1 : undefined;
                  const gridColumn = match ? parseInt(match[2], 10) + 1 : undefined;
                  return (
                    <button
                      key={tile.tileId}
                      className={tile.tileId === props.selectedPaintTileId ? "dense-tile-btn active" : "dense-tile-btn"}
                      onClick={() => props.onSelectTile(tile.tileId)}
                      title={`${tile.name} (#${tile.tileId})`}
                      style={gridRow && gridColumn ? { gridRow, gridColumn } : undefined}
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
                    <button
                      className="primary"
                      onClick={() => {
                        const currentTile = props.project.tiles.find((t) => t.tileId === props.selectedPaintTileId);
                        if (!currentTile || !selectedTileset) return;
                        const match = currentTile.name.match(/_(\d+)_(\d+)(?:\.\w+)?$/);
                        if (!match) return;
                        const startRow = parseInt(match[1], 10);
                        const startCol = parseInt(match[2], 10);
                        const newSlots: Record<number, number> = {};
                        for (const [key, mask] of Object.entries(CARDINAL_MASKS)) {
                          const [rowOff, colOff] = key.split('_').map(Number);
                          const targetRow = startRow + rowOff;
                          const targetCol = startCol + colOff;
                          const targetSuffix = `_${targetRow < 10 ? '0' : ''}${targetRow}_${targetCol < 10 ? '0' : ''}${targetCol}`;
                          const found = selectedTileset.tileIds.map(id => props.project.tiles.find(t => t.tileId === id)).find(t => t?.name.endsWith(targetSuffix));
                          if (found) newSlots[mask] = found.tileId;
                        }
                        props.onUpdateTerrainSet({ ...selectedTerrainSet, slots: { ...selectedTerrainSet.slots, ...newSlots } });
                      }}
                      title="Map a 4x4 block of tiles starting from the current selection as Top-Left"
                    >
                      Map from Selection
                    </button>
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
                      const match = tile.name.match(/_(\d+)_(\d+)(?:\.\w+)?$/);
                      const gridRow = match ? parseInt(match[1], 10) + 1 : undefined;
                      const gridColumn = match ? parseInt(match[2], 10) + 1 : undefined;
                      return (
                        <button
                          key={tile.tileId}
                          className={tile.tileId === props.selectedPaintTileId ? "dense-tile-btn active" : "dense-tile-btn"}
                          onClick={() => props.onSetPaintTile(tile.tileId)}
                          title={`${tile.name} (#${tile.tileId})`}
                          style={gridRow && gridColumn ? { gridRow, gridColumn } : undefined}
                        >
                          <TileAssetPreview project={props.project} tile={tile} />
                          <div className="dense-tile-label">{tile.name}</div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  filteredTerrainSets.map((terrainSet) => {
                    const centerTile = props.project.tiles.find((tile) => tile.tileId === (terrainSet.slots[0] || 0)) ?? null;
                    return (
                      <div key={terrainSet.id} className="picker-terrain-card-wrapper">
                        <button
                          className={terrainSet.id === selectedTerrainSet?.id ? "tile-picker-card active" : "tile-picker-card"}
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
                {selectedTerrainSet && !editingBrush && (
                  <button className="secondary" onClick={() => setEditingBrush(true)}>Edit Tiles</button>
                )}
              </div>
              {selectedTerrainSet ? (
                <div className="terrain-blob-editor">
                  <div className="terrain-dense-group">
                    <div className="terrain-inner-grid-header">Cardinal 4x4 Grid</div>
                    <div className="dense-picker-grid" style={{ gridTemplateColumns: "repeat(4, 96px)" }}>
                      {Array.from({ length: 16 }).map((_, mask) => {
                        const tileId = selectedTerrainSet.slots[mask];
                        const tile = tileId ? props.project.tiles.find((t) => t.tileId === tileId) ?? null : null;
                        const n = mask & 1; const s = mask & 2; const w = mask & 4; const e = mask & 8;
                        const label = {
                          10: "Top Left", 14: "Top", 6: "Top Right", 0: "Isolated",
                          11: "Left", 15: "Center", 7: "Right", 2: "Top End",
                          9: "Bot Left", 13: "Bottom", 5: "Bot Right", 1: "Bot End",
                          8: "Left End", 4: "Right End", 3: "Column", 12: "Row"
                        }[mask] ?? (n || s || w || e ? (n ? "N" : "") + (s ? "S" : "") + (w ? "W" : "") + (e ? "E" : "") : "•");
                        return (
                          <button
                            key={mask}
                            className="dense-tile-btn brush-slot-btn"
                            onClick={() => props.onAssignTerrainSlot(mask)}
                          >
                            <TileAssetPreview project={props.project} tile={tile} scale={6} />
                            <div className="dense-tile-label">{label}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
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

function TileAssetPreview({
  project,
  tile,
  scale: forcedScale,
}: {
  project: ProjectDocument;
  tile: TilesetTileAsset | null;
  scale?: number;
}) {
  if (!tile) {
    return <div className="tile-preview empty" />;
  }
  const slice = project.slices.find((entry) => entry.id === tile.sliceId) ?? null;
  return <SliceAssetPreview project={project} slice={slice} scale={forcedScale} />;
}

function SliceAssetPreview({
  project,
  slice,
  scale: forcedScale,
}: {
  project: ProjectDocument;
  slice: SliceAsset | null;
  scale?: number;
}) {
  if (!slice) {
    return <div className="tile-preview empty" />;
  }
  const source = project.sourceImages.find((entry) => entry.id === slice.sourceImageId) ?? null;
  if (!source) {
    return <div className="tile-preview empty" />;
  }
  const scale = forcedScale ?? Math.max(
    1,
    Math.floor(
      Math.min(88 / Math.max(1, slice.sourceRect.width), 88 / Math.max(1, slice.sourceRect.height)),
    ),
  );
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

function ToolButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "secondary active tool-button" : "ghost tool-button"} onClick={onClick} title={label}>
      <span>{icon}</span>
      <small>{label}</small>
    </button>
  );
}

function ZoomControls({ zoom, onChange }: { zoom: number; onChange: (value: number) => void }) {
  return (
    <div className="zoom-controls">
      <button className="ghost" onClick={() => onChange(clamp(zoom * 0.9, 0.25, 8))}>−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button className="ghost" onClick={() => onChange(clamp(zoom * 1.1, 0.25, 8))}>+</button>
    </div>
  );
}

function getImagePoint(
  event: ReactPointerEvent<HTMLDivElement>,
  element: HTMLDivElement | null,
  source: SourceImageAsset,
  zoom: number,
) {
  if (!element) {
    return null;
  }
  const bounds = element.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / zoom);
  const y = Math.floor((event.clientY - bounds.top) / zoom);
  if (x < 0 || y < 0 || x >= source.width || y >= source.height) {
    return null;
  }
  return { x, y };
}

function getCanvasTile(
  event: ReactPointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement | null,
  level: LevelDocument,
  zoom: number,
) {
  if (!canvas) {
    return null;
  }
  const bounds = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - bounds.left) / (level.tileWidth * zoom));
  const y = Math.floor((event.clientY - bounds.top) / (level.tileHeight * zoom));
  if (x < 0 || y < 0 || x >= level.mapWidthTiles || y >= level.mapHeightTiles) {
    return null;
  }
  return { x, y };
}

function rectStyle(rect: SliceRect, zoom: number) {
  return {
    left: rect.x * zoom,
    top: rect.y * zoom,
    width: rect.width * zoom,
    height: rect.height * zoom,
  };
}

function normalizeRect(x0: number, y0: number, x1: number, y1: number): SliceRect {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  return {
    x: left,
    y: top,
    width: Math.abs(x1 - x0) + 1,
    height: Math.abs(y1 - y0) + 1,
  };
}

function pointInRect(x: number, y: number, rect: SliceRect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function layerCapabilityLabel(layer: LevelLayer) {
  const labels: string[] = [];
  if (layer.hasTiles) {
    labels.push("tiles");
  }
  if (layer.hasCollision) {
    labels.push("collision");
  }
  if (layer.hasMarkers) {
    labels.push("markers");
  }
  return labels.join(" + ") || "empty";
}

function renderLevelCanvas(
  canvas: HTMLCanvasElement | null,
  project: ProjectDocument,
  level: LevelDocument | null,
  selectedLayer: LevelLayer | null,
  zoom: number,
) {
  if (!canvas || !level) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const tileW = level.tileWidth * zoom;
  const tileH = level.tileHeight * zoom;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#12171c";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  const tileById = new Map(project.tiles.map((entry) => [entry.tileId, entry]));
  const sliceById = new Map(project.slices.map((entry) => [entry.id, entry]));
  const sourceById = new Map(project.sourceImages.map((entry) => [entry.id, entry]));

  for (const layer of level.layers) {
    if (!layer.visible || !layer.hasTiles) {
      continue;
    }
    for (let y = 0; y < layer.heightTiles; y += 1) {
      for (let x = 0; x < layer.widthTiles; x += 1) {
        const tile = getTileAt(level, layer, x, y);
        if (!tile.tileId) {
          continue;
        }
        const tileAsset = tileById.get(tile.tileId);
        const slice = tileAsset ? sliceById.get(tileAsset.sliceId) : null;
        const source = slice ? sourceById.get(slice.sourceImageId) : null;
        const image = source ? getCachedRenderImage(source.id, source.dataUrl) : null;
        if (!tileAsset || !slice || !source || !image?.complete || !image.naturalWidth) {
          context.fillStyle = "#37526a";
          context.fillRect(x * tileW, y * tileH, tileW, tileH);
          continue;
        }
        context.drawImage(
          image,
          slice.sourceRect.x,
          slice.sourceRect.y,
          slice.sourceRect.width,
          slice.sourceRect.height,
          x * tileW,
          y * tileH,
          tileW,
          tileH,
        );
      }
    }
  }

  for (const collision of level.collisions) {
    context.strokeStyle = "#ff7c7c";
    context.lineWidth = 2;
    context.strokeRect(collision.x * zoom, collision.y * zoom, collision.w * zoom, collision.h * zoom);
  }
  for (const marker of level.markers) {
    context.strokeStyle = "#77d8ff";
    context.lineWidth = 2;
    if (marker.shape === "Point") {
      context.beginPath();
      context.arc(marker.x * zoom + tileW * 0.5, marker.y * zoom + tileH * 0.5, 5, 0, Math.PI * 2);
      context.stroke();
    } else {
      context.strokeRect(marker.x * zoom, marker.y * zoom, marker.w * zoom, marker.h * zoom);
    }
  }

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  for (let x = 0; x <= level.mapWidthTiles; x += 1) {
    context.beginPath();
    context.moveTo(x * tileW, 0);
    context.lineTo(x * tileW, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= level.mapHeightTiles; y += 1) {
    context.beginPath();
    context.moveTo(0, y * tileH);
    context.lineTo(canvas.width, y * tileH);
    context.stroke();
  }

  context.strokeStyle = "rgba(255,200,90,0.3)";
  context.lineWidth = 1.5;
  for (let x = 0; x <= level.mapWidthTiles; x += level.chunkWidthTiles) {
    context.beginPath();
    context.moveTo(x * tileW, 0);
    context.lineTo(x * tileW, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= level.mapHeightTiles; y += level.chunkHeightTiles) {
    context.beginPath();
    context.moveTo(0, y * tileH);
    context.lineTo(canvas.width, y * tileH);
    context.stroke();
  }

  if (selectedLayer) {
    context.strokeStyle = "rgba(88,171,255,0.75)";
    context.lineWidth = 2;
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  }
}

const renderImageCache = new Map<string, HTMLImageElement>();

function getCachedRenderImage(sourceId: string, dataUrl: string) {
  let image = renderImageCache.get(sourceId);
  if (!image) {
    image = new Image();
    image.src = dataUrl;
    renderImageCache.set(sourceId, image);
  }
  return image;
}
