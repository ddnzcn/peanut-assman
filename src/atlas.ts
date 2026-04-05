import type {
  AtlasPageResult,
  AtlasPlacement,
  BuildOptions,
  ImportSprite,
  PackedAtlas,
  PreparedSprite,
} from "./types";
import { align, crc32 } from "./utils";

const MAGIC = 0x54443241;
const VERSION_MAJOR = 1;
const VERSION_MINOR = 1;

const HEADER_SIZE = 56;
const PAGE_SIZE = 30;
const SPRITE_SIZE = 40;
const ANIM_SIZE = 12;
const FRAME_SIZE = 8;
const ANIM_TILE_SIZE = 8;
const ANIM_TILE_FRAME_SIZE = 8;
const HASH_SIZE = 8;

export interface RuntimeAnimData {
  nameHash: number;
  loop: boolean;
  frames: Array<{ spriteIndex: number; durationMs: number }>;
}

export interface RuntimeAnimTileData {
  baseSpriteIndex: number;
  frames: Array<{ spriteIndex: number; durationMs: number }>;
}
const POT_CANDIDATES = [64, 128, 256, 512, 1024] as const;
const PAGE_COUNT_PENALTY = 1_000_000;
const ASPECT_PENALTY_SCALE = 1_000;

interface ShelfState {
  x: number;
  y: number;
  height: number;
}

interface WorkingPage {
  index: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  placements: AtlasPlacement[];
  shelf: ShelfState;
}

interface PlacementDraft {
  frameX: number;
  frameY: number;
  shelf: ShelfState;
}

interface PageCandidate {
  width: number;
  height: number;
}

interface CandidateDebugEntry {
  width: number;
  height: number;
  pageCount: number;
  wasteArea: number;
  aspectPenalty: number;
  score: number;
}

interface PackingCandidateResult {
  candidate: PageCandidate;
  pages: WorkingPage[];
  pageCount: number;
  wasteArea: number;
  aspectPenalty: number;
  score: number;
  debugEntry: CandidateDebugEntry;
}

export function buildAtlas(
  imports: ImportSprite[],
  options: BuildOptions,
  animations: RuntimeAnimData[] = [],
  animTiles: RuntimeAnimTileData[] = [],
): PackedAtlas {
  const prepared = imports.map((sprite) => prepareSprite(sprite, options));

  const { pages, candidateDebug, chosenCandidate } = selectBestPacking(
    prepared,
    options,
  );
  const renderedPages = pages.map(renderPage);
  const placements = renderedPages.flatMap((page) => page.placements);
  const atlasBin = buildAtlasBin(renderedPages);
  const { meta, debug } = buildMetadata(
    renderedPages,
    placements,
    atlasBin,
    options,
    candidateDebug,
    chosenCandidate,
    animations,
    animTiles,
  );

  for (const candidate of candidateDebug) {
    console.debug(
      `[atlas] candidate ${candidate.width}x${candidate.height} pages=${candidate.pageCount} waste=${candidate.wasteArea} score=${candidate.score}`,
    );
  }
  console.debug(
    `[atlas] chosen ${chosenCandidate.width}x${chosenCandidate.height} pages=${chosenCandidate.pageCount} waste=${chosenCandidate.wasteArea} score=${chosenCandidate.score}`,
  );

  return {
    pages: renderedPages,
    placements,
    atlasBin,
    atlasMetaBin: meta,
    atlasDebugJson: debug,
  };
}

function prepareSprite(
  sprite: ImportSprite,
  options: BuildOptions,
): PreparedSprite {
  const contentWidth = sprite.trimmedWidth;
  const contentHeight = sprite.trimmedHeight;
  const frameWidth = contentWidth + options.extrusion * 2;
  const frameHeight = contentHeight + options.extrusion * 2;
  const packedWidth = frameWidth + options.padding * 2;
  const packedHeight = frameHeight + options.padding * 2;

  if (packedWidth > options.maxPageSize || packedHeight > options.maxPageSize) {
    throw new Error(
      `Sprite ${sprite.fileName} exceeds the configured page size.`,
    );
  }

  return {
    ...sprite,
    rotated: false,
    frameWidth,
    frameHeight,
    packedWidth,
    packedHeight,
    contentWidth,
    contentHeight,
  };
}

function selectBestPacking(
  sprites: PreparedSprite[],
  options: BuildOptions,
): {
  pages: WorkingPage[];
  candidateDebug: CandidateDebugEntry[];
  chosenCandidate: CandidateDebugEntry;
} {
  const candidates = generatePageCandidates(sprites, options);
  const results: PackingCandidateResult[] = [];

  for (const candidate of candidates) {
    const result = packSpritesForCandidate(sprites, options, candidate);
    if (result) {
      results.push(result);
    }
  }

  if (results.length === 0) {
    throw new Error(
      "No valid power-of-two page size could pack the current sprite set.",
    );
  }

  results.sort(compareCandidateResults);
  const best = results[0];

  return {
    pages: best.pages,
    candidateDebug: results.map((result) => result.debugEntry),
    chosenCandidate: best.debugEntry,
  };
}

function generatePageCandidates(
  sprites: PreparedSprite[],
  options: BuildOptions,
): PageCandidate[] {
  const candidates: PageCandidate[] = [];

  for (const width of POT_CANDIDATES) {
    if (width > options.maxPageSize) {
      continue;
    }
    for (const height of POT_CANDIDATES) {
      if (height > options.maxPageSize) {
        continue;
      }

      const canFitEverySprite = sprites.every((sprite) => {
        const normalFits =
          sprite.packedWidth <= width && sprite.packedHeight <= height;
        const rotatedFits =
          options.allowRotation &&
          sprite.packedHeight <= width &&
          sprite.packedWidth <= height;
        return normalFits || rotatedFits;
      });

      if (canFitEverySprite) {
        candidates.push({ width, height });
      }
    }
  }

  return candidates.sort((left, right) => {
    if (left.width !== right.width) {
      return left.width - right.width;
    }
    return left.height - right.height;
  });
}

function packSpritesForCandidate(
  sprites: PreparedSprite[],
  options: BuildOptions,
  candidate: PageCandidate,
): PackingCandidateResult | null {
  const pages: WorkingPage[] = [];
  let packedArea = 0;

  for (const sprite of sprites) {
    let placed = false;

    for (const page of pages) {
      if (tryPlaceOnPage(page, sprite, options)) {
        packedArea += sprite.packedWidth * sprite.packedHeight;
        placed = true;
        break;
      }

      if (options.allowRotation) {
        const rotated = rotateSprite(sprite);
        if (tryPlaceOnPage(page, rotated, options)) {
          packedArea += rotated.packedWidth * rotated.packedHeight;
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      const page = createWorkingPage(
        pages.length,
        candidate.width,
        candidate.height,
      );

      if (tryPlaceOnPage(page, sprite, options)) {
        packedArea += sprite.packedWidth * sprite.packedHeight;
        pages.push(page);
        continue;
      }

      if (options.allowRotation) {
        const rotated = rotateSprite(sprite);
        if (tryPlaceOnPage(page, rotated, options)) {
          packedArea += rotated.packedWidth * rotated.packedHeight;
          pages.push(page);
          continue;
        }
      }

      return null;
    }
  }

  const pageCount = pages.length;
  const totalPageArea = pageCount * candidate.width * candidate.height;
  const wasteArea = totalPageArea - packedArea;
  const aspectPenalty = Math.abs(
    Math.log2(candidate.width) - Math.log2(candidate.height),
  );

  // Score priority:
  // 1. Heavily punish extra pages.
  // 2. Prefer less unused area.
  // 3. Mildly bias toward square pages so 256x256 beats 64x512 when the
  //    page count and waste are otherwise similar.
  const score =
    pageCount * PAGE_COUNT_PENALTY +
    wasteArea +
    aspectPenalty * ASPECT_PENALTY_SCALE;

  return {
    candidate,
    pages,
    pageCount,
    wasteArea,
    aspectPenalty,
    score,
    debugEntry: {
      width: candidate.width,
      height: candidate.height,
      pageCount,
      wasteArea,
      aspectPenalty,
      score,
    },
  };
}

function compareCandidateResults(
  left: PackingCandidateResult,
  right: PackingCandidateResult,
): number {
  if (left.score !== right.score) {
    return left.score - right.score;
  }
  if (left.pageCount !== right.pageCount) {
    return left.pageCount - right.pageCount;
  }
  if (left.wasteArea !== right.wasteArea) {
    return left.wasteArea - right.wasteArea;
  }
  if (left.aspectPenalty !== right.aspectPenalty) {
    return left.aspectPenalty - right.aspectPenalty;
  }
  if (left.candidate.width !== right.candidate.width) {
    return left.candidate.width - right.candidate.width;
  }
  return left.candidate.height - right.candidate.height;
}

function rotateSprite(sprite: PreparedSprite): PreparedSprite {
  return {
    ...sprite,
    rotated: true,
    packedWidth: sprite.packedHeight,
    packedHeight: sprite.packedWidth,
    frameWidth: sprite.frameHeight,
    frameHeight: sprite.frameWidth,
    contentWidth: sprite.trimmedHeight,
    contentHeight: sprite.trimmedWidth,
  };
}

function createWorkingPage(
  index: number,
  width: number,
  height: number,
): WorkingPage {
  return {
    index,
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4),
    placements: [],
    shelf: { x: 0, y: 0, height: 0 },
  };
}

function tryPlaceOnPage(
  page: WorkingPage,
  sprite: PreparedSprite,
  options: BuildOptions,
): boolean {
  const draft = draftPlacement(page, sprite, options);
  if (!draft) {
    return false;
  }

  page.shelf = draft.shelf;

  const placement: AtlasPlacement = {
    sprite,
    pageIndex: page.index,
    frameX: draft.frameX,
    frameY: draft.frameY,
  };

  page.placements.push(placement);
  drawSpriteIntoPage(page, placement, options);
  return true;
}

function draftPlacement(
  page: WorkingPage,
  sprite: PreparedSprite,
  options: BuildOptions,
): PlacementDraft | null {
  if (sprite.packedWidth > page.width || sprite.packedHeight > page.height) {
    return null;
  }

  let shelf = { ...page.shelf };

  if (shelf.x + sprite.packedWidth > page.width) {
    shelf = {
      x: 0,
      y: shelf.y + shelf.height,
      height: 0,
    };
  }

  if (shelf.y + sprite.packedHeight > page.height) {
    return null;
  }

  return {
    frameX: shelf.x + options.padding,
    frameY: shelf.y + options.padding,
    shelf: {
      x: shelf.x + sprite.packedWidth,
      y: shelf.y,
      height: Math.max(shelf.height, sprite.packedHeight),
    },
  };
}

function drawSpriteIntoPage(
  page: WorkingPage,
  placement: AtlasPlacement,
  options: BuildOptions,
): void {
  const { sprite, frameX, frameY } = placement;
  const left = frameX + options.extrusion;
  const top = frameY + options.extrusion;
  const source = sprite.bitmap.data;
  const srcWidth = sprite.trimmedWidth;
  const srcHeight = sprite.trimmedHeight;

  for (let y = 0; y < srcHeight; y += 1) {
    for (let x = 0; x < srcWidth; x += 1) {
      const sourceIndex = (y * srcWidth + x) * 4;
      const targetX = sprite.rotated ? left + y : left + x;
      const targetY = sprite.rotated ? top + (srcWidth - 1 - x) : top + y;
      writePixel(
        page.pixels,
        page.width,
        targetX,
        targetY,
        source,
        sourceIndex,
      );
    }
  }

  extrudeEdges(page, placement, options);
}

function extrudeEdges(
  page: WorkingPage,
  placement: AtlasPlacement,
  options: BuildOptions,
): void {
  const { sprite, frameX, frameY } = placement;
  const innerX = frameX + options.extrusion;
  const innerY = frameY + options.extrusion;
  const contentWidth = sprite.rotated
    ? sprite.trimmedHeight
    : sprite.trimmedWidth;
  const contentHeight = sprite.rotated
    ? sprite.trimmedWidth
    : sprite.trimmedHeight;
  const outerLeft = innerX - options.extrusion;
  const outerTop = innerY - options.extrusion;
  const outerRight = innerX + contentWidth - 1;
  const outerBottom = innerY + contentHeight - 1;

  for (let step = 1; step <= options.extrusion; step += 1) {
    for (let x = 0; x < contentWidth; x += 1) {
      copyPixel(
        page.pixels,
        page.width,
        innerX + x,
        innerY,
        innerX + x,
        outerTop + options.extrusion - step,
      );
      copyPixel(
        page.pixels,
        page.width,
        innerX + x,
        outerBottom,
        innerX + x,
        outerBottom + step,
      );
    }
    for (let y = 0; y < contentHeight; y += 1) {
      copyPixel(
        page.pixels,
        page.width,
        innerX,
        innerY + y,
        outerLeft + options.extrusion - step,
        innerY + y,
      );
      copyPixel(
        page.pixels,
        page.width,
        outerRight,
        innerY + y,
        outerRight + step,
        innerY + y,
      );
    }
  }

  for (let stepY = 1; stepY <= options.extrusion; stepY += 1) {
    for (let stepX = 1; stepX <= options.extrusion; stepX += 1) {
      copyPixel(
        page.pixels,
        page.width,
        innerX,
        innerY,
        outerLeft + options.extrusion - stepX,
        outerTop + options.extrusion - stepY,
      );
      copyPixel(
        page.pixels,
        page.width,
        outerRight,
        innerY,
        outerRight + stepX,
        outerTop + options.extrusion - stepY,
      );
      copyPixel(
        page.pixels,
        page.width,
        innerX,
        outerBottom,
        outerLeft + options.extrusion - stepX,
        outerBottom + stepY,
      );
      copyPixel(
        page.pixels,
        page.width,
        outerRight,
        outerBottom,
        outerRight + stepX,
        outerBottom + stepY,
      );
    }
  }
}

function writePixel(
  target: Uint8ClampedArray,
  targetWidth: number,
  x: number,
  y: number,
  source: Uint8ClampedArray,
  sourceIndex: number,
): void {
  const targetIndex = (y * targetWidth + x) * 4;
  target[targetIndex] = source[sourceIndex];
  target[targetIndex + 1] = source[sourceIndex + 1];
  target[targetIndex + 2] = source[sourceIndex + 2];
  target[targetIndex + 3] = source[sourceIndex + 3];
}

function copyPixel(
  target: Uint8ClampedArray,
  width: number,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): void {
  const sourceIndex = (sourceY * width + sourceX) * 4;
  const targetIndex = (targetY * width + targetX) * 4;
  target[targetIndex] = target[sourceIndex];
  target[targetIndex + 1] = target[sourceIndex + 1];
  target[targetIndex + 2] = target[sourceIndex + 2];
  target[targetIndex + 3] = target[sourceIndex + 3];
}

function renderPage(
  page: WorkingPage,
): AtlasPageResult & { placements: AtlasPlacement[] } {
  const canvas = document.createElement("canvas");
  canvas.width = page.width;
  canvas.height = page.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create canvas context.");
  }

  context.putImageData(
    new ImageData(new Uint8ClampedArray(page.pixels), page.width, page.height),
    0,
    0,
  );

  const dataUrl = canvas.toDataURL("image/png");
  const blob = dataUrlToBlob(dataUrl);

  return {
    index: page.index,
    width: page.width,
    height: page.height,
    data: page.pixels,
    blobUrl: URL.createObjectURL(blob),
    blob,
    placements: page.placements,
  };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const type = /data:(.*);base64/.exec(header)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

function buildAtlasBin(pages: AtlasPageResult[]): Uint8Array {
  const size = pages.reduce((sum, page) => sum + page.data.length, 0);
  const output = new Uint8Array(size);
  let cursor = 0;

  for (const page of pages) {
    const converted = convertImageDataToPS2CT32(page.data, page.width, page.height);
    output.set(converted, cursor);
    cursor += page.data.length;
  }

  return output;
}

function convertImageDataToPS2CT32(
  source: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const output = new Uint8Array(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    let r = source[index * 4 + 0];
    let g = source[index * 4 + 1];
    let b = source[index * 4 + 2];
    const a = source[index * 4 + 3];

    if (a === 0) {
      r = 0;
      g = 0;
      b = 0;
    }

    const offset = index * 4;
    writePixelPS2(output, offset, r, g, b, a);
  }

  return output;
}

function toPs2Alpha(a: number): number {
  // Map 0..255 -> 0..128
  return (a * 128 + 127) >> 8;
}

function writePixelPS2(
  out: Uint8Array,
  offset: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const ps2a = toPs2Alpha(a);

  // Keep raw bytes in RGBA order for little-endian 32-bit upload.
  out[offset + 0] = r & 0xff;
  out[offset + 1] = g & 0xff;
  out[offset + 2] = b & 0xff;
  out[offset + 3] = ps2a & 0xff;
}

function buildMetadata(
  pages: AtlasPageResult[],
  placements: AtlasPlacement[],
  atlasBin: Uint8Array,
  options: BuildOptions,
  candidateDebug: CandidateDebugEntry[],
  chosenCandidate: CandidateDebugEntry,
  animations: RuntimeAnimData[] = [],
  animTiles: RuntimeAnimTileData[] = [],
): { meta: Uint8Array; debug: string } {
  const sortedPlacements = [...placements].sort(
    (left, right) => left.sprite.id - right.sprite.id,
  );
  const hashEntries = options.includeHashTable
    ? [...sortedPlacements]
        .map((placement, index) => ({
          nameHash: placement.sprite.nameHash,
          spriteIndex: index,
        }))
        .sort((left, right) => left.nameHash - right.nameHash)
    : [];

  const payloadCrc32 = crc32(atlasBin);
  const pageTableOffset = align(HEADER_SIZE, 4);
  const spriteTableOffset = align(pageTableOffset + pages.length * PAGE_SIZE, 4);
  const totalFrameCount = animations.reduce((sum, a) => sum + a.frames.length, 0);
  const animTableOffset = align(
    spriteTableOffset + sortedPlacements.length * SPRITE_SIZE,
    4,
  );
  const frameTableOffset = align(animTableOffset + animations.length * ANIM_SIZE, 4);
  const endOfFrameTable = frameTableOffset + totalFrameCount * FRAME_SIZE;
  const totalAnimTileFrameCount = animTiles.reduce((sum, t) => sum + t.frames.length, 0);
  const animTileTableOffset =
    animTiles.length > 0 ? align(endOfFrameTable, 4) : 0;
  const animTileFrameTableOffset =
    animTiles.length > 0
      ? align(animTileTableOffset + animTiles.length * ANIM_TILE_SIZE, 4)
      : 0;
  const endOfAnimTileFrameTable =
    animTiles.length > 0
      ? animTileFrameTableOffset + totalAnimTileFrameCount * ANIM_TILE_FRAME_SIZE
      : endOfFrameTable;
  const hashTableOffset =
    hashEntries.length > 0 ? align(endOfAnimTileFrameTable, 4) : 0;
  const fileSize = align(
    hashEntries.length > 0
      ? hashTableOffset + hashEntries.length * HASH_SIZE
      : endOfAnimTileFrameTable,
    4,
  );
  const meta = new Uint8Array(fileSize);
  const view = new DataView(meta.buffer);

  let atlasDataOffset = 0;
  pages.forEach((page, index) => {
    const offset = pageTableOffset + index * PAGE_SIZE;
    view.setUint32(offset + 0, atlasDataOffset, true);
    view.setUint32(offset + 4, page.data.length, true);
    view.setUint16(offset + 8, page.width, true);
    view.setUint16(offset + 10, page.height, true);
    view.setUint8(offset + 12, 0);
    view.setUint8(offset + 13, 0);
    view.setUint16(offset + 14, 0, true);
    view.setUint16(offset + 16, Math.ceil(page.width / 64), true);
    view.setUint16(offset + 18, 0, true);
    view.setUint32(offset + 20, 0, true);
    view.setUint32(offset + 24, 0, true);
    atlasDataOffset += page.data.length;
  });

  sortedPlacements.forEach((placement, index) => {
    const offset = spriteTableOffset + index * SPRITE_SIZE;
    const x = placement.frameX + options.extrusion;
    const y = placement.frameY + options.extrusion;
    const flags = placement.sprite.rotated ? 1 : 0;

    view.setUint32(offset + 0, placement.sprite.id, true);
    view.setUint32(offset + 4, placement.sprite.nameHash, true);
    view.setUint16(offset + 8, placement.pageIndex, true);
    view.setUint16(offset + 10, flags, true);
    view.setUint16(offset + 12, x, true);
    view.setUint16(offset + 14, y, true);
    view.setUint16(offset + 16, placement.sprite.trimmedWidth, true);
    view.setUint16(offset + 18, placement.sprite.trimmedHeight, true);
    view.setInt16(offset + 20, placement.sprite.pivotX, true);
    view.setInt16(offset + 22, placement.sprite.pivotY, true);
    view.setUint16(offset + 24, placement.sprite.sourceWidth, true);
    view.setUint16(offset + 26, placement.sprite.sourceHeight, true);
    view.setInt16(offset + 28, placement.sprite.trimX, true);
    view.setInt16(offset + 30, placement.sprite.trimY, true);
    view.setInt16(offset + 32, 0, true);
    view.setInt16(offset + 34, 0, true);
    view.setUint16(offset + 36, placement.sprite.sourceWidth, true);
    view.setUint16(offset + 38, placement.sprite.sourceHeight, true);
  });

  let firstFrameIndex = 0;
  animations.forEach((anim, index) => {
    const offset = animTableOffset + index * ANIM_SIZE;
    const flags = anim.loop ? 1 : 0;
    const clampedFirst = Math.min(firstFrameIndex, 0xffff);
    view.setUint32(offset + 0, anim.nameHash, true);
    view.setUint16(offset + 4, clampedFirst, true);
    view.setUint16(offset + 6, anim.frames.length, true);
    view.setUint16(offset + 8, flags, true);
    view.setUint16(offset + 10, 0, true);
    firstFrameIndex += anim.frames.length;
  });

  let frameWriteIndex = 0;
  animations.forEach((anim) => {
    anim.frames.forEach((frame) => {
      const offset = frameTableOffset + frameWriteIndex * FRAME_SIZE;
      const clampedDuration = Math.min(frame.durationMs, 0xffff);
      view.setUint32(offset + 0, frame.spriteIndex, true);
      view.setUint16(offset + 4, clampedDuration, true);
      view.setUint16(offset + 6, 0, true);
      frameWriteIndex += 1;
    });
  });

  let animTileFirstFrame = 0;
  animTiles.forEach((animTile, index) => {
    const offset = animTileTableOffset + index * ANIM_TILE_SIZE;
    view.setUint32(offset + 0, animTile.baseSpriteIndex, true);
    view.setUint16(offset + 4, Math.min(animTileFirstFrame, 0xffff), true);
    view.setUint16(offset + 6, Math.min(animTile.frames.length, 0xffff), true);
    animTileFirstFrame += animTile.frames.length;
  });

  let animTileFrameWriteIndex = 0;
  animTiles.forEach((animTile) => {
    animTile.frames.forEach((frame) => {
      const offset = animTileFrameTableOffset + animTileFrameWriteIndex * ANIM_TILE_FRAME_SIZE;
      view.setUint32(offset + 0, frame.spriteIndex, true);
      view.setUint16(offset + 4, Math.min(frame.durationMs, 0xffff), true);
      view.setUint16(offset + 6, 0, true);
      animTileFrameWriteIndex += 1;
    });
  });

  hashEntries.forEach((entry, index) => {
    const offset = hashTableOffset + index * HASH_SIZE;
    view.setUint32(offset + 0, entry.nameHash, true);
    view.setUint32(offset + 4, entry.spriteIndex, true);
  });

  view.setUint32(0, MAGIC, true);
  view.setUint16(4, VERSION_MAJOR, true);
  view.setUint16(6, VERSION_MINOR, true);
  view.setUint32(8, meta.length, true);
  view.setUint32(12, payloadCrc32, true);
  view.setUint16(16, pages.length, true);
  view.setUint16(18, sortedPlacements.length, true);
  view.setUint16(20, animations.length, true);
  view.setUint16(22, options.includeHashTable ? 1 : 0, true);
  view.setUint32(24, pageTableOffset, true);
  view.setUint32(28, spriteTableOffset, true);
  view.setUint32(32, animTableOffset, true);
  view.setUint32(36, frameTableOffset, true);
  view.setUint32(40, hashTableOffset, true);
  view.setUint16(44, animTiles.length, true);
  view.setUint16(46, 0, true); // reserved0
  view.setUint32(48, animTileTableOffset, true);
  view.setUint32(52, animTileFrameTableOffset, true);

  const debug = JSON.stringify(
    {
      header: {
        magic: "A2DT",
        versionMajor: VERSION_MAJOR,
        versionMinor: VERSION_MINOR,
        pageCount: pages.length,
        spriteCount: sortedPlacements.length,
        crc32: payloadCrc32,
      },
      packingSearch: {
        chosen: chosenCandidate,
        candidates: candidateDebug,
      },
      pages: pages.map((page, index) => ({
        index,
        width: page.width,
        height: page.height,
        dataOffset: pages
          .slice(0, index)
          .reduce((sum, current) => sum + current.data.length, 0),
        dataSize: page.data.length,
      })),
      sprites: sortedPlacements.map((placement) => ({
        id: placement.sprite.id,
        fileName: placement.sprite.fileName,
        nameHash: placement.sprite.nameHash,
        pageIndex: placement.pageIndex,
        rotated: placement.sprite.rotated,
        x: placement.frameX + options.extrusion,
        y: placement.frameY + options.extrusion,
        w: placement.sprite.trimmedWidth,
        h: placement.sprite.trimmedHeight,
        sourceW: placement.sprite.sourceWidth,
        sourceH: placement.sprite.sourceHeight,
        trimX: placement.sprite.trimX,
        trimY: placement.sprite.trimY,
        pivotX: placement.sprite.pivotX,
        pivotY: placement.sprite.pivotY,
      })),
      hashTable: hashEntries,
    },
    null,
    2,
  );

  return { meta, debug };
}
