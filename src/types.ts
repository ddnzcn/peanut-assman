export type PotSize = 64 | 128 | 256 | 512 | 1024;

export interface ImportSprite {
  fileName: string;
  sourceWidth: number;
  sourceHeight: number;
  trimmedWidth: number;
  trimmedHeight: number;
  trimX: number;
  trimY: number;
  pivotX: number;
  pivotY: number;
  bitmap: ImageData;
}

export interface PreparedSprite extends ImportSprite {
  id: number;
  nameHash: number;
  rotated: boolean;
  frameWidth: number;
  frameHeight: number;
  packedWidth: number;
  packedHeight: number;
  contentWidth: number;
  contentHeight: number;
}

export interface AtlasPlacement {
  sprite: PreparedSprite;
  pageIndex: number;
  frameX: number;
  frameY: number;
}

export interface AtlasPageResult {
  index: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  blobUrl: string;
  blob: Blob;
}

export interface PackedAtlas {
  pages: AtlasPageResult[];
  placements: AtlasPlacement[];
  atlasBin: Uint8Array;
  atlasMetaBin: Uint8Array;
  atlasDebugJson: string;
}

export interface BuildOptions {
  maxPageSize: PotSize;
  allowRotation: boolean;
  padding: number;
  extrusion: number;
  includeHashTable: boolean;
  includeDebugJson: boolean;
}

export interface SheetSliceOptions {
  frameWidth: number;
  frameHeight: number;
  spacingX: number;
  spacingY: number;
  marginX: number;
  marginY: number;
  endOffsetX: number;
  endOffsetY: number;
  keepEmpty: boolean;
  namePrefix: string;
}

export interface ManualSliceRect {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
}
