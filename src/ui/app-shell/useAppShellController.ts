import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { buildProjectJsonBlob, exportLevelDebugJson, exportTilemapBin, loadProjectFromFile } from "../../export";
import { createGridSlices, createManualSlices, createSourceSlicesFromImages, fileToSourceImageAsset, previewGridSlices } from "../../image";
import { addCollision, addMarker, bucketFill, buildMarker, fillRect, getTileAt, paintTile } from "../../level/editor";
import { createExampleProject } from "../../model/exampleProject";
import { createLevelLayer } from "../../model/project";
import { buildAtlasFromProject, getEffectiveLevelTileIds, getSelectedLayer, getSelectedLevel, getSelectedTerrainSet } from "../../model/selectors";
import { useProjectStore } from "../../model/store";
import { calculateBlob47Mask, getTerrainSetMarkerTileId } from "../../terrain";
import type {
  CollisionObject,
  GridSliceOptions,
  LevelDocument,
  LevelLayer,
  ManualSliceRect,
  MarkerObject,
  PackedAtlas,
  ProjectDocument,
  SliceRect,
  SourceImageAsset,
  TerrainSet,
  TilesetTileAsset,
} from "../../types";
import { clamp, fileNameBase, saveBlobWithPicker } from "../../utils";
import { DEFAULT_ATLAS_GRID, DEFAULT_MANUAL_RECT, type SlicerCanvasTool } from "./constants";
import { getCanvasTile, getImagePoint, normalizeRect, pointInRect, renderLevelCanvas } from "./canvas";

type ManualTarget = "atlas";

export function useAppShellController() {
  const { state, dispatch } = useProjectStore();
  const level = getSelectedLevel(state);
  const layer = getSelectedLayer(state);
  const selectedTerrainSet = getSelectedTerrainSet(state);
  const selectedSourceImage =
    state.project.sourceImages.find((source) => source.id === state.editor.selectedSourceImageId) ??
    state.project.sourceImages[0] ??
    null;
  const selectedSlices = state.project.slices.filter((slice) => state.editor.selectedSliceIds.includes(slice.id));

  const [atlas, setAtlas] = useState<PackedAtlas | null>(null);
  const [assetTrayOpen, setAssetTrayOpen] = useState(false);
  const [selectedPaintTileId, setSelectedPaintTileId] = useState(0);
  const [assetSearch, setAssetSearch] = useState("");
  const [levelAssetTab, setLevelAssetTab] = useState<"slices" | "tiles" | "terrain">("tiles");
  const [recentTileIds, setRecentTileIds] = useState<number[]>([]);
  const [recentTerrainSetIds, setRecentTerrainSetIds] = useState<number[]>([]);
  const [levelPan, setLevelPan] = useState({ x: 0, y: 0 });
  const [slicerPan, setSlicerPan] = useState({ x: 0, y: 0 });
  const [draggedSpriteIndex, setDraggedSpriteIndex] = useState<number | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [atlasModule, setAtlasModule] = useState<"pack" | "slicer">("pack");
  const [atlasGridOptions, setAtlasGridOptions] = useState<GridSliceOptions>(DEFAULT_ATLAS_GRID);
  const [atlasManualRects, setAtlasManualRects] = useState<ManualSliceRect[]>([]);
  const [atlasManualKind, setAtlasManualKind] = useState<"sprite" | "tile" | "both">("both");
  const [atlasManualDraft, setAtlasManualDraft] = useState<ManualSliceRect>(DEFAULT_MANUAL_RECT);
  const [atlasSelectedManualRectIndex, setAtlasSelectedManualRectIndex] = useState<number | null>(null);
  const [slicerCanvasTool, setSlicerCanvasTool] = useState<SlicerCanvasTool>("draw");
  const [dragRect, setDragRect] = useState<SliceRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [moveStart, setMoveStart] = useState<{ x: number; y: number } | null>(null);
  const [moveOrigin, setMoveOrigin] = useState<ManualSliceRect | null>(null);

  const atlasCanvasRef = useRef<HTMLDivElement | null>(null);
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
  const effectiveLevelTileIds = useMemo(() => getEffectiveLevelTileIds(state.project, level), [level, state.project]);
  const tilePalette = useMemo(
    () =>
      effectiveLevelTileIds
        .map((tileId) => state.project.tiles.find((tile) => tile.tileId === tileId))
        .filter((tile): tile is TilesetTileAsset => Boolean(tile)),
    [effectiveLevelTileIds, state.project.tiles],
  );
  const levelTerrainSets = useMemo(
    () =>
      level
        ? state.project.terrainSets.filter(
            (terrainSet) =>
              terrainSet.levelId === level.id ||
              (!terrainSet.levelId && Object.values(terrainSet.slots).some((tileId) => effectiveLevelTileIds.includes(tileId))),
          )
        : [],
    [effectiveLevelTileIds, level, state.project.terrainSets],
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
    if (!tilePalette.length) {
      if (selectedPaintTileId !== 0) {
        setSelectedPaintTileId(0);
      }
      return;
    }
    if (!tilePalette.some((tile) => tile.tileId === selectedPaintTileId)) {
      setSelectedPaintTileId(tilePalette[0].tileId);
    }
  }, [selectedPaintTileId, tilePalette]);

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

  function updateManualRect(index: number, patch: Partial<ManualSliceRect>) {
    setAtlasManualRects((current) => current.map((rect, rectIndex) => (rectIndex === index ? { ...rect, ...patch } : rect)));
    if (atlasSelectedManualRectIndex === index) {
      setAtlasManualDraft((current) => ({ ...current, ...patch }));
    }
  }

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
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: "undo" });
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "x") {
        event.preventDefault();
        dispatch({ type: "redo" });
        return;
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
      if (state.editor.slicerMode === "manual" && state.editor.workspace === "atlas" && atlasModule === "slicer") {
        if (event.key === "v") {
          setSlicerCanvasTool("move");
        }
        if (event.key === "d") {
          setSlicerCanvasTool("draw");
        }
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && selectedSourceImage && atlasSelectedManualRectIndex !== null) {
          event.preventDefault();
          const rect = atlasManualRects[atlasSelectedManualRectIndex];
          if (!rect) {
            return;
          }
          const step = event.shiftKey ? 10 : 1;
          const patch: Partial<ManualSliceRect> = {};
          if (event.key === "ArrowLeft") patch.x = clamp(rect.x - step, 0, selectedSourceImage.width - rect.width);
          if (event.key === "ArrowRight") patch.x = clamp(rect.x + step, 0, selectedSourceImage.width - rect.width);
          if (event.key === "ArrowUp") patch.y = clamp(rect.y - step, 0, selectedSourceImage.height - rect.height);
          if (event.key === "ArrowDown") patch.y = clamp(rect.y + step, 0, selectedSourceImage.height - rect.height);
          updateManualRect(atlasSelectedManualRectIndex, patch);
          setAtlasManualDraft((current) => ({ ...current, ...patch }));
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
    const stage = state.editor.workspace === "atlas" && atlasModule === "slicer" ? atlasStageRef.current : null;
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
  }, [level?.id, state.editor.levelZoom]);

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
        setAtlasGridOptions((current) => ({ ...current, namePrefix: fileNameBase(nextSources[0].fileName) }));
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to import PNGs.");
    } finally {
      dispatch({ type: "setBusy", busy: false });
    }
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
    if (state.editor.slicerMode === "manual") {
      const result = await createManualSlices(
        selectedSourceImage,
        atlasManualRects,
        atlasManualKind,
        state.project.idCounters.slice,
      );
      if (fullSourceSliceIds.length) {
        dispatch({ type: "removeSlicesFromAtlas", sliceIds: fullSourceSliceIds });
      }
      dispatch({ type: "addSlices", slices: result.slices });
    } else {
      const result = await createGridSlices(selectedSourceImage, atlasGridOptions, state.project.idCounters.slice);
      if (fullSourceSliceIds.length) {
        dispatch({ type: "removeSlicesFromAtlas", sliceIds: fullSourceSliceIds });
      }
      dispatch({ type: "addSlices", slices: result.slices });
    }
    setAtlasManualRects([]);
    setAtlasManualDraft(DEFAULT_MANUAL_RECT);
    setAtlasSelectedManualRectIndex(null);
  }

  function addSelectedSlicesToAtlas() {
    if (!state.editor.selectedSliceIds.length) {
      setError("Select slices first.");
      return;
    }
    dispatch({ type: "addSlicesToAtlas", sliceIds: state.editor.selectedSliceIds });
    setAtlasModule("pack");
  }

  function addSelectedSlicesToLevel(): boolean {
    if (!level) {
      setError("Select a level first.");
      return false;
    }
    const existingTileBySliceId = new Map(state.project.tiles.map((tile) => [tile.sliceId, tile]));
    const levelTileIdSet = new Set(effectiveLevelTileIds);
    const tileSliceIds = selectedSlices
      .filter((slice) => slice.kind === "tile" || slice.kind === "both")
      .filter((slice) => {
        const existingTile = existingTileBySliceId.get(slice.id);
        return !existingTile || !levelTileIdSet.has(existingTile.tileId);
      })
      .map((slice) => slice.id);
    if (!tileSliceIds.length) {
      setError("Select tile-tagged slices that are not already in the current level.");
      return false;
    }
    dispatch({ type: "addLevelTiles", levelId: level.id, sliceIds: tileSliceIds });
    return true;
  }

  async function saveProject() {
    try {
      await saveBlobWithPicker(
        buildProjectJsonBlob(state.project),
        `${fileNameBase(state.project.name)}.project.json`,
        "Atlas Manager Project",
        { "application/json": [".json"] },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setError(error instanceof Error ? error.message : "Failed to save project.");
    }
  }

  async function loadProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      dispatch({ type: "replaceProject", project: await loadProjectFromFile(file) });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load project.");
    }
  }

  async function exportAtlas() {
    const packedAtlas = await buildAtlasFromProject(state.project);
    if (!packedAtlas) {
      return;
    }
    try {
      await saveBlobWithPicker(
        new Blob([new Uint8Array(packedAtlas.atlasBin)], { type: "application/octet-stream" }),
        "atlas.bin",
        "Atlas Binary",
        { "application/octet-stream": [".bin"] },
      );
      await saveBlobWithPicker(
        new Blob([new Uint8Array(packedAtlas.atlasMetaBin)], { type: "application/octet-stream" }),
        "atlas.meta.bin",
        "Atlas Metadata",
        { "application/octet-stream": [".bin"] },
      );
      if (state.project.atlasSettings.includeDebugJson) {
        await saveBlobWithPicker(
          new Blob([packedAtlas.atlasDebugJson], { type: "application/json" }),
          "atlas.debug.json",
          "Atlas Debug JSON",
          { "application/json": [".json"] },
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setError(error instanceof Error ? error.message : "Failed to export atlas.");
    }
  }

  async function exportLevel() {
    if (!level) {
      return;
    }
    try {
      const bytes = await exportTilemapBin(state.project, level);
      await saveBlobWithPicker(
        new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }),
        `${level.name}.tmap.bin`,
        "Tilemap Binary",
        { "application/octet-stream": [".bin"] },
      );
      await saveBlobWithPicker(
        new Blob([await exportLevelDebugJson(state.project, level)], { type: "application/json" }),
        `${level.name}.debug.json`,
        "Level Debug JSON",
        { "application/json": [".json"] },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setError(error instanceof Error ? error.message : "Failed to export level.");
    }
  }

  function resolveTerrainTileId(levelDocument: LevelDocument, levelLayer: LevelLayer, tileX: number, tileY: number, terrainSet: TerrainSet) {
    const isTerrainAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= levelLayer.widthTiles || y >= levelLayer.heightTiles) {
        return false;
      }
      const tileId = getTileAt(levelDocument, levelLayer, x, y).tileId;
      return terrainTileToSetId.get(tileId) === terrainSet.id;
    };
    if (terrainSet.mode === "subtile" || terrainSet.mode === "rpgmaker") {
      return getTerrainSetMarkerTileId(terrainSet);
    }
    const n = isTerrainAt(tileX, tileY - 1);
    const s = isTerrainAt(tileX, tileY + 1);
    const w = isTerrainAt(tileX - 1, tileY);
    const e = isTerrainAt(tileX + 1, tileY);
    if (terrainSet.mode === "blob47") {
      const nw = isTerrainAt(tileX - 1, tileY - 1);
      const ne = isTerrainAt(tileX + 1, tileY - 1);
      const sw = isTerrainAt(tileX - 1, tileY + 1);
      const se = isTerrainAt(tileX + 1, tileY + 1);
      const blobMask = calculateBlob47Mask(n, s, w, e, nw, ne, sw, se);
      return terrainSet.slots[blobMask] || getTerrainSetMarkerTileId(terrainSet);
    }
    let mask = 0;
    if (n) mask |= 1;
    if (s) mask |= 2;
    if (w) mask |= 4;
    if (e) mask |= 8;
    return terrainSet.slots[mask] || getTerrainSetMarkerTileId(terrainSet);
  }

  function applyTerrainBrush(levelDocument: LevelDocument, levelLayer: LevelLayer, tileX: number, tileY: number, terrainSet: TerrainSet) {
    let next = paintTile(levelDocument, levelLayer, tileX, tileY, getTerrainSetMarkerTileId(terrainSet));
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
    const paintTileId = selectedPaintTileId || tilePalette[0]?.tileId || 0;
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
    const paintTileId = selectedPaintTileId || tilePalette[0]?.tileId || 0;
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
    const paintTileId = selectedPaintTileId || tilePalette[0]?.tileId || 0;
    dispatch({ type: "updateLevel", level: fillRect(level, layer, dragStart.x, dragStart.y, point.x, point.y, paintTileId) });
    setDragStart(null);
  }

  function addManualRect(target: ManualTarget) {
    const draft = atlasManualDraft;
    if (draft.width <= 0 || draft.height <= 0) {
      return;
    }
    if (target !== "atlas") {
      return;
    }
    setAtlasManualRects((current) => {
      const next = [...current, { ...draft, name: draft.name.trim() || `sprite_${String(current.length).padStart(2, "0")}` }];
      setAtlasSelectedManualRectIndex(next.length - 1);
      return next;
    });
  }

  function commitDragRect(target: ManualTarget) {
    if (!dragRect || dragRect.width <= 1 || dragRect.height <= 1) {
      return;
    }
    addManualRect(target);
    setAtlasManualDraft(DEFAULT_MANUAL_RECT);
  }

  function onSlicerPointerDown(event: ReactPointerEvent<HTMLDivElement>, target: ManualTarget) {
    if (!selectedSourceImage || state.editor.slicerMode !== "manual" || spaceHeld) {
      return;
    }
    const point = getImagePoint(event, atlasCanvasRef.current, selectedSourceImage, state.editor.slicerZoom);
    if (!point) {
      return;
    }
    if (slicerCanvasTool === "move" && atlasSelectedManualRectIndex !== null) {
      const selectedRect = atlasManualRects[atlasSelectedManualRectIndex];
      if (selectedRect && pointInRect(point.x, point.y, selectedRect)) {
        setMoveStart(point);
        setMoveOrigin(selectedRect);
        return;
      }
    }
    setAtlasSelectedManualRectIndex(null);
    setDragStart(point);
    setDragRect({ x: point.x, y: point.y, width: 1, height: 1 });
  }

  function onSlicerPointerMove(event: ReactPointerEvent<HTMLDivElement>, target: ManualTarget) {
    if (!selectedSourceImage || state.editor.slicerMode !== "manual") {
      return;
    }
    const point = getImagePoint(event, atlasCanvasRef.current, selectedSourceImage, state.editor.slicerZoom);
    if (!point) {
      return;
    }
    if (moveStart && moveOrigin && atlasSelectedManualRectIndex !== null) {
      const nextX = clamp(moveOrigin.x + (point.x - moveStart.x), 0, selectedSourceImage.width - moveOrigin.width);
      const nextY = clamp(moveOrigin.y + (point.y - moveStart.y), 0, selectedSourceImage.height - moveOrigin.height);
      updateManualRect(atlasSelectedManualRectIndex, { x: nextX, y: nextY });
      setAtlasManualDraft((current) => ({ ...current, x: nextX, y: nextY }));
      return;
    }
    if (!dragStart) {
      return;
    }
    const nextRect = normalizeRect(dragStart.x, dragStart.y, point.x, point.y);
    setDragRect(nextRect);
    setAtlasManualDraft((current) => ({ ...current, x: nextRect.x, y: nextRect.y, width: nextRect.width, height: nextRect.height }));
  }

  function onSlicerPointerUp(target: ManualTarget) {
    if (moveStart) {
      setMoveStart(null);
      setMoveOrigin(null);
      return;
    }
    commitDragRect(target);
    setDragStart(null);
    setDragRect(null);
  }

  function removeManualRect(index: number) {
    setAtlasManualRects((current) => current.filter((_, rectIndex) => rectIndex !== index));
    setAtlasSelectedManualRectIndex((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
  }

  function selectManualRect(index: number | null) {
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
      setLevelPan({ x: pointerX - worldX * nextZoom, y: pointerY - worldY * nextZoom });
      dispatch({ type: "setLevelZoom", zoom: nextZoom });
    } else {
      const worldX = (pointerX - slicerPan.x) / currentZoom;
      const worldY = (pointerY - slicerPan.y) / currentZoom;
      setSlicerPan({ x: pointerX - worldX * nextZoom, y: pointerY - worldY * nextZoom });
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

  return {
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
    createExampleProject,
    createLevelLayer,
  };
}
