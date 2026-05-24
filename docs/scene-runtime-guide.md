# Scene Runtime Implementation Guide

How to load and use PSCN scene files in the C++ engine.

---

## Loading a Scene

1. Read the header, verify magic (`0x4E435350`) and version
2. Validate CRC-32 (zero the crc32 field, compute over entire file, compare)
3. Read all nodes sequentially from `nodeTableOffset`
4. For each node, read the 64-byte base, then `extSize` bytes of type-specific data
5. Reconstruct the tree using `parentIndex` and `firstChildIndex`/`childCount`

```cpp
struct SceneNode {
    PscnNodeBase base;
    union {
        PscnSpriteExt sprite;
        PscnTileMapExt tileMap;
        PscnCollisionShapeExt collision;
        PscnAreaExt area;
        PscnLight2DExt light;
    } ext;
    std::vector<SceneNode*> children;
};
```

---

## Scene Tree Traversal

Nodes are serialized in pre-order. To render:

1. Group nodes by `renderLayer` (ascending)
2. Within each render layer, process nodes in array order (which is tree pre-order)
3. For each node, compute the world transform by accumulating parent transforms

```cpp
struct WorldTransform {
    float x, y, rotation, scaleX, scaleY;
};

WorldTransform computeWorldTransform(const SceneNode* node, const SceneNode* nodes) {
    WorldTransform wt = {0, 0, 0, 1, 1};
    // Walk parent chain, accumulate transforms
    const SceneNode* current = node;
    std::vector<const SceneNode*> chain;
    while (current) {
        chain.push_back(current);
        current = (current->base.parentIndex >= 0)
            ? &nodes[current->base.parentIndex]
            : nullptr;
    }
    // Apply from root to leaf
    for (auto it = chain.rbegin(); it != chain.rend(); ++it) {
        float cos_r = cosf(wt.rotation * M_PI / 180.0f);
        float sin_r = sinf(wt.rotation * M_PI / 180.0f);
        float lx = decode_16_16((*it)->base.posX);
        float ly = decode_16_16((*it)->base.posY);
        wt.x += (lx * cos_r - ly * sin_r) * wt.scaleX;
        wt.y += (lx * sin_r + ly * cos_r) * wt.scaleY;
        wt.rotation += decode_8_8((*it)->base.rotation);
        wt.scaleX *= decode_8_8((*it)->base.scaleX);
        wt.scaleY *= decode_8_8((*it)->base.scaleY);
    }
    return wt;
}
```

---

## TileMap Rendering

When you encounter a TileMap node:

1. Read its `PscnTileMapExt` for dimensions and projection
2. Find its chunks: iterate from `firstChunkIndex` for `chunkCount` entries
3. For each chunk, read tile cells from `chunkDataOffset + tileDataOffset`
4. Resolve each tile's sprite: look up `tileId` in the tileset remap table to get `spriteId`, then draw from the atlas

```cpp
void renderTileMap(const PscnTileMapExt& tm, const PscnChunkDef* chunks,
                   const uint8_t* tileData, const uint32_t* remapTable,
                   const AtlasSpriteEntry* sprites, WorldTransform wt) {
    for (uint16_t ci = 0; ci < tm.chunkCount; ++ci) {
        const auto& chunk = chunks[tm.firstChunkIndex + ci];
        const auto* cells = reinterpret_cast<const PscnTileCell*>(
            tileData + chunk.tileDataOffset);

        for (uint32_t i = 0; i < chunk.tileCount; ++i) {
            if (cells[i].tileId == 0) continue;

            uint32_t spriteId = remapTable[cells[i].tileId - 1];
            int tileX = chunk.chunkX * tm.chunkWidthTiles + (i % tm.chunkWidthTiles);
            int tileY = chunk.chunkY * tm.chunkHeightTiles + (i / tm.chunkWidthTiles);

            float px = wt.x + tileX * tm.tileWidth;
            float py = wt.y + tileY * tm.tileHeight;

            drawSprite(sprites[spriteId], px, py);
        }
    }
}
```

---

## Isometric Coordinate Transforms

For TileMap nodes with `projection != 0`:

### Diamond Isometric

```cpp
void tileToScreen_diamond(int tileX, int tileY, int tileW, int tileH,
                          float& screenX, float& screenY) {
    screenX = (tileX - tileY) * (tileW / 2.0f);
    screenY = (tileX + tileY) * (tileH / 2.0f);
}

void screenToTile_diamond(float screenX, float screenY, int tileW, int tileH,
                          int& tileX, int& tileY) {
    float halfW = tileW / 2.0f;
    float halfH = tileH / 2.0f;
    tileX = (int)floorf((screenX / halfW + screenY / halfH) / 2.0f);
    tileY = (int)floorf((screenY / halfH - screenX / halfW) / 2.0f);
}
```

### Staggered Isometric

```cpp
void tileToScreen_staggered(int tileX, int tileY, int tileW, int tileH,
                            float& screenX, float& screenY) {
    screenX = tileX * tileW + (tileY & 1) * (tileW / 2.0f);
    screenY = tileY * (tileH / 2.0f);
}
```

---

## Collision Layers

Each node has a 32-bit `collisionLayer` and `collisionMask`. Two nodes collide when:

```cpp
bool canCollide(const SceneNode& a, const SceneNode& b) {
    return (a.base.collisionLayer & b.base.collisionMask) != 0
        || (b.base.collisionLayer & a.base.collisionMask) != 0;
}
```

This mirrors Godot's layer/mask system. Layer bits declare "I am on these layers", mask bits declare "I detect collisions on these layers".

---

## Script IDs

Every node can have:
- `scriptIdStringIndex` — a string identifier for looking up behavior
- `scriptDataStringIndex` — a JSON-encoded key-value map of properties

At runtime, resolve the string from the string table and use it to dispatch to handler code:

```cpp
const char* scriptId = resolveString(node.base.scriptIdStringIndex);
if (scriptId) {
    auto handler = scriptRegistry.find(scriptId);
    if (handler) {
        // Parse scriptData JSON if needed
        const char* dataJson = resolveString(node.base.scriptDataStringIndex);
        handler->init(node, dataJson);
    }
}
```

For PS2 hardware where a full script VM is too expensive, script IDs can simply index into a compile-time jump table of native functions.

---

## String Resolution

```cpp
const char* resolveString(uint32_t index, const PscnStringEntry* entries,
                          const char* stringBlob) {
    if (index == PSCN_STRING_NONE) return nullptr;
    return stringBlob + entries[index].offset;
}
```
