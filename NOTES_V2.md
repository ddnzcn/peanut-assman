# Peanut Engine Toolchain — V2 Notes

> **Scope:** UX overhaul notes, bug fixes, proposed C++ struct improvements, and forward-looking format changes.
> Do **not** edit engine C++ code based on this file — treat these as design proposals to implement on the engine side.

---

## 1. Bug Fixes Applied in V2

### 1.1 Atlas-Only Sprites in Pickers (Critical)

**Problem:** The Animation workspace and Animated Tile picker were showing every imported slice, including raw PNG sheet crops that are not part of the atlas. The engine only has sprites that have `includeInAtlas = true` — frames referencing non-atlas slices would silently fail at export.

**Fix:** Both pickers now filter to only slices that have a corresponding `SpriteAsset` with `includeInAtlas = true`:
```ts
const atlasSliceIds = new Set(
  project.sprites.filter(sp => sp.includeInAtlas).map(sp => sp.sliceId)
);
const atlasSlices = project.slices.filter(s => atlasSliceIds.has(s.id));
```

### 1.2 Animated Tile Frames: `tileId` → `sliceId`

**Problem:** `AnimatedTileFrame` stored `tileId: number`. Tile IDs are assigned by the tileset pipeline and shift when new slices are imported, silently breaking animated tile frame references.

**Fix:** `AnimatedTileFrame` now stores `sliceId: string` (stable string UUID, same as `AnimationFrame`). Canvas rendering and the export selector both resolve `sliceId → sprite` directly without going through the tile lookup chain.

### 1.3 Canvas Tile Rendering: Animated Frame Bypass

**Problem:** `resolveAnimatedTileId` returned a `tileId` for the current animation frame. This forced the frame to exist in the tileset, making it impossible to animate with sprites not explicitly placed in a tileset.

**Fix:** New `resolveAnimatedTileSliceId` returns `string | null`. The canvas renderer uses the resolved `sliceId` directly when present, bypassing the `tileById` lookup. Terrain set detection stays on the original tile ID (correct behavior — the base tile determines terrain membership, not the animation frame).

---

## 2. V2 UX Changes

### 2.1 Routing

- `/` → V1 AppShell (preserved, unchanged)
- `/v2` → V2 AppShell (new)
- Catch-all redirects to `/v2`

### 2.2 Layout: Level Editor

**V1 problem:** Tile palette was a popup tray (`asset-tray`) anchored above the bottom dock. Opening it covered the bottom ~40% of the canvas. You couldn't see both the canvas and the tile palette simultaneously.

**V2 solution:** Tile palette is a permanent right-side panel (280px). The canvas takes the remaining width. No open/close — the palette is always visible, always ready to paint.

```
┌────────────────────────────────────────────────────────────┐
│  TopBar: Logo | [Atlas][Level][Anim] | File / Export       │
├──────────────┬──────────────────────────┬──────────────────┤
│  Navigator   │  Level Canvas (flex 1)   │  Inspector       │
│  (200px)     │                          │  ─────────────── │
│  Level tree  │                          │  Tile Palette    │
│  Layer list  │                          │  (scrollable)    │
│              │                          │                  │
├──────────────┴──────────────────────────┤                  │
│  Toolbar: Undo|Redo | brush tile | tools | zoom            │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 Lucide Icons

All text-based icon labels replaced with [lucide-react](https://lucide.dev/) icons. No more `◧`, `⌫`, `⌖` — every tool has a recognizable SVG icon.

| Tool | Icon |
|------|------|
| Brush | `Pencil` |
| Terrain | `Grid3x3` |
| Erase | `Eraser` |
| Rect | `RectangleHorizontal` |
| Fill | `PaintBucket` |
| Collision | `Shield` |
| Marker | `MapPin` |
| Hand/Pan | `Move` |
| Undo/Redo | `Undo2` / `Redo2` |
| Zoom | `ZoomIn` / `ZoomOut` |
| Atlas | `Package` |
| Level | `Map` |
| Animation | `Film` |
| Animated Tiles | `Sparkles` |
| Settings | `Settings` |
| Add | `Plus` |
| Import | `Upload` |
| Export | `Download` |
| Load | `FolderOpen` |
| Save | `Save` |

### 2.4 Tile Palette (V2 Right Panel)

- Sections: **Pinned** → **Recent** → **All Tiles** (same visual hierarchy as before, now always visible)
- Search field with `Search` icon at the top
- Compact 32×32 tile buttons — much denser grid, fits more tiles without scrolling
- Right panel spans rows 2–3 of the grid (below topbar, all the way down) so it doesn't compete with the bottom toolbar

### 2.5 Animated Tiles UX (from previous session)

- Redesigned as a 3-column workspace matching the Animation tab
- Left: animated tile list
- Center: live preview + frame strip with thumbnail cards (click to select, duration on card)
- Right: Sprite picker (only atlas-included slices, filtered by search)
- Interaction mirrors the Animation workspace: click sprite to append frame, click frame then sprite to replace

---

## 3. Proposed C++ Struct Improvements

These are **proposals only** — implement in the engine at your own pace.

### 3.1 TMAP: Add Animated Tile Table to Level File

Currently animated tile data is stored in the **atlas meta** binary only. This means the level renderer needs both files loaded and correlated at runtime. Moving an inline animated tile reference table into the TMAP file would let the level renderer be self-sufficient.

**Proposed new header fields (after `stringDataOffset` at offset 68):**

```cpp
// Current TMAP header (72 bytes):
struct TmapHeader {
    uint32_t magic;           // 0x50414d54 "TMAP"
    uint16_t versionMajor;    // currently 2
    uint16_t versionMinor;    // currently 1
    uint32_t fileSize;
    uint32_t crc32;
    uint16_t mapWidthTiles;
    uint16_t mapHeightTiles;
    uint16_t tileWidth;
    uint16_t tileHeight;
    uint16_t chunkWidthTiles;
    uint16_t chunkHeightTiles;
    uint16_t tilesetCount;
    uint16_t layerCount;
    uint16_t chunkCount;
    uint16_t collisionCount;
    uint16_t markerCount;
    uint16_t stringCount;
    uint32_t tilesetTableOffset;
    uint32_t layerTableOffset;
    uint32_t chunkTableOffset;
    uint32_t chunkDataOffset;
    uint32_t collisionTableOffset;
    uint32_t markerTableOffset;
    uint32_t stringTableOffset;
    uint32_t stringDataOffset;
};
// Total: 72 bytes

// Proposed v3 extension (add 8 bytes → 80 bytes total, bump versionMajor to 3):
struct TmapHeaderV3 : TmapHeader {
    uint16_t animTileCount;       // number of animated tile entries
    uint16_t _pad0;
    uint32_t animTileTableOffset; // offset to AnimTileEntry[] table
};
```

**Proposed AnimTileEntry in TMAP:**

```cpp
// 12 bytes per entry
struct TmapAnimTileEntry {
    uint32_t baseSpriteIndex;   // atlas sprite index for the base tile (what gets replaced)
    uint16_t firstFrameIndex;   // index into AnimTileFrame table
    uint16_t frameCount;
    uint32_t _reserved;         // reserved for flags/loop mode in future
};

// 8 bytes per frame (matches existing atlas anim frame layout)
struct TmapAnimTileFrame {
    uint32_t spriteIndex;       // atlas sprite index for this frame
    uint16_t durationMs;        // clamped to [1, 65535]
    uint16_t _pad;
};
```

This avoids the need to cross-reference atlas meta at runtime for animated tile playback.

---

### 3.2 Atlas Meta: Sprite Pivot / Pivot Normalization

Currently pivot values (`pivotX`, `pivotY`) are stored as raw pixel coordinates in the source image space. For engine use it's more practical to store them as fixed-point normalized `[0.0, 1.0]` relative to the source frame, so pivots stay valid after atlas repacking.

**Current sprite entry layout:**
```cpp
struct AtlasSpriteEntry {
    uint32_t spriteId;
    uint32_t nameHash;
    uint16_t pageIndex;
    uint16_t flags;          // bit 0 = rotated
    uint16_t x;              // packed x on page
    uint16_t y;              // packed y on page
    uint16_t trimmedWidth;
    uint16_t trimmedHeight;
    uint16_t trimX;          // trim offset from source top-left
    uint16_t trimY;
    uint16_t sourceWidth;    // full frame width
    uint16_t sourceHeight;
    // 40 bytes total currently - pivots missing from binary
};
```

**Proposed addition (adds 4 bytes → 44 bytes):**
```cpp
struct AtlasSpriteEntryV2 : AtlasSpriteEntry {
    int16_t pivotX;   // fixed-point 8.8 (pixels from left of source frame)
    int16_t pivotY;   // fixed-point 8.8 (pixels from top of source frame)
};
```

The toolchain already tracks `pivotX` / `pivotY` per slice (see `SliceAsset.pivotX/Y`) and populates `ImportSprite.pivotX/Y`. These are currently **not written** to the atlas binary — the export writes zeros in the reserved space at `offset+28` and `offset+30`. Those slots can be repurposed for pivot data.

**Engine side change needed:** Read `pivotX`/`pivotY` from atlas sprite entry and use for sprite draw offset.

---

### 3.3 TMAP: Layer `userData` Fields

Layers currently have no user-defined data beyond `flags`. Adding two `uint32_t userData` fields opens up engine-side customization per layer (e.g., parallax multiplier override, render order hint, custom material/shader ID).

**Proposed layer entry addition (+8 bytes → 58 bytes):**
```cpp
// Current LAYER_DEF_SIZE = 50 bytes
struct TmapLayerDef {
    uint32_t layerId;
    uint32_t nameHash;
    uint16_t flags;
    uint16_t drawOrder;
    int16_t  parallaxX;   // fixed-point 8.8
    int16_t  parallaxY;
    int16_t  offsetX;
    int16_t  offsetY;
    uint16_t widthTiles;
    uint16_t heightTiles;
    uint16_t chunkCols;
    uint16_t chunkRows;
    uint32_t firstChunkIndex;
    uint32_t chunkCount;
    uint32_t firstCollisionIndex;
    uint16_t collisionCount;
    uint32_t firstMarkerIndex;
    uint16_t markerCount;
    uint16_t _pad;
    // PROPOSED (+8 bytes):
    uint32_t userData0;
    uint32_t userData1;
};
```

---

### 3.4 TMAP: Tile Flags — Flip Bits

`TileCell.flags` is currently 1 byte but the binary writes it into 4 bytes (`tileId: uint32 + flags: uint8 + 3 padding bytes`). The padding space can be reused for tile transform flags.

**Proposed tile cell layout (no size change, uses existing padding):**
```cpp
// Current TILE_ENTRY_SIZE = 8 bytes
struct TmapTileCell {
    uint32_t tileId;
    uint8_t  flags;
    uint8_t  transform;    // was pad — bit 0=flipX, bit 1=flipY, bit 2=rotate90
    uint16_t _pad;
};
```

The toolchain would need a "flip tile" toggle in the level editor brush options. Worth adding as a quality-of-life feature — it doubles the effective tile variety without new assets.

---

### 3.5 Atlas Meta: Animation Loop Mode

Currently animation loop mode is a single bit in the animation entry flags (`bit 0 = loop`). Expanding to a 2-bit field allows `Ping-Pong` mode, which is commonly needed for idle/breathing animations.

```cpp
// Proposed animation flags:
// bits 0-1: loop mode
//   0 = play once
//   1 = loop forward
//   2 = ping-pong
//   3 = reserved
// bits 2+: reserved
```

Toolchain change needed: add loop mode selector (Once / Loop / Ping-Pong) to the animation inspector. The binary format change is backwards-compatible — engines reading only bit 0 will treat ping-pong as "loop".

---

### 3.6 TMAP: Marker `properties` Map

`MarkerObject` has a `properties: Record<string, string>` field in the project but the binary export only writes `type`, `event`, `name`, `userData0`, `userData1`. The `properties` map is dropped silently.

**Proposed addition:** Export the `properties` map as a secondary string table per marker, referenced by offset.

**Proposed new marker layout (adds 8 bytes → 52 bytes):**
```cpp
struct TmapMarker {
    uint32_t markerId;
    uint16_t shape;
    uint16_t flags;
    int32_t  x, y, w, h;
    uint32_t typeStringIndex;
    uint32_t eventStringIndex;
    uint32_t nameStringIndex;
    uint32_t userData0;
    uint32_t userData1;
    // PROPOSED (+8 bytes):
    uint32_t propertiesOffset; // offset into a separate properties blob, STRING_NONE if empty
    uint32_t propertiesCount;  // number of key-value pairs
};
```

The properties blob would be a flat sequence of `(keyStringIndex, valueStringIndex)` pairs, reusing the existing string table.

---

## 4. Future Tool Features (Backlog)

| Feature | Priority | Notes |
|---------|----------|-------|
| Tile flip/rotate in brush | High | Needs `transform` byte in tile cell (§3.4) |
| Ping-pong animation | Medium | Needs loop mode bits (§3.5) |
| Marker property editor in inspector | Medium | Needs properties export (§3.6) |
| Multi-layer select/paint | Medium | UX: select multiple layers, paint to all |
| Tile stamp / multi-tile brush | High | Select region of tiles as brush |
| Auto-save / crash recovery | High | Debounced save to localStorage |
| Undo for atlas operations | Medium | Currently undo is level-only |
| Pivot point editor in slicer | Low | Visual drag handle on slice preview |
| Sprite sheet auto-detect | Low | Heuristic for uniform tile grids |
| Pop-out tile palette window | Medium | `window.open` secondary window for multi-monitor |

---

## 5. Version Bump Checklist

If you implement the TMAP v3 proposals, bump the version fields:

- `versionMajor: 2 → 3` (breaking change — header size changed)
- Update `HEADER_SIZE` constant in `tmap.ts` from `72` to `80`
- Update `LAYER_DEF_SIZE` from `50` to `58` if userData fields added
- Update `COLLISION_SIZE` stays `28` (no proposed changes)
- Update `MARKER_SIZE` from `44` to `52` if properties added

Keep a v2 export path for backwards compatibility during the engine transition.
