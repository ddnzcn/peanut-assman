# Atlas Binary Format Specification

> Peanut Atlas format — v1.1

The atlas system produces two binary files and optionally a debug JSON:

- **atlas.bin** — Packed sprite page image data (raw RGBA pixels)
- **atlas.meta.bin** — Sprite metadata, animations, and hash table
- **atlas.debug.json** — Human-readable version of the metadata (optional)

---

## Atlas Meta Binary (atlas.meta.bin)

**Magic:** `0x54443241` ("A2DT" in little-endian)

### Header (56 bytes)

| Offset | Type | Field              | Notes |
|--------|------|--------------------|-------|
| 0      | u32  | magic              | `0x54443241` |
| 4      | u16  | versionMajor       | 1 |
| 6      | u16  | versionMinor       | 1 |
| 8      | u32  | fileSize           | Total meta file size |
| 12     | u32  | crc32              | CRC-32 checksum |
| 16     | u16  | pageCount          | Number of atlas pages |
| 18     | u16  | spriteCount        | Total sprites |
| 20     | u16  | animCount          | Sprite animations |
| 22     | u16  | animFrameCount     | Total animation frames |
| 24     | u16  | animTileCount      | Animated tile definitions |
| 26     | u16  | animTileFrameCount | Total animated tile frames |
| 28     | u16  | hashEntryCount     | Hash table entries (power of 2) |
| 30     | u16  | _pad               | Reserved |
| 32     | u32  | pageTableOffset    | Offset to page entries |
| 36     | u32  | spriteTableOffset  | Offset to sprite entries |
| 40     | u32  | animTableOffset    | Offset to animation entries |
| 44     | u32  | animFrameTableOffset | Offset to animation frames |
| 48     | u32  | hashTableOffset    | Offset to hash table |
| 52     | u32  | animTileTableOffset | Offset to animated tile entries |

### Page Entry (30 bytes)

| Offset | Type | Field       | Notes |
|--------|------|-------------|-------|
| 0      | u16  | pageIndex   | Page number |
| 2      | u16  | width       | Page width (pixels, power of 2) |
| 4      | u16  | height      | Page height (pixels, power of 2) |
| 6      | u32  | dataOffset  | Byte offset into atlas.bin |
| 10     | u32  | dataSize    | Byte size of RGBA data |
| 14-29  | u8[] | reserved    | Zero-filled |

### Sprite Entry (40 bytes)

| Offset | Type | Field         | Notes |
|--------|------|---------------|-------|
| 0      | u32  | spriteId      | Unique sprite ID |
| 4      | u32  | nameHash      | FNV-1a 32-bit hash of sprite name |
| 8      | u16  | pageIndex     | Which page this sprite is on |
| 10     | u16  | flags         | bit 0: rotated 90 CW |
| 12     | u16  | x             | X position on page |
| 14     | u16  | y             | Y position on page |
| 16     | u16  | trimmedWidth  | Trimmed sprite width |
| 18     | u16  | trimmedHeight | Trimmed sprite height |
| 20     | u16  | trimX         | Trim offset from source left |
| 22     | u16  | trimY         | Trim offset from source top |
| 24     | u16  | sourceWidth   | Full source frame width |
| 26     | u16  | sourceHeight  | Full source frame height |
| 28-39  | u8[] | reserved      | Zero-filled |

### Animation Entry (12 bytes)

| Offset | Type | Field           | Notes |
|--------|------|-----------------|-------|
| 0      | u32  | nameHash        | FNV-1a hash of animation name |
| 4      | u16  | firstFrameIndex | Index into animation frame table |
| 6      | u16  | frameCount      | Number of frames |
| 8      | u16  | flags           | bit 0: loop |
| 10     | u16  | _pad            | Reserved |

### Animation Frame (8 bytes)

| Offset | Type | Field       | Notes |
|--------|------|-------------|-------|
| 0      | u32  | spriteIndex | Index into sprite table |
| 4      | u16  | durationMs  | Frame duration in milliseconds |
| 6      | u16  | _pad        | Reserved |

### Animated Tile Entry (8 bytes)

| Offset | Type | Field           | Notes |
|--------|------|-----------------|-------|
| 0      | u32  | baseSpriteIndex | Base sprite that gets replaced at runtime |
| 4      | u16  | firstFrameIndex | Index into animated tile frame table |
| 6      | u16  | frameCount      | Number of frames |

### Animated Tile Frame (8 bytes)

Same layout as Animation Frame.

### Hash Table Entry (8 bytes)

| Offset | Type | Field       | Notes |
|--------|------|-------------|-------|
| 0      | u32  | nameHash    | FNV-1a hash (0 = empty slot) |
| 4      | u32  | spriteIndex | Index into sprite table |

The hash table uses open addressing with linear probing. Table size is always a power of 2.

---

## Atlas Page Binary (atlas.bin)

Raw RGBA pixel data for each atlas page, concatenated sequentially. Each page's data starts at the offset specified in its Page Entry. Pixel format is 4 bytes per pixel (R, G, B, A), row-major, top-to-bottom.

Page dimensions are always powers of 2 (64, 128, 256, 512, or 1024).

---

## Build Options

The atlas packer is configured with:

| Option          | Type    | Default | Notes |
|-----------------|---------|---------|-------|
| maxPageSize     | u16     | 1024    | Maximum page dimension (power of 2) |
| allowRotation   | bool    | false   | Rotate sprites 90 CW to pack tighter |
| padding         | u8      | 2       | Pixels between sprites |
| extrusion       | u8      | 2       | Edge pixel extrusion (prevents bleeding) |
| includeHashTable| bool    | true    | Include sprite name hash lookup table |
| includeDebugJson| bool    | true    | Generate atlas.debug.json |
