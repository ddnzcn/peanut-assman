import type { ImportSprite, ManualSliceRect, SheetSliceOptions } from "./types";

export async function decodeSprite(file: File): Promise<ImportSprite> {
  const image = await decodeFileImage(file);
  return createImportSprite(file.name, image);
}

export async function sliceSpriteSheet(
  file: File,
  options: SheetSliceOptions,
): Promise<ImportSprite[]> {
  if (options.frameWidth <= 0 || options.frameHeight <= 0) {
    throw new Error("Frame width and height must be greater than zero.");
  }

  const sheet = await decodeFileImage(file);
  const sprites: ImportSprite[] = [];
  const baseName = stripExtension(file.name);
  const pitchX = options.frameWidth + options.spacingX;
  const pitchY = options.frameHeight + options.spacingY;
  const limitX = Math.max(options.marginX, sheet.width - options.endOffsetX);
  const limitY = Math.max(options.marginY, sheet.height - options.endOffsetY);

  for (
    let sourceY = options.marginY, row = 0;
    sourceY + options.frameHeight <= limitY;
    sourceY += pitchY, row += 1
  ) {
    for (
      let sourceX = options.marginX, column = 0;
      sourceX + options.frameWidth <= limitX;
      sourceX += pitchX, column += 1
    ) {
      const frame = cropImageData(sheet, sourceX, sourceY, options.frameWidth, options.frameHeight);
      const isEmpty = isTransparent(frame);
      if (isEmpty && !options.keepEmpty) {
        continue;
      }

      const prefix = options.namePrefix.trim() || baseName;
      const name = `${prefix}_${String(row).padStart(2, "0")}_${String(column).padStart(2, "0")}.png`;
      sprites.push(createImportSprite(name, frame));
    }
  }

  if (sprites.length === 0) {
    throw new Error("No sprites were produced from the current slicer settings.");
  }

  return sprites;
}

export async function sliceSpriteSheetManual(
  file: File,
  rects: ManualSliceRect[],
): Promise<ImportSprite[]> {
  if (!rects.length) {
    throw new Error("Add at least one manual slice rect.");
  }

  const sheet = await decodeFileImage(file);
  const baseName = stripExtension(file.name);

  return rects.map((rect, index) => {
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Manual slice ${index + 1} has invalid size.`);
    }
    if (rect.x < 0 || rect.y < 0) {
      throw new Error(`Manual slice ${index + 1} has negative coordinates.`);
    }
    if (rect.x + rect.width > sheet.width || rect.y + rect.height > sheet.height) {
      throw new Error(`Manual slice ${index + 1} exceeds the source sheet bounds.`);
    }

    const frame = cropImageData(sheet, rect.x, rect.y, rect.width, rect.height);
    const name = rect.name.trim() || `${baseName}_${String(index).padStart(2, "0")}.png`;
    return createImportSprite(name.endsWith(".png") ? name : `${name}.png`, frame);
  });
}

async function decodeFileImage(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error(`Unable to decode ${file.name}.`);
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.close();
  return image;
}

function createImportSprite(fileName: string, image: ImageData): ImportSprite {
  const bounds = findOpaqueBounds(image);
  const trimmed = cropImageData(image, bounds.x, bounds.y, bounds.width, bounds.height);

  return {
    fileName,
    sourceWidth: image.width,
    sourceHeight: image.height,
    trimmedWidth: trimmed.width,
    trimmedHeight: trimmed.height,
    trimX: bounds.x,
    trimY: bounds.y,
    pivotX: Math.floor(image.width / 2),
    pivotY: Math.floor(image.height / 2),
    bitmap: trimmed,
  };
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
    const srcEnd = srcStart + width * 4;
    output.set(image.data.subarray(srcStart, srcEnd), row * width * 4);
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

function stripExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
}

function findOpaqueBounds(image: ImageData): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
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

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}
