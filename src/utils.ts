import type { PotSize } from "./types";

const POT_SIZES: PotSize[] = [64, 128, 256, 512, 1024];

export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function isPowerOfTwo(value: number): value is PotSize {
  return POT_SIZES.includes(value as PotSize);
}

export function clampToPot(value: number, max: PotSize): PotSize {
  for (const candidate of POT_SIZES) {
    if (candidate >= value) {
      return candidate > max ? max : candidate;
    }
  }
  return max;
}

export function align(value: number, alignment: number): number {
  const remainder = value % alignment;
  return remainder === 0 ? value : value + alignment - remainder;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function toDataView(buffer: ArrayBuffer | Uint8Array): DataView {
  if (buffer instanceof Uint8Array) {
    return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  return new DataView(buffer);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}
