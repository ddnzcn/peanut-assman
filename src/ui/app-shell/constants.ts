import type { GridSliceOptions, ManualSliceRect } from "../../types";

export const DEFAULT_TILESET_GRID: GridSliceOptions = {
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

export const DEFAULT_ATLAS_GRID: GridSliceOptions = {
  ...DEFAULT_TILESET_GRID,
  namePrefix: "sprite",
  sliceKind: "both",
};

export const DEFAULT_MANUAL_RECT: ManualSliceRect = {
  x: 0,
  y: 0,
  width: 32,
  height: 32,
  name: "",
};

export type SlicerCanvasTool = "draw" | "move";
