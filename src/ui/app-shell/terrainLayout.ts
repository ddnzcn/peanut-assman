import { getTileIdFromGrid, type TileGridLookup } from "./tileGrid";

export const CARDINAL_MASKS: Record<string, number> = {
  "00_00": 10,
  "00_01": 14,
  "00_02": 6,
  "00_03": 2,
  "01_00": 11,
  "01_01": 15,
  "01_02": 7,
  "01_03": 3,
  "02_00": 9,
  "02_01": 13,
  "02_02": 5,
  "02_03": 1,
  "03_00": 8,
  "03_01": 12,
  "03_02": 4,
  "03_03": 0,
};

export const SUBTILE_STATES = {
  OUTER_CORNER: 0,
  HORIZONTAL_EDGE: 1,
  VERTICAL_EDGE: 2,
  INNER_CORNER: 3,
  FILL: 4,
};

export const BLOB47_MAPPING: Record<number, number> = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  11: 11,
  12: 12,
  13: 13,
  14: 14,
  15: 15,
  16: 16,
  17: 17,
  18: 18,
  19: 19,
  20: 20,
  21: 21,
  22: 22,
  23: 23,
  24: 24,
  25: 25,
  26: 26,
  27: 27,
  28: 28,
  29: 29,
  30: 30,
  31: 31,
  32: 32,
  33: 33,
  34: 34,
  35: 35,
  36: 36,
  37: 37,
  38: 38,
  39: 39,
  40: 40,
  41: 41,
  42: 42,
  43: 43,
  44: 44,
  45: 45,
  46: 46,
};

const SUBTILE_QUADRANTS = ["TL", "TR", "BL", "BR"] as const;
const SUBTILE_STATE_LABELS = ["Outer", "Horiz", "Vert", "Inner", "Fill"] as const;
export const CARDINAL_LAYOUT_MASKS = [10, 14, 6, 2, 11, 15, 7, 3, 9, 13, 5, 1, 8, 12, 4, 0] as const;
const RPGMAKER_SUBTILE_COORDS: Record<number, { row: number; column: number }> = {
  0: { row: 4, column: 2 },
  1: { row: 2, column: 2 },
  2: { row: 4, column: 0 },
  3: { row: 2, column: 0 },
  4: { row: 0, column: 2 },
  5: { row: 4, column: 1 },
  6: { row: 2, column: 1 },
  7: { row: 4, column: 3 },
  8: { row: 2, column: 3 },
  9: { row: 0, column: 3 },
  10: { row: 3, column: 2 },
  11: { row: 5, column: 2 },
  12: { row: 3, column: 0 },
  13: { row: 5, column: 0 },
  14: { row: 1, column: 2 },
  15: { row: 3, column: 1 },
  16: { row: 5, column: 1 },
  17: { row: 3, column: 3 },
  18: { row: 5, column: 3 },
  19: { row: 1, column: 3 },
};

export const BLOB47_LAYOUT_SLOTS = Array.from({ length: 47 }, (_, slot) => ({
  slot,
  row: Math.floor(slot / 8),
  column: slot % 8,
}));

export function buildCardinalAutoAssignSlots(
  lookup: TileGridLookup,
  startRow: number,
  startColumn: number,
): Record<number, number> {
  const slots: Record<number, number> = {};
  Object.entries(CARDINAL_MASKS).forEach(([key, mask]) => {
    const [rowOffset, columnOffset] = key.split("_").map(Number);
    const tileId = getTileIdFromGrid(lookup, startRow, startColumn, rowOffset, columnOffset);
    if (tileId) {
      slots[mask] = tileId;
    }
  });
  return slots;
}

export function getCardinalMaskLabel(mask: number): string {
  return {
    10: "Top Left",
    14: "Top",
    6: "Top Right",
    2: "Top End",
    11: "Left",
    15: "Center",
    7: "Right",
    3: "Column",
    9: "Bot Left",
    13: "Bottom",
    5: "Bot Right",
    1: "Bot End",
    8: "Left End",
    12: "Row",
    4: "Right End",
    0: "Isolated",
  }[mask] ?? "•";
}

export function getSubtileSlotLabel(slot: number): string {
  const quadrant = SUBTILE_QUADRANTS[Math.floor(slot / 5)];
  const state = SUBTILE_STATE_LABELS[slot % 5];
  return `${quadrant} ${state}`;
}

export function getSubtileLayoutSlots() {
  return Object.entries(RPGMAKER_SUBTILE_COORDS)
    .map(([slot, position]) => ({
      slot: Number(slot),
      row: position.row,
      column: position.column,
    }))
    .sort((left, right) => left.row - right.row || left.column - right.column);
}

export function buildRpgMakerAutoAssignSlots(
  lookup: TileGridLookup,
  startRow: number,
  startColumn: number,
): Record<number, number> {
  const slots: Record<number, number> = {};
  Object.entries(RPGMAKER_SUBTILE_COORDS).forEach(([slotKey, position]) => {
    const tileId = getTileIdFromGrid(lookup, startRow, startColumn, position.row, position.column);
    if (tileId) {
      slots[Number(slotKey)] = tileId;
    }
  });
  return slots;
}

export function buildBlob47AutoAssignSlots(
  lookup: TileGridLookup,
  startRow: number,
  startColumn: number,
): Record<number, number> {
  const slots: Record<number, number> = {};
  let blobIndex = 0;
  for (let rowOffset = 0; rowOffset < 6; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < 8; columnOffset += 1) {
      if (blobIndex >= 47) {
        return slots;
      }
      const tileId = getTileIdFromGrid(lookup, startRow, startColumn, rowOffset, columnOffset);
      if (tileId) {
        slots[blobIndex] = tileId;
      }
      blobIndex += 1;
    }
  }
  return slots;
}
