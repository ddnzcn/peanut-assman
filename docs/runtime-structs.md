# C++ Runtime Struct Definitions

Copy-paste struct definitions for loading PSCN and Atlas binary formats.

---

## PSCN Scene Format

```cpp
#include <cstdint>

struct PscnHeader {
    uint32_t magic;              // 0x4E435350
    uint16_t versionMajor;       // 1
    uint16_t versionMinor;       // 0
    uint32_t fileSize;
    uint32_t crc32;
    uint16_t nodeCount;
    uint16_t tilesetCount;
    uint16_t chunkCount;
    uint16_t stringCount;
    uint32_t nodeTableOffset;
    uint32_t tilesetTableOffset;
    uint32_t chunkTableOffset;
    uint32_t chunkDataOffset;
    uint32_t stringTableOffset;
    uint32_t stringDataOffset;
    uint8_t  reserved[16];
};
static_assert(sizeof(PscnHeader) == 64);

enum PscnNodeType : uint8_t {
    NODE_ROOT            = 0,
    NODE_NODE2D          = 1,
    NODE_SPRITE          = 2,
    NODE_TILEMAP         = 3,
    NODE_COLLISION_SHAPE = 4,
    NODE_AREA            = 5,
    NODE_LIGHT2D         = 6,
};

struct PscnNodeBase {
    uint32_t nodeId;
    int32_t  parentIndex;       // -1 for root
    uint32_t nameHash;
    uint8_t  nodeType;
    uint8_t  flags;             // bit 0: visible, bit 1: locked
    uint16_t renderLayer;
    int32_t  posX;              // fixed-point 16.16
    int32_t  posY;
    int16_t  rotation;          // fixed-point 8.8 (degrees)
    int16_t  scaleX;            // fixed-point 8.8
    int16_t  scaleY;
    uint16_t childCount;
    uint32_t firstChildIndex;
    uint32_t scriptIdStringIndex;
    uint32_t scriptDataStringIndex;
    uint32_t collisionLayer;
    uint32_t collisionMask;
    int16_t  parallaxX;            // fixed-point 8.8 (256 = 1.0)
    int16_t  parallaxY;
    uint16_t extSize;
    uint8_t  reserved[8];
};
static_assert(sizeof(PscnNodeBase) == 64);

struct PscnSpriteExt {
    uint32_t spriteId;
    uint8_t  flipH;
    uint8_t  flipV;
    uint16_t _pad;
    uint32_t tintColor;         // RGBA packed
};
static_assert(sizeof(PscnSpriteExt) == 12);

struct PscnAnimatedSpriteExt {
    uint32_t animNameHash;      // FNV-1a of animation name, 0 = none
    uint8_t  flipH;
    uint8_t  flipV;
    uint16_t _pad;
    uint32_t tintColor;         // RGBA packed
    uint32_t defaultSpriteId;   // first frame sprite for static fallback
};
static_assert(sizeof(PscnAnimatedSpriteExt) == 16);

struct PscnTileMapExt {
    uint16_t tileWidth;
    uint16_t tileHeight;
    uint16_t chunkWidthTiles;
    uint16_t chunkHeightTiles;
    uint16_t mapWidthTiles;
    uint16_t mapHeightTiles;
    uint8_t  projection;        // 0=ortho, 1=iso-diamond, 2=iso-staggered
    uint8_t  _pad;
    uint16_t chunkCount;
    uint32_t firstChunkIndex;
    uint32_t reserved;
};
static_assert(sizeof(PscnTileMapExt) == 24);

struct PscnCollisionShapeExt {
    uint8_t  shape;             // 0=rect, 1=circle, 2=polygon
    uint8_t  _pad[3];
    int32_t  width;
    int32_t  height;
    int32_t  radius;
};
static_assert(sizeof(PscnCollisionShapeExt) == 16);

struct PscnAreaExt {
    uint8_t  shape;             // 0=point, 1=rect
    uint8_t  _pad[3];
    int32_t  width;
    int32_t  height;
    uint32_t tagStringIndex;
};
static_assert(sizeof(PscnAreaExt) == 16);

enum PscnLightVariant : uint8_t {
    LIGHT_OMNI        = 0,
    LIGHT_DIRECTIONAL = 1,
};

struct PscnLight2DExt {
    int32_t  radius;
    uint32_t color;             // RGB packed
    uint16_t intensity;         // fixed-point 8.8
    uint16_t falloff;           // fixed-point 8.8
    uint8_t  variant;           // PscnLightVariant
    uint8_t  _pad;
    int16_t  directionAngle;    // fixed-point 8.8 degrees
    int16_t  coneAngle;         // fixed-point 8.8 degrees (directional only)
    int16_t  _reserved;
};
static_assert(sizeof(PscnLight2DExt) == 20);

struct PscnTilesetDef {
    uint32_t id;
    uint32_t nameHash;
    uint32_t firstTileId;
    uint32_t tileCount;
    uint32_t remapTableOffset;  // absolute offset to spriteId remap entries
    uint16_t tileWidth;
    uint16_t tileHeight;
    uint16_t columns;
    uint16_t flags;
};
static_assert(sizeof(PscnTilesetDef) == 28);

struct PscnChunkDef {
    uint16_t nodeIndex;
    uint16_t chunkX;
    uint16_t chunkY;
    uint16_t _pad;
    uint32_t tileDataOffset;
    uint32_t tileCount;
    uint16_t usedTileCount;
    uint16_t _pad2;
};
static_assert(sizeof(PscnChunkDef) == 20);

struct PscnTileCell {
    uint32_t tileId;            // 1-based export ID, 0 = empty
    uint8_t  flags;
    uint8_t  transform;         // bit 0: flipX, bit 1: flipY, bit 2: rotate90
    uint16_t _pad;
};
static_assert(sizeof(PscnTileCell) == 8);

struct PscnStringEntry {
    uint32_t offset;            // byte offset into string data blob
    uint32_t length;            // byte length (excluding null terminator)
};
static_assert(sizeof(PscnStringEntry) == 8);

// Sentinel for "no string"
constexpr uint32_t PSCN_STRING_NONE = 0xFFFFFFFF;
```

---

## Atlas Meta Format

```cpp
struct AtlasHeader {
    uint32_t magic;              // 0x54443241
    uint16_t versionMajor;
    uint16_t versionMinor;
    uint32_t fileSize;
    uint32_t crc32;
    uint16_t pageCount;
    uint16_t spriteCount;
    uint16_t animCount;
    uint16_t animFrameCount;
    uint16_t animTileCount;
    uint16_t animTileFrameCount;
    uint16_t hashEntryCount;
    uint16_t _pad;
    uint32_t pageTableOffset;
    uint32_t spriteTableOffset;
    uint32_t animTableOffset;
    uint32_t animFrameTableOffset;
    uint32_t hashTableOffset;
    uint32_t animTileTableOffset;
};
static_assert(sizeof(AtlasHeader) == 56);

struct AtlasPageEntry {
    uint16_t pageIndex;
    uint16_t width;
    uint16_t height;
    uint32_t dataOffset;
    uint32_t dataSize;
    uint8_t  reserved[16];
};
static_assert(sizeof(AtlasPageEntry) == 30);

struct AtlasSpriteEntry {
    uint32_t spriteId;
    uint32_t nameHash;
    uint16_t pageIndex;
    uint16_t flags;              // bit 0: rotated 90 CW
    uint16_t x;
    uint16_t y;
    uint16_t trimmedWidth;
    uint16_t trimmedHeight;
    uint16_t trimX;
    uint16_t trimY;
    uint16_t sourceWidth;
    uint16_t sourceHeight;
    uint8_t  reserved[12];
};
static_assert(sizeof(AtlasSpriteEntry) == 40);

struct AtlasAnimEntry {
    uint32_t nameHash;
    uint16_t firstFrameIndex;
    uint16_t frameCount;
    uint16_t flags;              // bit 0: loop
    uint16_t _pad;
};
static_assert(sizeof(AtlasAnimEntry) == 12);

struct AtlasAnimFrame {
    uint32_t spriteIndex;
    uint16_t durationMs;
    uint16_t _pad;
};
static_assert(sizeof(AtlasAnimFrame) == 8);

struct AtlasAnimTileEntry {
    uint32_t baseSpriteIndex;
    uint16_t firstFrameIndex;
    uint16_t frameCount;
};
static_assert(sizeof(AtlasAnimTileEntry) == 8);

struct AtlasHashEntry {
    uint32_t nameHash;           // 0 = empty slot
    uint32_t spriteIndex;
};
static_assert(sizeof(AtlasHashEntry) == 8);
```

---

## Fixed-Point Conventions

| Notation | Conversion | Range |
|----------|-----------|-------|
| 16.16    | `value * 65536` | -32768.0 to ~32767.99 |
| 8.8      | `value * 256` | -128.0 to ~127.99 |

To decode in C++:
```cpp
float decode_16_16(int32_t raw) { return raw / 65536.0f; }
float decode_8_8(int16_t raw)   { return raw / 256.0f; }
```

## Hash Function (FNV-1a 32-bit)

```cpp
uint32_t fnv1a32(const char* input, size_t len) {
    uint32_t hash = 0x811c9dc5;
    for (size_t i = 0; i < len; ++i) {
        hash ^= static_cast<uint8_t>(input[i]);
        hash *= 0x01000193;
    }
    return hash;
}
```
