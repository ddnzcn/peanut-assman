import type { ProjectDocument, SceneDocument, SceneNode, TileMapNodeData } from "../types";
import { buildRuntimeSpriteCatalog, resolveRuntimeSpriteIdForCell } from "./runtimeSprites";
import { align, crc32, fnv1a32, packFixed88 } from "../utils";
import { flattenNodes } from "../scene/helpers";

const PSCN_MAGIC = 0x4e435350;
const HEADER_SIZE = 64;
const NODE_BASE_SIZE = 64;
const TILEMAP_EXT_SIZE = 24;
const SPRITE_EXT_SIZE = 12;
const COLLISION_EXT_SIZE = 16;
const AREA_EXT_SIZE = 16;
const LIGHT_EXT_SIZE = 20;
// AnimatedSprite ext is variable: 12 + 4 * animCount (aligned to 4)
const TILESET_DEF_SIZE = 28;
const TILESET_REMAP_ENTRY_SIZE = 4;
const CHUNK_DEF_SIZE = 20;
const TILE_ENTRY_SIZE = 8;
const STRING_ENTRY_SIZE = 8;
const STRING_NONE = 0xffffffff;

const NODE_TYPE_MAP: Record<string, number> = {
  Root: 0, Node2D: 1, Sprite: 2, TileMap: 3,
  CollisionShape: 4, Area: 5, Light2D: 6, AnimatedSprite: 7,
};

export async function exportSceneBin(project: ProjectDocument, scene: SceneDocument): Promise<Uint8Array> {
  const state = await buildExportState(project, scene);
  const fileSize = state.stringDataOffset + state.stringBlob.length;
  const bytes = new Uint8Array(fileSize);
  const view = new DataView(bytes.buffer);

  writeHeader(view, state, fileSize);
  writeNodes(view, state);
  writeTilesets(view, state);
  writeChunks(view, state);
  writeChunkTileData(view, state);
  writeStrings(view, state);
  bytes.set(state.stringBlob, state.stringDataOffset);

  view.setUint32(8, bytes.length, true);
  view.setUint32(12, 0, true);
  view.setUint32(12, crc32(bytes), true);
  return bytes;
}

const NODE_TYPE_NAMES: Record<number, string> = {
  0: "Root", 1: "Node2D", 2: "Sprite", 3: "TileMap", 4: "CollisionShape", 5: "Area", 6: "Light2D", 7: "AnimatedSprite",
};

export async function exportSceneDebugJson(project: ProjectDocument, scene: SceneDocument): Promise<string> {
  const state = await buildExportState(project, scene);
  const debugNodes = state.nodes.map(({ writeExt, ...rest }) => ({
    ...rest,
    nodeTypeName: NODE_TYPE_NAMES[rest.nodeType] ?? "Unknown",
  }));
  return JSON.stringify(
    {
      header: { magic: "PSCN", nodeCount: state.nodes.length },
      nodes: debugNodes,
      tilesets: state.tilesets,
      chunks: state.chunkDefs,
      strings: state.stringList,
    },
    null,
    2,
  );
}

type ExportState = Awaited<ReturnType<typeof buildExportState>>;

interface ExportNode {
  nodeId: number;
  parentIndex: number;
  nameHash: number;
  nodeType: number;
  flags: number;
  renderLayer: number;
  posX: number;
  posY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  childCount: number;
  firstChildIndex: number;
  scriptIdStringIndex: number;
  scriptDataStringIndex: number;
  collisionLayer: number;
  collisionMask: number;
  parallaxX: number;
  parallaxY: number;
  extSize: number;
  writeExt: (view: DataView, offset: number) => void;
}

async function buildExportState(project: ProjectDocument, scene: SceneDocument) {
  const catalog = await buildRuntimeSpriteCatalog(project);
  const allNodes = flattenNodes(scene.root);
  const nodeIndexById = new Map(allNodes.map((n, i) => [n.id, i]));

  const stringList: string[] = [];
  const stringIndex = new Map<string, number>();

  const exportTiles: Array<{ key: string; spriteId: number }> = [];
  const exportTileIdByKey = new Map<string, number>();
  const registerExportTile = (key: string, spriteId: number) => {
    const existing = exportTileIdByKey.get(key);
    if (existing !== undefined) return existing;
    const exportTileId = exportTiles.length + 1;
    exportTileIdByKey.set(key, exportTileId);
    exportTiles.push({ key, spriteId });
    return exportTileId;
  };

  const chunkDefs: Array<{
    nodeIndex: number;
    chunkX: number;
    chunkY: number;
    tileDataOffset: number;
    tileCount: number;
    usedTileCount: number;
    tiles: { tileId: number; flags: number }[];
  }> = [];
  let tileDataCursor = 0;

  const nodes: ExportNode[] = allNodes.map((node, index) => {
    const parentIdx = index === 0 ? -1 : ((): number => {
      for (let p = 0; p < allNodes.length; p++) {
        if (allNodes[p].children.some((c) => c.id === node.id)) return p;
      }
      return -1;
    })();

    const childIndices = node.children.map((c) => nodeIndexById.get(c.id) ?? -1);
    const firstChildIndex = childIndices.length ? childIndices[0] : 0;

    const scriptIdStr = node.scriptId || "";
    const scriptDataStr = Object.keys(node.scriptData).length ? JSON.stringify(node.scriptData) : "";

    let extSize = 0;
    let writeExt: (view: DataView, offset: number) => void = () => {};

    if (node.data.type === "TileMap") {
      extSize = TILEMAP_EXT_SIZE;
      const tm = node.data;
      const chunkTileCapacity = tm.chunkWidthTiles * tm.chunkHeightTiles;
      const nodeChunkStart = chunkDefs.length;

      const chunks = Object.values(tm.chunks)
        .sort((a, b) => a.chunkY - b.chunkY || a.chunkX - b.chunkX);

      for (const chunk of chunks) {
        const normalizedTiles = Array.from({ length: chunkTileCapacity }, (_, i) =>
          chunk.tiles[i] ?? { tileId: 0, flags: 0 },
        );
        const remappedTiles = normalizedTiles.map((tile, tileIndex) => {
          const tileX = chunk.chunkX * tm.chunkWidthTiles + (tileIndex % tm.chunkWidthTiles);
          const tileY = chunk.chunkY * tm.chunkHeightTiles + Math.floor(tileIndex / tm.chunkWidthTiles);
          if (tile.tileId === 0 || tileX >= tm.mapWidthTiles || tileY >= tm.mapHeightTiles) return { tileId: 0, flags: 0 };
          const resolved = resolveRuntimeSpriteIdForCell(project, catalog, tm, tileX, tileY);
          if (!resolved) return { tileId: 0, flags: 0 };
          const exportTileId = registerExportTile(resolved.exportKey, resolved.spriteId);
          return { ...tile, tileId: exportTileId };
        });
        const usedTileCount = remappedTiles.filter((t) => t.tileId !== 0).length;
        chunkDefs.push({
          nodeIndex: index,
          chunkX: chunk.chunkX,
          chunkY: chunk.chunkY,
          tileDataOffset: tileDataCursor,
          tileCount: chunkTileCapacity,
          usedTileCount,
          tiles: remappedTiles,
        });
        tileDataCursor += chunkTileCapacity * TILE_ENTRY_SIZE;
      }

      const chunkCount = chunkDefs.length - nodeChunkStart;
      writeExt = (v, o) => {
        v.setUint16(o, tm.tileWidth, true);
        v.setUint16(o + 2, tm.tileHeight, true);
        v.setUint16(o + 4, tm.chunkWidthTiles, true);
        v.setUint16(o + 6, tm.chunkHeightTiles, true);
        v.setUint16(o + 8, tm.mapWidthTiles, true);
        v.setUint16(o + 10, tm.mapHeightTiles, true);
        v.setUint8(o + 12, tm.projection === "isometric-diamond" ? 1 : tm.projection === "isometric-staggered" ? 2 : 0);
        v.setUint8(o + 13, 0);
        v.setUint16(o + 14, chunkCount, true);
        v.setUint32(o + 16, nodeChunkStart, true);
        v.setUint32(o + 20, 0, true);
      };
    } else if (node.data.type === "Sprite") {
      extSize = SPRITE_EXT_SIZE;
      const spriteBySliceId = new Map(project.sprites.map((s) => [s.sliceId, s]));
      const sprite = spriteBySliceId.get(node.data.sliceId);
      const spriteId = sprite?.id ?? 0;
      const d = node.data;
      writeExt = (v, o) => {
        v.setUint32(o, spriteId, true);
        v.setUint8(o + 4, d.flipH ? 1 : 0);
        v.setUint8(o + 5, d.flipV ? 1 : 0);
        v.setUint16(o + 6, 0, true);
        v.setUint32(o + 8, parseInt(d.tintColor.replace("#", ""), 16) >>> 0, true);
      };
    } else if (node.data.type === "CollisionShape") {
      extSize = COLLISION_EXT_SIZE;
      const d = node.data;
      writeExt = (v, o) => {
        v.setUint8(o, d.shape === "circle" ? 1 : d.shape === "polygon" ? 2 : 0);
        v.setUint8(o + 1, 0);
        v.setUint16(o + 2, 0, true);
        v.setInt32(o + 4, d.width, true);
        v.setInt32(o + 8, d.height, true);
        v.setInt32(o + 12, d.radius, true);
      };
    } else if (node.data.type === "Area") {
      extSize = AREA_EXT_SIZE;
      const d = node.data;
      writeExt = (v, o) => {
        v.setUint8(o, d.shape === "rect" ? 1 : 0);
        v.setUint8(o + 1, 0);
        v.setUint16(o + 2, 0, true);
        v.setInt32(o + 4, d.width, true);
        v.setInt32(o + 8, d.height, true);
        v.setUint32(o + 12, indexString(d.areaTag, stringList, stringIndex), true);
      };
    } else if (node.data.type === "Light2D") {
      extSize = LIGHT_EXT_SIZE;
      const d = node.data;
      writeExt = (v, o) => {
        v.setInt32(o, d.radius, true);
        v.setUint32(o + 4, parseInt(d.color.replace("#", ""), 16) >>> 0, true);
        v.setUint16(o + 8, packFixed88(d.intensity), true);
        v.setUint16(o + 10, packFixed88(d.falloff), true);
        v.setUint8(o + 12, d.variant === "directional" ? 1 : 0);
        v.setUint8(o + 13, 0);
        v.setInt16(o + 14, packFixed88(d.directionAngle ?? 0), true);
        v.setInt16(o + 16, packFixed88(d.coneAngle ?? 45), true);
        v.setInt16(o + 18, 0, true);
      };
    } else if (node.data.type === "AnimatedSprite") {
      const d = node.data;
      const resolvedAnims = d.spriteAnimationIds
        .map((id) => project.spriteAnimations.find((a) => a.id === id))
        .filter((a): a is NonNullable<typeof a> => !!a);
      const animCount = resolvedAnims.length;
      extSize = 12 + animCount * 4;
      const firstAnim = resolvedAnims[0];
      const firstFrameSliceId = firstAnim?.frames[0]?.sliceId;
      const firstSprite = firstFrameSliceId ? project.sprites.find((s) => s.sliceId === firstFrameSliceId) : undefined;
      const defaultSpriteId = firstSprite?.id ?? 0;
      writeExt = (v, o) => {
        v.setUint8(o, animCount);
        v.setUint8(o + 1, d.flipH ? 1 : 0);
        v.setUint8(o + 2, d.flipV ? 1 : 0);
        v.setUint8(o + 3, 0);
        v.setUint32(o + 4, parseInt(d.tintColor.replace("#", ""), 16) >>> 0, true);
        v.setUint32(o + 8, defaultSpriteId, true);
        for (let i = 0; i < animCount; i++) {
          v.setUint32(o + 12 + i * 4, resolvedAnims[i].nameHash, true);
        }
      };
    }

    return {
      nodeId: index,
      parentIndex: parentIdx,
      nameHash: fnv1a32(node.name),
      nodeType: NODE_TYPE_MAP[node.data.type] ?? 0,
      flags: (node.visible ? 1 : 0) | (node.locked ? 2 : 0),
      renderLayer: node.renderLayer,
      posX: Math.round(node.transform.x * 65536),
      posY: Math.round(node.transform.y * 65536),
      rotation: packFixed88(node.transform.rotation),
      scaleX: packFixed88(node.transform.scaleX),
      scaleY: packFixed88(node.transform.scaleY),
      childCount: node.children.length,
      firstChildIndex,
      scriptIdStringIndex: indexString(scriptIdStr, stringList, stringIndex),
      scriptDataStringIndex: indexString(scriptDataStr, stringList, stringIndex),
      collisionLayer: node.collisionLayer,
      collisionMask: node.collisionMask,
      parallaxX: packFixed88(node.parallaxX),
      parallaxY: packFixed88(node.parallaxY),
      extSize,
      writeExt,
    };
  });

  const resolvedTilesets = exportTiles.length
    ? [{
        id: 1,
        nameHash: fnv1a32(`${scene.name}_tiles`),
        firstTileId: 1,
        tileCount: exportTiles.length,
        tileWidth: 16,
        tileHeight: 16,
        columns: Math.max(1, Math.ceil(Math.sqrt(exportTiles.length))),
        flags: 0,
        spriteIds: exportTiles.map((t) => t.spriteId),
      }]
    : [];

  const encoder = new TextEncoder();
  const stringEntries: Array<{ offset: number; length: number }> = [];
  const stringParts: number[] = [];
  stringList.forEach((value) => {
    const bytes = encoder.encode(value);
    stringEntries.push({ offset: stringParts.length, length: bytes.length });
    stringParts.push(...bytes, 0);
  });
  const stringBlob = new Uint8Array(stringParts);

  const totalNodeSize = nodes.reduce((sum, n) => sum + NODE_BASE_SIZE + n.extSize, 0);
  const nodeTableOffset = HEADER_SIZE;
  const tilesetTableOffset = align(nodeTableOffset + totalNodeSize, 4);
  const tilesetRemapSize = resolvedTilesets.reduce((s, t) => s + t.spriteIds.length * TILESET_REMAP_ENTRY_SIZE, 0);
  const chunkTableOffset = align(tilesetTableOffset + resolvedTilesets.length * TILESET_DEF_SIZE + tilesetRemapSize, 4);
  const chunkDataOffset = align(chunkTableOffset + chunkDefs.length * CHUNK_DEF_SIZE, 4);
  const stringTableOffset = align(chunkDataOffset + tileDataCursor, 4);
  const stringDataOffset = align(stringTableOffset + stringEntries.length * STRING_ENTRY_SIZE, 4);

  return {
    scene,
    nodes,
    tilesets: resolvedTilesets,
    exportTiles,
    chunkDefs,
    stringEntries,
    stringList,
    stringBlob,
    nodeTableOffset,
    tilesetTableOffset,
    chunkTableOffset,
    chunkDataOffset,
    stringTableOffset,
    stringDataOffset,
    totalNodeSize,
    tilesetRemapSize,
  };
}

function writeHeader(view: DataView, state: ExportState, fileSize: number) {
  view.setUint32(0, PSCN_MAGIC, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  view.setUint32(8, fileSize, true);
  view.setUint32(12, 0, true);
  view.setUint16(16, state.nodes.length, true);
  view.setUint16(18, state.tilesets.length, true);
  view.setUint16(20, state.chunkDefs.length, true);
  view.setUint16(22, state.stringEntries.length, true);
  view.setUint32(24, state.nodeTableOffset, true);
  view.setUint32(28, state.tilesetTableOffset, true);
  view.setUint32(32, state.chunkTableOffset, true);
  view.setUint32(36, state.chunkDataOffset, true);
  view.setUint32(40, state.stringTableOffset, true);
  view.setUint32(44, state.stringDataOffset, true);
  // 48-63: reserved
}

function writeNodes(view: DataView, state: ExportState) {
  let cursor = state.nodeTableOffset;
  for (const node of state.nodes) {
    view.setUint32(cursor, node.nodeId, true);
    view.setInt32(cursor + 4, node.parentIndex, true);
    view.setUint32(cursor + 8, node.nameHash, true);
    view.setUint8(cursor + 12, node.nodeType);
    view.setUint8(cursor + 13, node.flags);
    view.setUint16(cursor + 14, node.renderLayer, true);
    view.setInt32(cursor + 16, node.posX, true);
    view.setInt32(cursor + 20, node.posY, true);
    view.setInt16(cursor + 24, node.rotation, true);
    view.setInt16(cursor + 26, node.scaleX, true);
    view.setInt16(cursor + 28, node.scaleY, true);
    view.setUint16(cursor + 30, node.childCount, true);
    view.setUint32(cursor + 32, node.firstChildIndex, true);
    view.setUint32(cursor + 36, node.scriptIdStringIndex, true);
    view.setUint32(cursor + 40, node.scriptDataStringIndex, true);
    view.setUint32(cursor + 44, node.collisionLayer, true);
    view.setUint32(cursor + 48, node.collisionMask, true);
    view.setInt16(cursor + 52, node.parallaxX, true);
    view.setInt16(cursor + 54, node.parallaxY, true);
    view.setUint16(cursor + 56, node.extSize, true);
    // 58-63: reserved
    node.writeExt(view, cursor + NODE_BASE_SIZE);
    cursor += NODE_BASE_SIZE + node.extSize;
  }
}

function writeTilesets(view: DataView, state: ExportState) {
  let remapCursor = state.tilesetTableOffset + state.tilesets.length * TILESET_DEF_SIZE;
  state.tilesets.forEach((tileset, index) => {
    const offset = state.tilesetTableOffset + index * TILESET_DEF_SIZE;
    view.setUint32(offset, tileset.id, true);
    view.setUint32(offset + 4, tileset.nameHash, true);
    view.setUint32(offset + 8, tileset.firstTileId, true);
    view.setUint32(offset + 12, tileset.tileCount, true);
    view.setUint32(offset + 16, remapCursor, true);
    view.setUint16(offset + 20, tileset.tileWidth, true);
    view.setUint16(offset + 22, tileset.tileHeight, true);
    view.setUint16(offset + 24, tileset.columns, true);
    view.setUint16(offset + 26, tileset.flags, true);
    tileset.spriteIds.forEach((spriteId, spriteIndex) => {
      view.setUint32(remapCursor + spriteIndex * TILESET_REMAP_ENTRY_SIZE, spriteId, true);
    });
    remapCursor += tileset.spriteIds.length * TILESET_REMAP_ENTRY_SIZE;
  });
}

function writeChunks(view: DataView, state: ExportState) {
  state.chunkDefs.forEach((chunk, index) => {
    const offset = state.chunkTableOffset + index * CHUNK_DEF_SIZE;
    view.setUint16(offset, chunk.nodeIndex, true);
    view.setUint16(offset + 2, chunk.chunkX, true);
    view.setUint16(offset + 4, chunk.chunkY, true);
    view.setUint16(offset + 6, 0, true);
    view.setUint32(offset + 8, chunk.tileDataOffset, true);
    view.setUint32(offset + 12, chunk.tileCount, true);
    view.setUint16(offset + 16, chunk.usedTileCount, true);
    view.setUint16(offset + 18, 0, true);
  });
}

function writeChunkTileData(view: DataView, state: ExportState) {
  state.chunkDefs.forEach((chunk) => {
    chunk.tiles.forEach((tile, index) => {
      const offset = state.chunkDataOffset + chunk.tileDataOffset + index * TILE_ENTRY_SIZE;
      view.setUint32(offset, tile.tileId, true);
      view.setUint8(offset + 4, tile.flags);
      view.setUint8(offset + 5, 0);
      view.setUint16(offset + 6, 0, true);
    });
  });
}

function writeStrings(view: DataView, state: ExportState) {
  state.stringEntries.forEach((entry, index) => {
    const offset = state.stringTableOffset + index * STRING_ENTRY_SIZE;
    view.setUint32(offset, entry.offset, true);
    view.setUint32(offset + 4, entry.length, true);
  });
}

function indexString(value: string, list: string[], map: Map<string, number>) {
  if (!value) return STRING_NONE;
  const existing = map.get(value);
  if (existing !== undefined) return existing;
  const index = list.length;
  list.push(value);
  map.set(value, index);
  return index;
}
