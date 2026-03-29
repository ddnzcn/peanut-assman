import type { TilesetTileAsset } from "../../types";

const TILE_NAME_GRID_PATTERN = /_(\d+)_(\d+)(?:\.\w+)?$/;

export type TileGridLookup = Map<string, number>;

function makeTileGridKey(row: number, column: number): string {
  return `${row}:${column}`;
}

export function parseTileGridPosition(tileName: string): { row: number; column: number } | null {
  const match = tileName.match(TILE_NAME_GRID_PATTERN);
  if (!match) {
    return null;
  }
  return {
    row: parseInt(match[1], 10),
    column: parseInt(match[2], 10),
  };
}

export function buildTileGridLookup(tiles: TilesetTileAsset[]): TileGridLookup {
  const lookup: TileGridLookup = new Map();
  tiles.forEach((tile) => {
    const position = parseTileGridPosition(tile.name);
    if (!position) {
      return;
    }
    lookup.set(makeTileGridKey(position.row, position.column), tile.tileId);
  });
  return lookup;
}

export function getTileIdFromGrid(
  lookup: TileGridLookup,
  startRow: number,
  startColumn: number,
  rowOffset: number,
  columnOffset: number,
): number {
  return lookup.get(makeTileGridKey(startRow + rowOffset, startColumn + columnOffset)) || 0;
}
