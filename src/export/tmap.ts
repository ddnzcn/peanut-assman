import type { CollisionObject, LevelDocument, ProjectDocument } from "../types";
import { buildRuntimeSpriteCatalog, resolveRuntimeSpriteIdForCell } from "./runtimeSprites";
import { align, crc32, fnv1a32, packFixed88 } from "../utils";

const TILEMAP_MAGIC = 0x50414d54;
const HEADER_SIZE = 72;
const TILESET_DEF_SIZE = 28;
const TILESET_REMAP_ENTRY_SIZE = 4;
const LAYER_DEF_SIZE = 50;
const CHUNK_DEF_SIZE = 22;
const TILE_ENTRY_SIZE = 8;
const COLLISION_SIZE = 28;
const MARKER_SIZE = 44;
const STRING_ENTRY_SIZE = 8;
const STRING_NONE = 0xffffffff;

export async function exportTilemapBin(project: ProjectDocument, level: LevelDocument): Promise<Uint8Array> {
  const exportState = await buildExportState(project, level);
  const fileSize =
    exportState.stringDataOffset +
    exportState.stringBlob.length;
  const bytes = new Uint8Array(fileSize);
  const view = new DataView(bytes.buffer);

  writeHeader(view, exportState, fileSize);
  writeTilesets(view, exportState);
  writeLayers(view, exportState);
  writeChunks(view, exportState);
  writeChunkTileData(view, exportState);
  writeCollisions(view, exportState);
  writeMarkers(view, exportState);
  writeStrings(view, exportState);
  bytes.set(exportState.stringBlob, exportState.stringDataOffset);

  view.setUint32(8, bytes.length, true);
  view.setUint32(12, 0, true);
  view.setUint32(12, crc32(bytes), true);
  return bytes;
}

export async function exportLevelDebugJson(project: ProjectDocument, level: LevelDocument): Promise<string> {
  const exportState = await buildExportState(project, level);
  return JSON.stringify(
    {
      header: {
        magic: "TMAP",
        mapWidthTiles: level.mapWidthTiles,
        mapHeightTiles: level.mapHeightTiles,
        tileWidth: level.tileWidth,
        tileHeight: level.tileHeight,
        chunkWidthTiles: level.chunkWidthTiles,
        chunkHeightTiles: level.chunkHeightTiles,
      },
      tilesets: exportState.tilesets,
      layers: exportState.layers,
      chunks: exportState.chunkDefs,
      collisions: exportState.collisions,
      markers: exportState.markers,
      strings: exportState.stringList,
    },
    null,
    2,
  );
}

type ExportState = Awaited<ReturnType<typeof buildExportState>>;

async function buildExportState(project: ProjectDocument, level: LevelDocument) {
  const catalog = await buildRuntimeSpriteCatalog(project);
  const chunkTileCapacity = level.chunkWidthTiles * level.chunkHeightTiles;
  const exportTiles: Array<{ key: string; spriteId: number }> = [];
  const exportTileIdByKey = new Map<string, number>();
  const registerExportTile = (key: string, spriteId: number) => {
    const existing = exportTileIdByKey.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const exportTileId = exportTiles.length + 1;
    exportTileIdByKey.set(key, exportTileId);
    exportTiles.push({ key, spriteId });
    return exportTileId;
  };

  const layerChunkCounts = new Map<string, number>();
  const chunkDefs: Array<{
    layerIndex: number;
    chunkX: number;
    chunkY: number;
    flags: number;
    tileDataOffset: number;
    tileCount: number;
    usedTileCount: number;
    tiles: { tileId: number; flags: number }[];
  }> = [];
  let tileDataCursor = 0;
  level.layers.forEach((layer, layerIndex) => {
    const chunks = Object.values(level.chunks)
      .filter((chunk) => chunk.layerId === layer.id)
      .sort((left, right) => left.chunkY - right.chunkY || left.chunkX - right.chunkX);
    layerChunkCounts.set(layer.id, chunks.length);
    chunks.forEach((chunk) => {
      const normalizedTiles = Array.from({ length: chunkTileCapacity }, (_, tileIndex) => (
        chunk.tiles[tileIndex] ?? { tileId: 0, flags: 0 }
      ));
      const remappedTiles = normalizedTiles.map((tile, tileIndex) => {
        if (tile.tileId === 0) {
          return tile;
        }
        const tileX = chunk.chunkX * level.chunkWidthTiles + (tileIndex % level.chunkWidthTiles);
        const tileY = chunk.chunkY * level.chunkHeightTiles + Math.floor(tileIndex / level.chunkWidthTiles);
        const resolved = resolveRuntimeSpriteIdForCell(project, catalog, level, layer, tileX, tileY);
        if (!resolved) {
          throw new Error(
            `Level "${level.name}" uses tile ${tile.tileId} in layer "${layer.name}" but it cannot be resolved for runtime export.`,
          );
        }
        const exportTileId = registerExportTile(resolved.exportKey, resolved.spriteId);
        return { ...tile, tileId: exportTileId };
      });
      const usedTileCount = remappedTiles.filter((tile) => tile.tileId !== 0).length;
      chunkDefs.push({
        layerIndex,
        chunkX: chunk.chunkX,
        chunkY: chunk.chunkY,
        flags: 0,
        tileDataOffset: tileDataCursor,
        tileCount: chunkTileCapacity,
        usedTileCount,
        tiles: remappedTiles,
      });
      tileDataCursor += chunkTileCapacity * TILE_ENTRY_SIZE;
    });
  });

  let chunkCursor = 0;
  let collisionCursor = 0;
  let markerCursor = 0;
  const orderedCollisions: CollisionObject[] = [];
  const layers = level.layers.map((layer, layerIndex) => {
    const chunkCount = layerChunkCounts.get(layer.id) ?? 0;
    const collisions = level.collisions.filter((entry) => entry.layerId === layer.id);
    const markersForLayer = level.markers.filter((entry) => entry.layerId === layer.id);
    orderedCollisions.push(...collisions);
    const output = {
      layerId: numericId(layer.id),
      nameHash: fnv1a32(layer.name),
      flags:
        (layer.visible ? 1 : 0) |
        (layer.locked ? 2 : 0) |
        (layer.repeatX ? 4 : 0) |
        (layer.repeatY ? 8 : 0) |
        (layer.foreground ? 16 : 0) |
        (layer.hasTiles ? 32 : 0) |
        (layer.hasCollision ? 64 : 0) |
        (layer.hasMarkers ? 128 : 0),
      drawOrder: layerIndex,
      parallaxX: packFixed88(layer.parallaxX),
      parallaxY: packFixed88(layer.parallaxY),
      offsetX: layer.offsetX,
      offsetY: layer.offsetY,
      widthTiles: layer.widthTiles,
      heightTiles: layer.heightTiles,
      chunkCols: Math.ceil(level.mapWidthTiles / level.chunkWidthTiles),
      chunkRows: Math.ceil(level.mapHeightTiles / level.chunkHeightTiles),
      firstChunkIndex: chunkCursor,
      chunkCount,
      firstCollisionIndex: collisionCursor,
      collisionCount: collisions.length,
      firstMarkerIndex: markerCursor,
      markerCount: markersForLayer.length,
    };
    chunkCursor += chunkCount;
    collisionCursor += collisions.length;
    markerCursor += markersForLayer.length;
    return output;
  });

  const stringList: string[] = [];
  const stringIndex = new Map<string, number>();
  const orderedMarkers = level.layers.flatMap((layer) => level.markers.filter((entry) => entry.layerId === layer.id));
  const markers = orderedMarkers.map((marker) => ({
    markerId: marker.id,
    shape: marker.shape === "Point" ? 0 : 1,
    flags: marker.flags,
    x: marker.x,
    y: marker.y,
    w: marker.w,
    h: marker.h,
    typeStringIndex: indexString(marker.type, stringList, stringIndex),
    eventStringIndex: indexString(marker.event, stringList, stringIndex),
    nameStringIndex: indexString(marker.name, stringList, stringIndex),
    userData0: marker.userData0,
    userData1: marker.userData1,
  }));

  const encoder = new TextEncoder();
  const stringEntries: Array<{ offset: number; length: number }> = [];
  const stringParts: number[] = [];
  stringList.forEach((value) => {
    const bytes = encoder.encode(value);
    stringEntries.push({ offset: stringParts.length, length: bytes.length });
    stringParts.push(...bytes, 0);
  });
  const stringBlob = new Uint8Array(stringParts);

  const resolvedTilesets = exportTiles.length
    ? [{
        id: 1,
        nameHash: fnv1a32(`${level.name}_tiles`),
        firstTileId: 1,
        tileCount: exportTiles.length,
        tileWidth: level.tileWidth,
        tileHeight: level.tileHeight,
        columns: Math.max(1, Math.min(exportTiles.length, Math.max(1, Math.ceil(Math.sqrt(exportTiles.length))))),
        flags: 0,
        spriteIds: exportTiles.map((tile) => tile.spriteId),
      }]
    : [];

  const tilesetTableOffset = HEADER_SIZE;
  const tilesetRemapTableOffset = align(
    tilesetTableOffset + resolvedTilesets.length * TILESET_DEF_SIZE,
    4,
  );
  const tilesetRemapTableSize = resolvedTilesets.reduce(
    (sum, tileset) => sum + tileset.spriteIds.length * TILESET_REMAP_ENTRY_SIZE,
    0,
  );
  const layerTableOffset = align(tilesetRemapTableOffset + tilesetRemapTableSize, 4);
  const chunkTableOffset = align(layerTableOffset + layers.length * LAYER_DEF_SIZE, 4);
  const chunkDataOffset = align(chunkTableOffset + chunkDefs.length * CHUNK_DEF_SIZE, 4);
  const collisionTableOffset = align(chunkDataOffset + tileDataCursor, 4);
  const markerTableOffset = align(collisionTableOffset + orderedCollisions.length * COLLISION_SIZE, 4);
  const stringTableOffset = align(markerTableOffset + markers.length * MARKER_SIZE, 4);
  const stringDataOffset = align(stringTableOffset + stringEntries.length * STRING_ENTRY_SIZE, 4);

  return {
    level,
    tilesets: resolvedTilesets,
    exportTiles,
    layers,
    chunkDefs,
    collisions: orderedCollisions,
    markers,
    stringEntries,
    stringList,
    stringBlob,
    tilesetTableOffset,
    tilesetRemapTableOffset,
    layerTableOffset,
    chunkTableOffset,
    chunkDataOffset,
    collisionTableOffset,
    markerTableOffset,
    stringTableOffset,
    stringDataOffset,
  };
}

function writeHeader(view: DataView, state: ExportState, fileSize: number) {
  view.setUint32(0, TILEMAP_MAGIC, true);
  view.setUint16(4, 2, true);
  view.setUint16(6, 1, true);
  view.setUint32(8, fileSize, true);
  view.setUint32(12, 0, true);
  view.setUint16(16, state.level.mapWidthTiles, true);
  view.setUint16(18, state.level.mapHeightTiles, true);
  view.setUint16(20, state.level.tileWidth, true);
  view.setUint16(22, state.level.tileHeight, true);
  view.setUint16(24, state.level.chunkWidthTiles, true);
  view.setUint16(26, state.level.chunkHeightTiles, true);
  view.setUint16(28, state.tilesets.length, true);
  view.setUint16(30, state.layers.length, true);
  view.setUint16(32, state.chunkDefs.length, true);
  view.setUint16(34, state.collisions.length, true);
  view.setUint16(36, state.markers.length, true);
  view.setUint16(38, state.stringEntries.length, true);
  view.setUint32(40, state.tilesetTableOffset, true);
  view.setUint32(44, state.layerTableOffset, true);
  view.setUint32(48, state.chunkTableOffset, true);
  view.setUint32(52, state.chunkDataOffset, true);
  view.setUint32(56, state.collisionTableOffset, true);
  view.setUint32(60, state.markerTableOffset, true);
  view.setUint32(64, state.stringTableOffset, true);
  view.setUint32(68, state.stringDataOffset, true);
}

function writeTilesets(view: DataView, state: ExportState) {
  let remapCursor = state.tilesetRemapTableOffset;
  state.tilesets.forEach((tileset, index) => {
    const offset = state.tilesetTableOffset + index * TILESET_DEF_SIZE;
    view.setUint32(offset + 0, tileset.id, true);
    view.setUint32(offset + 4, tileset.nameHash, true);
    view.setUint32(offset + 8, tileset.firstTileId, true);
    view.setUint32(offset + 12, tileset.tileCount, true);
    view.setUint32(offset + 16, remapCursor, true);
    view.setUint16(offset + 20, tileset.tileWidth, true);
    view.setUint16(offset + 22, tileset.tileHeight, true);
    view.setUint16(offset + 24, tileset.columns, true);
    view.setUint16(offset + 26, tileset.flags, true);
    tileset.spriteIds.forEach((spriteId, spriteIndex) => {
      view.setUint32(
        remapCursor + spriteIndex * TILESET_REMAP_ENTRY_SIZE,
        spriteId,
        true,
      );
    });
    remapCursor += tileset.spriteIds.length * TILESET_REMAP_ENTRY_SIZE;
  });
}

function writeLayers(view: DataView, state: ExportState) {
  state.layers.forEach((layer, index) => {
    const offset = state.layerTableOffset + index * LAYER_DEF_SIZE;
    view.setUint32(offset + 0, layer.layerId, true);
    view.setUint32(offset + 4, layer.nameHash, true);
    view.setUint16(offset + 8, layer.flags, true);
    view.setUint16(offset + 10, layer.drawOrder, true);
    view.setInt16(offset + 12, layer.parallaxX, true);
    view.setInt16(offset + 14, layer.parallaxY, true);
    view.setInt16(offset + 16, layer.offsetX, true);
    view.setInt16(offset + 18, layer.offsetY, true);
    view.setUint16(offset + 20, layer.widthTiles, true);
    view.setUint16(offset + 22, layer.heightTiles, true);
    view.setUint16(offset + 24, layer.chunkCols, true);
    view.setUint16(offset + 26, layer.chunkRows, true);
    view.setUint32(offset + 28, layer.firstChunkIndex, true);
    view.setUint32(offset + 32, layer.chunkCount, true);
    view.setUint32(offset + 36, layer.firstCollisionIndex, true);
    view.setUint16(offset + 40, layer.collisionCount, true);
    view.setUint32(offset + 42, layer.firstMarkerIndex, true);
    view.setUint16(offset + 46, layer.markerCount, true);
    view.setUint16(offset + 48, 0, true);
  });
}

function writeChunks(view: DataView, state: ExportState) {
  state.chunkDefs.forEach((chunk, index) => {
    const offset = state.chunkTableOffset + index * CHUNK_DEF_SIZE;
    view.setUint16(offset + 0, chunk.layerIndex, true);
    view.setUint16(offset + 2, chunk.chunkX, true);
    view.setUint16(offset + 4, chunk.chunkY, true);
    view.setUint16(offset + 6, chunk.flags, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint32(offset + 10, chunk.tileDataOffset, true);
    view.setUint32(offset + 14, chunk.tileCount, true);
    view.setUint16(offset + 18, chunk.usedTileCount, true);
    view.setUint16(offset + 20, 0, true);
  });
}

function writeChunkTileData(view: DataView, state: ExportState) {
  state.chunkDefs.forEach((chunk) => {
    chunk.tiles.forEach((tile, index) => {
      const offset = state.chunkDataOffset + chunk.tileDataOffset + index * TILE_ENTRY_SIZE;
      view.setUint32(offset + 0, tile.tileId, true);
      view.setUint8(offset + 4, tile.flags);
      view.setUint8(offset + 5, 0);
      view.setUint16(offset + 6, 0, true);
    });
  });
}

function writeCollisions(view: DataView, state: ExportState) {
  state.collisions.forEach((collision, index) => {
    const offset = state.collisionTableOffset + index * COLLISION_SIZE;
    view.setUint16(offset + 0, collisionTypeValue(collision), true);
    view.setUint16(offset + 2, collision.flags, true);
    view.setInt32(offset + 4, collision.x, true);
    view.setInt32(offset + 8, collision.y, true);
    view.setInt32(offset + 12, collision.w, true);
    view.setInt32(offset + 16, collision.h, true);
    view.setUint32(offset + 20, collision.userData0, true);
    view.setUint32(offset + 24, collision.userData1, true);
  });
}

function writeMarkers(view: DataView, state: ExportState) {
  state.markers.forEach((marker, index) => {
    const offset = state.markerTableOffset + index * MARKER_SIZE;
    view.setUint32(offset + 0, marker.markerId, true);
    view.setUint16(offset + 4, marker.shape, true);
    view.setUint16(offset + 6, marker.flags, true);
    view.setInt32(offset + 8, marker.x, true);
    view.setInt32(offset + 12, marker.y, true);
    view.setInt32(offset + 16, marker.w, true);
    view.setInt32(offset + 20, marker.h, true);
    view.setUint32(offset + 24, marker.typeStringIndex, true);
    view.setUint32(offset + 28, marker.eventStringIndex, true);
    view.setUint32(offset + 32, marker.nameStringIndex, true);
    view.setUint32(offset + 36, marker.userData0, true);
    view.setUint32(offset + 40, marker.userData1, true);
  });
}

function writeStrings(view: DataView, state: ExportState) {
  state.stringEntries.forEach((entry, index) => {
    const offset = state.stringTableOffset + index * STRING_ENTRY_SIZE;
    view.setUint32(offset + 0, entry.offset, true);
    view.setUint32(offset + 4, entry.length, true);
  });
}

function indexString(value: string, list: string[], map: Map<string, number>) {
  if (!value) {
    return STRING_NONE;
  }
  const existing = map.get(value);
  if (existing !== undefined) {
    return existing;
  }
  const index = list.length;
  list.push(value);
  map.set(value, index);
  return index;
}

function collisionTypeValue(collision: CollisionObject) {
  if (collision.type === "OneWay") return 1;
  if (collision.type === "Trigger") return 2;
  if (collision.type === "Hurt") return 3;
  return 0;
}

function numericId(value: string) {
  const match = value.match(/(\d+)$/);
  return match ? Number(match[1]) : fnv1a32(value);
}
