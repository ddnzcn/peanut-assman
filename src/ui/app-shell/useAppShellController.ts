import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { getFrameAtTime as getAnimFrameAtTime } from "../../animation/playback";
import { buildProjectJsonBlob, exportLevelDebugJson, exportTilemapBin, loadProjectFromFile } from "../../export";
import { createSourceSlicesFromImages, fileToSourceImageAsset } from "../../image";
import { createExampleProject } from "../../model/exampleProject";
import { createLevelLayer } from "../../model/project";
import { getEffectiveLevelTileIds, getSelectedLayer, getSelectedLevel, getSelectedTerrainSet } from "../../model/selectors";
import { useProjectStore } from "../../model/store";
import type {
  SourceImageAsset,
  TilesetTileAsset,
} from "../../types";
import { clamp, fileNameBase, fnv1a32, saveBlobWithPicker } from "../../utils";
import { buildAtlasFromProject } from "../../model/selectors";
import { useAtlasEditor } from "./useAtlasEditor";
import { useLevelEditor } from "./useLevelEditor";

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

  const [assetTrayOpen, setAssetTrayOpen] = useState(false);
  const [selectedPaintTileId, setSelectedPaintTileId] = useState(0);
  const [assetSearch, setAssetSearch] = useState("");
  const levelAssetTab = state.editor.levelPickerTab;
  const setLevelAssetTab = (tab: typeof levelAssetTab) => dispatch({ type: "setLevelPickerTab", tab });
  const [recentTileIds, setRecentTileIds] = useState<number[]>([]);
  const [recentTerrainSetIds, setRecentTerrainSetIds] = useState<number[]>([]);
  const [pinnedTileIds, setPinnedTileIds] = useState<number[]>([]);
  const [levelPan, setLevelPan] = useState({ x: 0, y: 0 });
  const [slicerPan, setSlicerPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);

  const panRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    workspace: "level" | "slicer";
  } | null>(null);

  // Animation playback time (ref — not in store to avoid re-renders on every frame)
  const animPlaybackTimeRef = useRef<number>(0);

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
        if (tileId) map.set(tileId, terrainSet.id);
      });
    });
    return map;
  }, [state.project.terrainSets]);
  const atlasSprites = useMemo(
    () =>
      state.project.sprites.filter((sprite) => sprite.includeInAtlas).map((sprite) => ({
        sprite,
        slice: state.project.slices.find((slice) => slice.id === sprite.sliceId) ?? null,
      })),
    [state.project.slices, state.project.sprites],
  );

  function setError(error: string | null) {
    dispatch({ type: "setError", error });
  }

  function pushRecentTile(tileId: number) {
    if (!tileId) return;
    setRecentTileIds((current) => [tileId, ...current.filter((entry) => entry !== tileId)].slice(0, 8));
  }

  function togglePinnedTile(tileId: number) {
    if (!tileId) return;
    setPinnedTileIds((current) =>
      current.includes(tileId)
        ? current.filter((entry) => entry !== tileId)
        : [tileId, ...current.filter((entry) => entry !== tileId)].slice(0, 16),
    );
  }

  function pinTileRegion(tileIds: number[]) {
    const normalized = tileIds.filter(Boolean);
    if (!normalized.length) return;
    setPinnedTileIds((current) =>
      [...normalized, ...current.filter((entry) => !normalized.includes(entry))].slice(0, 16),
    );
  }

  function pushRecentTerrainSet(terrainSetId: number | null) {
    if (!terrainSetId) return;
    setRecentTerrainSetIds((current) =>
      [terrainSetId, ...current.filter((entry) => entry !== terrainSetId)].slice(0, 6),
    );
  }

  const levelEditor = useLevelEditor({
    state,
    dispatch,
    level,
    layer,
    selectedTerrainSet,
    selectedPaintTileId,
    setSelectedPaintTileId,
    pushRecentTile,
    tilePalette,
    terrainTileToSetId,
    spaceHeld,
    setLevelPan,
  });

  const atlasEditor = useAtlasEditor({
    state,
    dispatch,
    selectedSourceImage,
    selectedSlices,
    level,
    effectiveLevelTileIds,
    spaceHeld,
    setSlicerPan,
    setError,
  });

  // Reset paint tile when the palette changes and the selected tile is no longer valid
  useEffect(() => {
    if (!tilePalette.length) {
      if (selectedPaintTileId !== 0) setSelectedPaintTileId(0);
      return;
    }
    const animatedBaseIds = new Set((state.project.animatedTiles ?? []).map((a) => a.baseTileId));
    if (!tilePalette.some((tile) => tile.tileId === selectedPaintTileId) && !animatedBaseIds.has(selectedPaintTileId)) {
      setSelectedPaintTileId(tilePalette[0].tileId);
    }
  }, [selectedPaintTileId, tilePalette, state.project.animatedTiles]);

  // Prevent browser pinch-to-zoom from intercepting Ctrl+wheel
  useEffect(() => {
    function onWheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const { handleCopy, handleCut, handlePaste } = levelEditor;
    const { atlasModule, atlasManualRects, atlasSelectedManualRectIndex, updateManualRect, setAtlasManualDraft, setSlicerCanvasTool } = atlasEditor;

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
      if (
        (event.metaKey || event.ctrlKey) &&
        ((event.shiftKey && event.key.toLowerCase() === "z") ||
          (!event.metaKey && event.key.toLowerCase() === "y"))
      ) {
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
        if (event.key === "a") {
          event.preventDefault();
          setAssetTrayOpen((current) => !current);
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
          event.preventDefault();
          handleCopy();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") {
          event.preventDefault();
          handleCut();
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
          event.preventDefault();
          handlePaste();
          return;
        }
        if (event.key === "v" && !event.metaKey && !event.ctrlKey) dispatch({ type: "setLevelTool", tool: "select" });
        if (event.key === "b") dispatch({ type: "setLevelTool", tool: "brush" });
        if (event.key === "t") dispatch({ type: "setLevelTool", tool: "terrain" });
        if (event.key === "e") dispatch({ type: "setLevelTool", tool: "erase" });
        if (event.key === "r") dispatch({ type: "setLevelTool", tool: "rect" });
        if (event.key === "g") dispatch({ type: "setLevelTool", tool: "bucket" });
        if (event.key === "h") dispatch({ type: "setLevelTool", tool: "hand" });
        if (event.key === "c") dispatch({ type: "setLevelTool", tool: "collisionRect" });
        if (event.key === "m") dispatch({ type: "setLevelTool", tool: event.shiftKey ? "markerRect" : "markerPoint" });
        if (!event.metaKey && !event.ctrlKey && !event.altKey && /^[0-9]$/.test(event.key)) {
          const quickPalette = [selectedPaintTileId, ...pinnedTileIds, ...recentTileIds]
            .filter((tileId, index, list) => tileId && list.indexOf(tileId) === index)
            .slice(0, 10);
          const slotIndex = event.key === "0" ? 9 : Number(event.key) - 1;
          const tileId = quickPalette[slotIndex];
          if (tileId) {
            event.preventDefault();
            setSelectedPaintTileId(tileId);
            pushRecentTile(tileId);
            dispatch({ type: "setLevelTool", tool: "brush" });
          }
        }
      }
      if (state.editor.slicerMode === "manual" && state.editor.workspace === "atlas" && atlasModule === "slicer") {
        if (event.key === "v") setSlicerCanvasTool("move");
        if (event.key === "d") setSlicerCanvasTool("draw");
        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) &&
          selectedSourceImage &&
          atlasSelectedManualRectIndex !== null
        ) {
          event.preventDefault();
          const rect = atlasManualRects[atlasSelectedManualRectIndex];
          if (!rect) return;
          const step = event.shiftKey ? 10 : 1;
          const patch: { x?: number; y?: number } = {};
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
      if (event.code === "Space") setSpaceHeld(false);
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
    };
  }, [
    atlasEditor,
    dispatch,
    levelEditor,
    pinnedTileIds,
    recentTileIds,
    selectedPaintTileId,
    selectedSourceImage,
    state.editor.levelZoom,
    state.editor.slicerMode,
    state.editor.slicerZoom,
    state.editor.workspace,
  ]);

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

  function handleWheelZoom(event: ReactWheelEvent<HTMLDivElement>, workspace: "level" | "slicer") {
    event.preventDefault();
    const currentZoom = workspace === "level" ? state.editor.levelZoom : state.editor.slicerZoom;
    if (!(event.metaKey || event.ctrlKey) && event.deltaMode === 0 && Math.abs(event.deltaX) < 1) {
      const dx = event.shiftKey ? -event.deltaY : 0;
      const dy = event.shiftKey ? 0 : -event.deltaY;
      if (workspace === "level") {
        setLevelPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      } else {
        setSlicerPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      }
      return;
    }
    const nextZoom = clamp(currentZoom * Math.exp(-event.deltaY * 0.0025), workspace === "level" ? 0.5 : 0.25, 8);
    const bounds = event.currentTarget.getBoundingClientRect();
    const style = window.getComputedStyle(event.currentTarget);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const pointerX = event.clientX - bounds.left - paddingLeft;
    const pointerY = event.clientY - bounds.top - paddingTop;
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
    const isMiddleMouse = event.button === 1;
    if (!isMiddleMouse) {
      if (requiresHandTool && !spaceHeld && state.editor.levelTool !== "hand") return;
      if (!requiresHandTool && !spaceHeld) return;
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
    if (!panRef.current) return;
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
    if (!panRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
  }

  async function importImages(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList?.length) return;
    dispatch({ type: "setBusy", busy: true });
    try {
      const nextSources: SourceImageAsset[] = [];
      let nextId = state.project.idCounters.sourceImage;
      for (const file of [...fileList]) {
        if (!file.type.includes("png") && !file.name.toLowerCase().endsWith(".png")) continue;
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
        atlasEditor.setAtlasGridOptions((current) => ({
          ...current,
          namePrefix: fileNameBase(nextSources[0].fileName),
        }));
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to import PNGs.");
    } finally {
      dispatch({ type: "setBusy", busy: false });
    }
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
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError(error instanceof Error ? error.message : "Failed to save project.");
    }
  }

  async function loadProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      dispatch({ type: "replaceProject", project: await loadProjectFromFile(file) });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load project.");
    }
  }

  async function exportAtlas() {
    const packedAtlas = await buildAtlasFromProject(state.project);
    if (!packedAtlas) return;
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
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError(error instanceof Error ? error.message : "Failed to export atlas.");
    }
  }

  async function exportLevel() {
    if (!level) return;
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
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError(error instanceof Error ? error.message : "Failed to export level.");
    }
  }

  // --- Animation ---
  function createAnimation() {
    const id = state.project.idCounters.spriteAnimation;
    const name = `anim_${String(id).padStart(2, "0")}`;
    dispatch({
      type: "upsertSpriteAnimation",
      animation: { id, name, nameHash: fnv1a32(name), loop: true, frames: [] },
    });
  }

  function handleAnimationTick(timeMs: number) {
    animPlaybackTimeRef.current = timeMs;
    const anim = state.project.spriteAnimations.find((a) => a.id === state.editor.selectedSpriteAnimationId);
    if (!anim || !anim.frames.length) return;
    const frame = getAnimFrameAtTime(anim.frames, timeMs, anim.loop);
    if (frame !== state.editor.animCurrentFrame) {
      dispatch({ type: "setAnimFrame", frame });
    }
  }

  return {
    state,
    dispatch,
    level,
    layer,
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
    levelPan,
    slicerPan,
    // Level editor
    ...levelEditor,
    // Atlas editor
    ...atlasEditor,
    // Shared pan/zoom
    handleWheelZoom,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
    // File I/O
    importImages,
    loadProject,
    saveProject,
    exportAtlas,
    exportLevel,
    // Tile helpers
    pushRecentTile,
    pushRecentTerrainSet,
    togglePinnedTile,
    pinTileRegion,
    // Factory helpers (passed through to V2 shell)
    createExampleProject,
    createLevelLayer,
    // Animation
    createAnimation,
    handleAnimationTick,
  };
}
