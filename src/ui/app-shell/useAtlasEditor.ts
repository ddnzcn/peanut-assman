import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { createGridSlices, createManualSlices, previewGridSlices } from "../../image";
import { buildAtlasFromProject } from "../../model/selectors";
import type {
  AppState,
  GridSliceOptions,
  LevelDocument,
  ManualSliceRect,
  PackedAtlas,
  ProjectAction,
  SliceAsset,
  SliceRect,
  SourceImageAsset,
} from "../../types";
import { clamp } from "../../utils";
import { getImagePoint, normalizeRect, pointInRect } from "./canvas";
import { DEFAULT_ATLAS_GRID, DEFAULT_MANUAL_RECT, type SlicerCanvasTool } from "./constants";

type ManualTarget = "atlas";

interface AtlasEditorParams {
  state: AppState;
  dispatch: React.Dispatch<ProjectAction>;
  selectedSourceImage: SourceImageAsset | null;
  selectedSlices: SliceAsset[];
  level: LevelDocument | null;
  effectiveLevelTileIds: number[];
  spaceHeld: boolean;
  setSlicerPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  setError: (error: string | null) => void;
}

export function useAtlasEditor({
  state,
  dispatch,
  selectedSourceImage,
  selectedSlices,
  level,
  effectiveLevelTileIds,
  spaceHeld,
  setSlicerPan,
  setError,
}: AtlasEditorParams) {
  const atlasCanvasRef = useRef<HTMLDivElement | null>(null);
  const atlasStageRef = useRef<HTMLDivElement | null>(null);
  const atlasPackStageRef = useRef<HTMLDivElement | null>(null);
  const packPanRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  const [atlas, setAtlas] = useState<PackedAtlas | null>(null);
  const [packPan, setPackPan] = useState({ x: 0, y: 0 });
  const [packZoom, setPackZoom] = useState(1);
  const [draggedSpriteIndex, setDraggedSpriteIndex] = useState<number | null>(null);
  const [atlasModule, setAtlasModule] = useState<"pack" | "slicer">("pack");
  const [atlasGridOptions, setAtlasGridOptions] = useState<GridSliceOptions>(DEFAULT_ATLAS_GRID);
  const [atlasManualRects, setAtlasManualRects] = useState<ManualSliceRect[]>([]);
  const [atlasManualKind, setAtlasManualKind] = useState<"sprite" | "tile" | "both">("both");
  const [atlasManualDraft, setAtlasManualDraft] = useState<ManualSliceRect>(DEFAULT_MANUAL_RECT);
  const [atlasSelectedManualRectIndex, setAtlasSelectedManualRectIndex] = useState<number | null>(null);
  const [slicerCanvasTool, setSlicerCanvasTool] = useState<SlicerCanvasTool>("draw");
  const [dragRect, setDragRect] = useState<SliceRect | null>(null);
  const [slicerDragStart, setSlicerDragStart] = useState<{ x: number; y: number } | null>(null);
  const [moveStart, setMoveStart] = useState<{ x: number; y: number } | null>(null);
  const [moveOrigin, setMoveOrigin] = useState<ManualSliceRect | null>(null);

  // Atlas build effect — only re-runs on atlas-relevant fields (not level chunks)
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
      .catch((error) =>
        dispatch({ type: "setError", error: error instanceof Error ? error.message : String(error) }),
      );
    return () => {
      cancelled = true;
    };
  }, [
    dispatch,
    state.project.sourceImages,
    state.project.slices,
    state.project.sprites,
    state.project.tiles,
    state.project.tilesets,
    state.project.terrainSets,
    state.project.spriteAnimations,
    state.project.animatedTiles,
    state.project.atlasSettings,
  ]);

  // Fit slicer image to viewport when entering slicer module or switching source image
  useEffect(() => {
    const stage =
      state.editor.workspace === "atlas" && atlasModule === "slicer" ? atlasStageRef.current : null;
    if (!selectedSourceImage || !stage) return;
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
  }, [atlasModule, dispatch, selectedSourceImage, state.editor.workspace, setSlicerPan]);

  const atlasGridPreview = useMemo(
    () => (selectedSourceImage ? previewGridSlices(selectedSourceImage, atlasGridOptions) : []),
    [selectedSourceImage, atlasGridOptions],
  );

  function updateManualRect(index: number, patch: Partial<ManualSliceRect>) {
    setAtlasManualRects((current) =>
      current.map((rect, rectIndex) => (rectIndex === index ? { ...rect, ...patch } : rect)),
    );
    if (atlasSelectedManualRectIndex === index) {
      setAtlasManualDraft((current) => ({ ...current, ...patch }));
    }
  }

  function addManualRect(target: ManualTarget) {
    if (atlasManualDraft.width <= 0 || atlasManualDraft.height <= 0) return;
    if (target !== "atlas") return;
    setAtlasManualRects((current) => {
      const next = [
        ...current,
        {
          ...atlasManualDraft,
          name: atlasManualDraft.name.trim() || `sprite_${String(current.length).padStart(2, "0")}`,
        },
      ];
      setAtlasSelectedManualRectIndex(next.length - 1);
      return next;
    });
  }

  function commitDragRect(target: ManualTarget) {
    if (!dragRect || dragRect.width <= 1 || dragRect.height <= 1) return;
    addManualRect(target);
    setAtlasManualDraft(DEFAULT_MANUAL_RECT);
  }

  function onSlicerPointerDown(event: ReactPointerEvent<HTMLDivElement>, target: ManualTarget) {
    if (!selectedSourceImage || state.editor.slicerMode !== "manual" || spaceHeld) return;
    const point = getImagePoint(event, atlasCanvasRef.current, selectedSourceImage, state.editor.slicerZoom);
    if (!point) return;
    if (slicerCanvasTool === "move" && atlasSelectedManualRectIndex !== null) {
      const selectedRect = atlasManualRects[atlasSelectedManualRectIndex];
      if (selectedRect && pointInRect(point.x, point.y, selectedRect)) {
        setMoveStart(point);
        setMoveOrigin(selectedRect);
        return;
      }
    }
    setAtlasSelectedManualRectIndex(null);
    setSlicerDragStart(point);
    setDragRect({ x: point.x, y: point.y, width: 1, height: 1 });
  }

  function onSlicerPointerMove(event: ReactPointerEvent<HTMLDivElement>, target: ManualTarget) {
    if (!selectedSourceImage || state.editor.slicerMode !== "manual") return;
    const point = getImagePoint(event, atlasCanvasRef.current, selectedSourceImage, state.editor.slicerZoom);
    if (!point) return;
    if (moveStart && moveOrigin && atlasSelectedManualRectIndex !== null) {
      const nextX = clamp(moveOrigin.x + (point.x - moveStart.x), 0, selectedSourceImage.width - moveOrigin.width);
      const nextY = clamp(moveOrigin.y + (point.y - moveStart.y), 0, selectedSourceImage.height - moveOrigin.height);
      updateManualRect(atlasSelectedManualRectIndex, { x: nextX, y: nextY });
      setAtlasManualDraft((current) => ({ ...current, x: nextX, y: nextY }));
      return;
    }
    if (!slicerDragStart) return;
    const nextRect = normalizeRect(slicerDragStart.x, slicerDragStart.y, point.x, point.y);
    setDragRect(nextRect);
    setAtlasManualDraft((current) => ({
      ...current,
      x: nextRect.x,
      y: nextRect.y,
      width: nextRect.width,
      height: nextRect.height,
    }));
  }

  function onSlicerPointerUp(target: ManualTarget) {
    if (moveStart) {
      setMoveStart(null);
      setMoveOrigin(null);
      return;
    }
    commitDragRect(target);
    setSlicerDragStart(null);
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
    if (index === null) return;
    const rect = atlasManualRects[index];
    if (rect) setAtlasManualDraft(rect);
  }

  function handlePackWheelZoom(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const nextZoom = clamp(packZoom * Math.exp(-event.deltaY * 0.0025), 0.25, 8);
    const bounds = event.currentTarget.getBoundingClientRect();
    const style = window.getComputedStyle(event.currentTarget);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const pointerX = event.clientX - bounds.left - paddingLeft;
    const pointerY = event.clientY - bounds.top - paddingTop;
    const worldX = (pointerX - packPan.x) / packZoom;
    const worldY = (pointerY - packPan.y) / packZoom;
    setPackPan({ x: pointerX - worldX * nextZoom, y: pointerY - worldY * nextZoom });
    setPackZoom(nextZoom);
  }

  function handlePackPanStart(event: ReactPointerEvent<HTMLDivElement>) {
    packPanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startPanX: packPan.x,
      startPanY: packPan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePackPanMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!packPanRef.current) return;
    setPackPan({
      x: packPanRef.current.startPanX + (event.clientX - packPanRef.current.startX),
      y: packPanRef.current.startPanY + (event.clientY - packPanRef.current.startY),
    });
  }

  function handlePackPanEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!packPanRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    packPanRef.current = null;
  }

  async function createAtlasSlices() {
    if (!selectedSourceImage) return;
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
      setAtlasManualRects([]);
      setAtlasManualDraft(DEFAULT_MANUAL_RECT);
      setAtlasSelectedManualRectIndex(null);
    } else {
      const result = await createGridSlices(selectedSourceImage, atlasGridOptions, state.project.idCounters.slice);
      if (fullSourceSliceIds.length) {
        dispatch({ type: "removeSlicesFromAtlas", sliceIds: fullSourceSliceIds });
      }
      dispatch({ type: "addSlices", slices: result.slices });
    }
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

  return {
    atlas,
    atlasCanvasRef,
    atlasStageRef,
    atlasPackStageRef,
    packPan,
    packZoom,
    draggedSpriteIndex,
    setDraggedSpriteIndex,
    atlasModule,
    setAtlasModule,
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
    updateManualRect,
    removeManualRect,
    selectManualRect,
    onSlicerPointerDown,
    onSlicerPointerMove,
    onSlicerPointerUp,
    handlePackWheelZoom,
    handlePackPanStart,
    handlePackPanMove,
    handlePackPanEnd,
    createAtlasSlices,
    addSelectedSlicesToAtlas,
    addSelectedSlicesToLevel,
  };
}
