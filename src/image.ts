import type {
  GridSliceOptions,
  ManualSliceRect,
  SheetSlicePreview,
  SliceAsset,
  SliceRect,
  SourceImageAsset,
  SpriteAsset,
} from "./types";
import { fileNameBase, fnv1a32 } from "./utils";

export async function fileToSourceImageAsset(file: File, id: string): Promise<SourceImageAsset> {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await decodeImageData(dataUrl);
  return {
    id,
    fileName: file.name,
    dataUrl,
    width: image.width,
    height: image.height,
  };
}

export async function decodeImageData(dataUrl: string): Promise<ImageData> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Unable to decode image.");
  }
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function previewGridSlices(image: SourceImageAsset, options: GridSliceOptions): SheetSlicePreview[] {
  return generateGridRects(image.width, image.height, options);
}

export async function createGridSlices(
  source: SourceImageAsset,
  options: GridSliceOptions,
  startSliceNumber: number,
): Promise<{ slices: SliceAsset[] }> {
  if (options.frameWidth <= 0 || options.frameHeight <= 0) {
    throw new Error("Frame width and height must be greater than zero.");
  }
  const image = await decodeImageData(source.dataUrl);
  const previews = generateGridRects(source.width, source.height, options, fileNameBase(source.fileName));
  const filteredPreviews = previews.filter((preview) => {
    const frame = cropImageData(image, preview.rect.x, preview.rect.y, preview.rect.width, preview.rect.height);
    return options.keepEmpty || !isTransparent(frame);
  });
  if (!filteredPreviews.length) {
    throw new Error("No sprites were produced from the current slicer settings.");
  }
  return { slices: materializeSlices(source, image, filteredPreviews, startSliceNumber) };
}

export async function createManualSlices(
  source: SourceImageAsset,
  rects: ManualSliceRect[],
  kind: GridSliceOptions["sliceKind"],
  startSliceNumber: number,
): Promise<{ slices: SliceAsset[] }> {
  if (!rects.length) {
    throw new Error("Add at least one manual slice rect.");
  }
  const image = await decodeImageData(source.dataUrl);
  const previews = rects.map((rect, index) => ({
    name: rect.name.trim() || `${fileNameBase(source.fileName)}_${String(index).padStart(2, "0")}`,
    kind,
    rect,
  }));
  previews.forEach((preview, index) => {
    if (preview.rect.width <= 0 || preview.rect.height <= 0) {
      throw new Error(`Manual slice ${index + 1} has invalid size.`);
    }
    if (preview.rect.x < 0 || preview.rect.y < 0) {
      throw new Error(`Manual slice ${index + 1} has negative coordinates.`);
    }
    if (
      preview.rect.x + preview.rect.width > source.width ||
      preview.rect.y + preview.rect.height > source.height
    ) {
      throw new Error(`Manual slice ${index + 1} exceeds the source sheet bounds.`);
    }
  });
  return { slices: materializeSlices(source, image, previews, startSliceNumber) };
}

export async function createSourceSlicesFromImages(
  sources: SourceImageAsset[],
  startSliceNumber: number,
  startSpriteId: number,
): Promise<{ slices: SliceAsset[]; sprites: SpriteAsset[] }> {
  const slices: SliceAsset[] = [];
  const sprites: SpriteAsset[] = [];
  let nextSliceNumber = startSliceNumber;
  let nextSpriteId = startSpriteId;

  for (const source of sources) {
    const image = await decodeImageData(source.dataUrl);
    const nextSlices = materializeSlices(
      source,
      image,
      [
        {
          name: fileNameBase(source.fileName),
          kind: "sprite",
          rect: { x: 0, y: 0, width: source.width, height: source.height },
        },
      ],
      nextSliceNumber,
    );
    const nextSprites = nextSlices.map((slice, index) => {
      const name = `${slice.name}.png`;
      return {
        id: nextSpriteId + index,
        sliceId: slice.id,
        name,
        nameHash: fnv1a32(name),
        includeInAtlas: true,
      };
    });
    slices.push(...nextSlices);
    sprites.push(...nextSprites);
    nextSliceNumber += nextSlices.length;
    nextSpriteId += nextSprites.length;
  }

  return { slices, sprites };
}

function generateGridRects(
  width: number,
  height: number,
  options: GridSliceOptions,
  defaultPrefix = "slice",
): SheetSlicePreview[] {
  if (options.frameWidth <= 0 || options.frameHeight <= 0) {
    return [];
  }
  const previews: SheetSlicePreview[] = [];
  const pitchX = options.frameWidth + options.spacingX;
  const pitchY = options.frameHeight + options.spacingY;
  const limitX = Math.max(options.marginX, width - options.endOffsetX);
  const limitY = Math.max(options.marginY, height - options.endOffsetY);
  const prefix = options.namePrefix.trim() || defaultPrefix;

  for (let y = options.marginY, row = 0; y + options.frameHeight <= limitY; y += pitchY, row += 1) {
    for (let x = options.marginX, column = 0; x + options.frameWidth <= limitX; x += pitchX, column += 1) {
      previews.push({
        name: `${prefix}_${String(row).padStart(2, "0")}_${String(column).padStart(2, "0")}`,
        kind: options.sliceKind,
        rect: { x, y, width: options.frameWidth, height: options.frameHeight },
      });
    }
  }

  return previews;
}

function materializeSlices(
  source: SourceImageAsset,
  image: ImageData,
  previews: SheetSlicePreview[],
  startSliceNumber: number,
): SliceAsset[] {
  const slices: SliceAsset[] = [];

  previews.forEach((preview, index) => {
    const sourceRect = preview.rect;
    const frame = cropImageData(image, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height);
    const bounds = findOpaqueBounds(frame);
    const trimmedRect: SliceRect = {
      x: sourceRect.x + bounds.x,
      y: sourceRect.y + bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    const sliceId = `slice-${startSliceNumber + index}`;
    const slice: SliceAsset = {
      id: sliceId,
      sourceImageId: source.id,
      name: preview.name,
      kind: preview.kind,
      sourceRect,
      trimmedRect,
      sourceWidth: sourceRect.width,
      sourceHeight: sourceRect.height,
      pivotX: Math.floor(sourceRect.width / 2),
      pivotY: Math.floor(sourceRect.height / 2),
    };
    slices.push(slice);
  });

  return slices;
}

function cropImageData(
  image: ImageData,
  x: number,
  y: number,
  width: number,
  height: number,
): ImageData {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const srcStart = ((y + row) * image.width + x) * 4;
    output.set(image.data.subarray(srcStart, srcStart + width * 4), row * width * 4);
  }
  return new ImageData(output, width, height);
}

function isTransparent(image: ImageData): boolean {
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index] !== 0) {
      return false;
    }
  }
  return true;
}

function findOpaqueBounds(image: ImageData): SliceRect {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX === -1 || maxY === -1) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}
