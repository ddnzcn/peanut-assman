# PSCN Binary Format Specification

> Peanut Scene format — v1.0

**Magic:** `0x4E435350` ("PSCN" in little-endian)
**Endianness:** Little-endian throughout
**Alignment:** All section offsets are 4-byte aligned

---

## Header (64 bytes)

| Offset | Type   | Field              | Notes |
|--------|--------|--------------------|-------|
| 0      | u32    | magic              | `0x4E435350` |
| 4      | u16    | versionMajor       | 1 |
| 6      | u16    | versionMinor       | 0 |
| 8      | u32    | fileSize           | Total file size in bytes |
| 12     | u32    | crc32              | CRC-32 of entire file (this field zeroed during computation) |
| 16     | u16    | nodeCount          | Total nodes in scene tree |
| 18     | u16    | tilesetCount       | Number of tileset definitions |
| 20     | u16    | chunkCount         | Total tile chunks across all TileMap nodes |
| 22     | u16    | stringCount        | Entries in string table |
| 24     | u32    | nodeTableOffset    | Offset to first node entry |
| 28     | u32    | tilesetTableOffset | Offset to tileset definitions |
| 32     | u32    | chunkTableOffset   | Offset to chunk definitions |
| 36     | u32    | chunkDataOffset    | Offset to tile cell data |
| 40     | u32    | stringTableOffset  | Offset to string directory |
| 44     | u32    | stringDataOffset   | Offset to string blob (UTF-8) |
| 48-63  | u8[16] | reserved           | Zero-filled |

---

## Node Entry (variable size: 64-byte base + type-specific extension)

Nodes are serialized in **pre-order traversal** of the scene tree. The root node is always index 0.

### Base Fields (64 bytes)

| Offset | Type | Field               | Notes |
|--------|------|---------------------|-------|
| 0      | u32  | nodeId              | Sequential index (matches array position) |
| 4      | i32  | parentIndex         | Parent node index (-1 for root) |
| 8      | u32  | nameHash            | FNV-1a 32-bit hash of node name |
| 12     | u8   | nodeType            | See Node Types below |
| 13     | u8   | flags               | bit 0: visible, bit 1: locked |
| 14     | u16  | renderLayer         | Draw order group (lower = drawn first) |
| 16     | i32  | posX                | Position X, fixed-point 16.16 (pixels) |
| 20     | i32  | posY                | Position Y, fixed-point 16.16 (pixels) |
| 24     | i16  | rotation            | Degrees, fixed-point 8.8 |
| 26     | i16  | scaleX              | Scale X, fixed-point 8.8 |
| 28     | i16  | scaleY              | Scale Y, fixed-point 8.8 |
| 30     | u16  | childCount          | Number of direct children |
| 32     | u32  | firstChildIndex     | Index of first child in node table |
| 36     | u32  | scriptIdStringIndex | String table index (0xFFFFFFFF = none) |
| 40     | u32  | scriptDataStringIndex | JSON-encoded key-value pairs (0xFFFFFFFF = none) |
| 44     | u32  | collisionLayer      | 32-bit collision layer bitmask |
| 48     | u32  | collisionMask       | 32-bit collision mask bitmask |
| 52     | i16  | parallaxX           | Parallax factor X, fixed-point 8.8 (1.0 = normal) |
| 54     | i16  | parallaxY           | Parallax factor Y, fixed-point 8.8 (1.0 = normal) |
| 56     | u16  | extSize             | Size of type-specific extension in bytes |
| 54-63  | u8[] | reserved            | Zero-filled |

### Node Types

| Value | Type           | Extension Size |
|-------|----------------|---------------|
| 0     | Root           | 0 bytes |
| 1     | Node2D         | 0 bytes |
| 2     | Sprite         | 12 bytes |
| 3     | TileMap        | 24 bytes |
| 4     | CollisionShape | 16 bytes |
| 5     | Area           | 16 bytes |
| 6     | Light2D        | 20 bytes |
| 7     | AnimatedSprite | 16 bytes |

### Sprite Extension (12 bytes)

| Offset | Type | Field    | Notes |
|--------|------|----------|-------|
| 0      | u32  | spriteId | Atlas sprite index |
| 4      | u8   | flipH    | Horizontal flip (0/1) |
| 5      | u8   | flipV    | Vertical flip (0/1) |
| 6      | u16  | _pad     | Reserved |
| 8      | u32  | tintColor| RGBA as packed u32 |

### TileMap Extension (24 bytes)

| Offset | Type | Field           | Notes |
|--------|------|-----------------|-------|
| 0      | u16  | tileWidth       | Tile pixel width |
| 2      | u16  | tileHeight      | Tile pixel height |
| 4      | u16  | chunkWidthTiles | Tiles per chunk (X) |
| 6      | u16  | chunkHeightTiles| Tiles per chunk (Y) |
| 8      | u16  | mapWidthTiles   | Total map width in tiles |
| 10     | u16  | mapHeightTiles  | Total map height in tiles |
| 12     | u8   | projection      | 0=orthogonal, 1=isometric-diamond, 2=isometric-staggered |
| 13     | u8   | _pad            | Reserved |
| 14     | u16  | chunkCount      | Chunks belonging to this TileMap |
| 16     | u32  | firstChunkIndex | Index into chunk table |
| 20     | u32  | reserved        | Zero |

### CollisionShape Extension (16 bytes)

| Offset | Type | Field  | Notes |
|--------|------|--------|-------|
| 0      | u8   | shape  | 0=rect, 1=circle, 2=polygon |
| 1-3    | u8[] | _pad   | Reserved |
| 4      | i32  | width  | Shape width (pixels) |
| 8      | i32  | height | Shape height (pixels) |
| 12     | i32  | radius | Circle radius (pixels) |

### Area Extension (16 bytes)

| Offset | Type | Field          | Notes |
|--------|------|----------------|-------|
| 0      | u8   | shape          | 0=point, 1=rect |
| 1-3    | u8[] | _pad           | Reserved |
| 4      | i32  | width          | Area width (pixels) |
| 8      | i32  | height         | Area height (pixels) |
| 12     | u32  | tagStringIndex | String table index for area tag |

### Light2D Extension (20 bytes)

| Offset | Type | Field          | Notes |
|--------|------|----------------|-------|
| 0      | i32  | radius         | Light radius (pixels) |
| 4      | u32  | color          | RGB as packed u32 |
| 8      | u16  | intensity      | Fixed-point 8.8 |
| 10     | u16  | falloff        | Fixed-point 8.8 |
| 12     | u8   | variant        | 0 = omni, 1 = directional |
| 13     | u8   | _pad           | Reserved |
| 14     | i16  | directionAngle | Fixed-point 8.8 (degrees) |
| 16     | i16  | coneAngle      | Fixed-point 8.8 (degrees, directional only) |
| 18     | i16  | _reserved      | 0 |

### AnimatedSprite Extension (16 bytes)

| Offset | Type | Field           | Notes |
|--------|------|-----------------|-------|
| 0      | u32  | animNameHash    | FNV-1a hash of animation name, 0 = none |
| 4      | u8   | flipH           | Horizontal flip (0/1) |
| 5      | u8   | flipV           | Vertical flip (0/1) |
| 6      | u16  | _pad            | Reserved |
| 8      | u32  | tintColor       | RGBA as packed u32 |
| 12     | u32  | defaultSpriteId | First frame sprite ID (static fallback) |

---

## Tileset Definition (28 bytes)

Same layout as the legacy TMAP format.

| Offset | Type | Field           | Notes |
|--------|------|-----------------|-------|
| 0      | u32  | id              | Tileset ID |
| 4      | u32  | nameHash        | FNV-1a hash |
| 8      | u32  | firstTileId     | Starting export tile ID (1-based) |
| 12     | u32  | tileCount       | Number of tiles |
| 16     | u32  | remapTableOffset| Absolute offset to sprite remap entries |
| 20     | u16  | tileWidth       | Pixels |
| 22     | u16  | tileHeight      | Pixels |
| 24     | u16  | columns         | Grid layout hint |
| 26     | u16  | flags           | Reserved |

**Remap Table:** Immediately follows tileset definitions. Each entry is `u32 spriteId` mapping export tile ID to atlas sprite index.

---

## Chunk Definition (20 bytes)

| Offset | Type | Field          | Notes |
|--------|------|----------------|-------|
| 0      | u16  | nodeIndex      | Which TileMap node owns this chunk |
| 2      | u16  | chunkX         | Chunk grid X |
| 4      | u16  | chunkY         | Chunk grid Y |
| 6      | u16  | _pad           | Reserved |
| 8      | u32  | tileDataOffset | Byte offset into chunk data section |
| 12     | u32  | tileCount      | Cells in this chunk (chunkW * chunkH) |
| 16     | u16  | usedTileCount  | Non-empty cells (optimization hint) |
| 18     | u16  | _pad2          | Reserved |

---

## Tile Cell (8 bytes)

| Offset | Type | Field   | Notes |
|--------|------|---------|-------|
| 0      | u32  | tileId  | Export tile ID (1-based, 0 = empty) |
| 4      | u8   | flags   | Transform flags (bit 0: flipX, bit 1: flipY, bit 2: rotate90) |
| 5      | u8   | _pad    | Reserved |
| 6      | u16  | _pad2   | Reserved |

---

## String Table

### Directory (8 bytes per entry)

| Offset | Type | Field  | Notes |
|--------|------|--------|-------|
| 0      | u32  | offset | Byte offset into string data blob |
| 4      | u32  | length | Byte length (excluding null terminator) |

### Data Blob

UTF-8 encoded strings, each followed by a null byte (`\0`). Strings are sequentially packed.

**Sentinel:** `0xFFFFFFFF` in a string index field means "no string" / empty.

---

## File Layout (section order)

```
[Header]
[Node Table]         ← variable-size entries (base + extension)
[Tileset Definitions]
[Tileset Remap Table]
[Chunk Definitions]
[Chunk Tile Data]
[String Directory]
[String Data Blob]
```

All sections are 4-byte aligned. Gaps between sections are zero-filled.
