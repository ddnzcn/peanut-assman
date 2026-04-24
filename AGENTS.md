# Peanut — Agent Documentation

Comprehensive reference for AI agents working on this codebase or its PS2-runtime counterpart.

---

## What Is This Project?

**Peanut** is a browser-based tile map and sprite atlas editor built with React + TypeScript. It produces two binary output formats consumed by a PS2 game engine:

| Output | Format | Description |
|--------|--------|-------------|
| Atlas | Custom binary + PNG pages | Packed sprite sheet with metadata |
| Level | `.tmap` binary | Chunked tile map with layers, collisions, markers |

The editor is entirely client-side — no backend, no server. All state lives in a React context (`ProjectStoreProvider`) backed by a pure-function reducer.

---

## Route Structure

| URL | Component | Notes |
|-----|-----------|-------|
| `/` | `AppShellV2` | **Default. Always develop here.** |
| `/v1` | `AppShell` | Legacy shell, kept for reference only. Do not touch. |
| `*` | Redirect to `/` | |

**Critical rule:** All UI and feature work targets V2 exclusively. `src/ui/AppShell.tsx` is frozen — never modify it.

---

## Repository Layout

```
src/
├── types.ts                    # All shared TypeScript types (single source of truth)
├── utils.ts                    # Pure helpers (fnv1a32, crc32, chunkKey, clamp, etc.)
├── atlas.ts                    # Atlas packing logic (MaxRects bin packing)
├── terrain.ts                  # Autotile/terrain logic (cardinal, blob47, rpgmaker)
├── image.ts                    # PNG import, slice extraction, grid/manual slicing
│
├── animation/
│   └── playback.ts             # Animated tile frame resolver
│
├── level/
│   └── editor.ts               # Level mutation helpers (paintTile, bucketFill, etc.)
│
├── model/
│   ├── project.ts              # Default state factories (createEmptyProject, etc.)
│   ├── selectors.ts            # Derived state (getSelectedLevel, buildAtlasFromProject, etc.)
│   ├── store.tsx               # React context + useReducer store
│   └── exampleProject.ts       # Sample project for onboarding
│
├── export/
│   ├── index.ts                # Re-exports
│   ├── json.ts                 # Project save/load (JSON)
│   ├── tmap.ts                 # TMAP binary serialiser
│   └── runtimeSprites.ts       # Runtime sprite catalog builder
│
└── ui/
    ├── AppShell.tsx            # V1 shell — DO NOT MODIFY
    ├── app-shell/              # Shared sub-components (used by both V1 and V2)
    │   ├── useAppShellController.ts  # All editor logic (the brain)
    │   ├── workspaces.tsx      # AtlasWorkspace, LevelWorkspace canvas containers
    │   ├── inspectors.tsx      # AtlasInspector, LevelInspector, LevelSettingsInspector
    │   ├── pickers.tsx         # AtlasAssetsPanel, LevelAssetPicker overlay
    │   ├── navigator.tsx       # LevelNavigator (level/layer tree)
    │   ├── timeline.tsx        # AnimationWorkspace
    │   ├── shared.tsx          # TileAssetPreview, ToolButton, ZoomControls
    │   ├── canvas.ts           # Canvas render + hit-test helpers
    │   ├── constants.ts        # DEFAULT_ATLAS_GRID, DEFAULT_MANUAL_RECT, etc.
    │   ├── tileGrid.ts         # Tile grid utilities
    │   └── terrainLayout.ts    # Terrain slot layout helpers
    └── v2/
        ├── AppShellV2.tsx      # THE active shell — all new UI goes here
        └── styles-v2.css       # V2 CSS (scoped under .v2-* classes)
```

---

## Data Model

All types live in `src/types.ts`. Key entities:

### ProjectDocument
The top-level save file. Contains everything.

```typescript
interface ProjectDocument {
  version: number;
  name: string;
  sourceImages: SourceImageAsset[];   // imported PNG files (stored as dataUrls)
  slices: SliceAsset[];               // named rects within a sourceImage
  sprites: SpriteAsset[];             // atlas entries (slice → atlas sprite)
  tiles: TilesetTileAsset[];          // tileset entries (slice → tile ID)
  tilesets: TilesetAsset[];           // tileset metadata
  terrainSets: TerrainSet[];          // autotile rule sets
  spriteAnimations: SpriteAnimation[];
  animatedTiles: AnimatedTileAsset[];
  levels: LevelDocument[];
  atlasSettings: BuildOptions;
  idCounters: IdCounters;             // monotonically increasing, never reuse IDs
}
```

### LevelDocument
A single tile map. Tile data is stored in **chunks**, not as a flat array.

```typescript
interface LevelDocument {
  id: string;                         // e.g. "level-0"
  mapWidthTiles: number;
  mapHeightTiles: number;
  tileWidth: number;                  // pixels per tile (e.g. 16)
  tileHeight: number;
  chunkWidthTiles: number;            // e.g. 16 tiles per chunk
  chunkHeightTiles: number;
  tileIds: number[];                  // which tile IDs this level uses
  tilesetIds: number[];               // which tilesets are referenced
  layers: LevelLayer[];
  chunks: Record<string, TileChunk>; // key = chunkKey(layerId, chunkX, chunkY)
  collisions: CollisionObject[];
  markers: MarkerObject[];
}
```

**Chunk key format:** `"${layerId}:${chunkX}:${chunkY}"` — built by `chunkKey()` in `utils.ts`.

### EditorState
Ephemeral UI state (never saved to disk, not part of ProjectDocument).

```typescript
interface EditorState {
  workspace: "atlas" | "tileset" | "level" | "animation";
  selectedLevelId: string | null;
  selectedLayerId: string | null;
  levelTool: LevelTool;              // brush | erase | select | rect | bucket | terrain | hand | collisionRect | markerPoint | markerRect
  levelZoom: number;
  levelPanX: number;
  levelPanY: number;
  slicerZoom: number;
  slicerMode: "grid" | "manual";
  savedBrushes: TileBrush[];
  activeBrushId: number | null;
  // ... more editor-only fields
}
```

---

## State Management

**Pattern:** Single React context with `useReducer`. Immutable updates throughout.

```
useProjectStore() → { state: AppState, dispatch: (action: ProjectAction) => void }
```

- `AppState` = `{ project, editor, error, busy, undoStack, redoStack }`
- All mutations go through `dispatch(action)` — never mutate state directly
- History (undo/redo) tracks only level mutations (`updateLevel`, `replaceLevelChunks`, `commitLevelStroke`)
- History limit: 100 entries

### Key Actions

| Action type | Effect |
|------------|--------|
| `setWorkspace` | Switch between atlas / level / animation |
| `replaceProject` | Load a new project (resets editor selection) |
| `addSourceImages` | Import PNG files |
| `addSlices` | Add slice definitions from slicer |
| `addLevelTiles` | Register slice→tile mapping on a level |
| `updateLevel` | Full level replacement (tracked for undo) |
| `replaceLevelChunks` | Replace all chunks (tracked for undo) |
| `commitLevelStroke` | Push a stroke to undo stack |
| `upsertTerrainSet` | Create/update terrain rule set |
| `saveBrush` / `deleteBrush` | Manage custom tile brushes |
| `setActiveBrush` | Select brush (ID -1 = clipboard) |

---

## Controller Hook

`useAppShellController()` in `src/ui/app-shell/useAppShellController.ts` is the single source of all editor behaviour. It:

- Reads from `useProjectStore()`
- Manages local UI state (pan, zoom, selection, clipboard, etc.)
- Handles all pointer events (draw, erase, select, pan)
- Drives atlas builds
- Handles file I/O (import, save, load, export)

Both AppShellV2 and AppShell consume this same hook. Do not duplicate logic — extend the hook.

---

## Workspaces

### Atlas Workspace (`workspace === "atlas"`)
Two modules toggled by `atlasModule`:
- **`pack`** — View the packed atlas pages, drag-reorder sprites
- **`slicer`** — Draw slice rects on a source image (grid or manual mode)

Flow: import PNG → slice → add to atlas → pack → export

### Level Workspace (`workspace === "level"`)
Canvas-based tile map editor. Key concepts:

- **Layers:** Ordered, each with capability flags (`hasTiles`, `hasCollision`, `hasMarkers`)
- **Chunks:** Tile data is stored in 16×16 tile chunks (configurable). Only non-empty chunks exist.
- **Tools:** brush, erase, rect fill, bucket fill, select (for copy/cut/paste), terrain, collision rect, marker point/rect, hand pan
- **Brushes:** 1×N or N×M multi-tile stamps. Clipboard brush uses ID `-1`.
- **Terrain sets:** Autotile rule sets. Modes: `cardinal` (4-dir), `subtile`, `blob47` (47-bitmask), `rpgmaker`

### Animation Workspace (`workspace === "animation"`)
Frame-by-frame sprite animation editor. Separate from animated tiles (which are tile-level animation, not sprite-level).

---

## Export Formats

### Atlas (`exportAtlas`)
Calls `buildAtlasFromProject` → `buildProjectJsonBlob` + PNG pages.

Output: a ZIP containing:
- `atlas.bin` — binary sprite catalog (custom format)
- `atlas_meta.bin` — atlas metadata
- `atlas_debug.json` — human-readable dump
- `page_0.png`, `page_1.png`, … — packed sprite sheet pages

### Level / TMAP (`exportLevel`)
`exportTilemapBin` in `src/export/tmap.ts`.

**Binary format magic:** `0x50414d54` (`"TMAP"` little-endian)

Structure:
```
Header (72 bytes)
  magic, version, fileSize, crc32
  mapWidth/Height (tiles), tileWidth/Height (px), chunkWidth/Height (tiles)
  tilesetCount, layerCount, chunkCount, collisionCount, markerCount, stringCount
  [section offsets]

Tileset definitions (28 bytes each)
  nameHash, firstTileId, firstAtlasSpriteId, tileCount, tileWidth, tileHeight, columns, flags

Layer definitions (50 bytes each)
  nameHash, widthTiles, heightTiles, flags (hasTiles|hasCollision|hasMarkers|foreground|repeatX|repeatY)
  parallaxX, parallaxY (fixed 8.8), offsetX, offsetY

Chunk definitions (22 bytes each)
  layerIndex, chunkX, chunkY, tileDataOffset, tileCount

Tile data (8 bytes per tile cell)
  tileId (runtime sprite ID), flags

Collision objects (28 bytes each)
  id, layerIndex, type, flags, x, y, w, h, userData0, userData1

Marker objects (44 bytes each)
  id, layerIndex, shape, flags, x, y, w, h
  typeStrIndex, eventStrIndex, nameStrIndex
  userData0, userData1, propertiesCount

String table
  [8-byte entries: offset + length pairs]
  [string blob: null-terminated UTF-8]
```

All multi-byte values are **little-endian**. Coordinates are in **pixel space** (not tile space).

---

## CSS Conventions (V2)

All V2 styles are in `src/ui/v2/styles-v2.css`, scoped under `.v2-*` class names.

Key layout classes:
- `.v2-shell` — CSS grid root, `workspace-atlas` / `workspace-level` / `workspace-animation` modifier
- `.v2-topbar` — top bar with logo, workspace tabs, file/export menus
- `.v2-sidebar-left` — left panel (navigator or atlas assets)
- `.v2-workspace` — main canvas area
- `.v2-sidebar-right` — right panel (inspector + tile palette)
- `.v2-toolbar` — floating bottom toolbar (tools, zoom, undo)

Design tokens (CSS variables):
```css
--bg-0        /* darkest background */
--bg-1        /* panel background */
--bg-2        /* elevated surface */
--border      /* subtle border */
--accent      /* primary accent (gold) */
--text        /* primary text */
--text-muted  /* secondary text */
```

---

## PS2 Runtime Integration

This editor's output is consumed by a PS2 C/C++ engine. Key contracts:

### Sprite IDs
The runtime uses **name hashes** (FNV-1a 32-bit) to look up sprites, not sequential IDs. `fnv1a32()` in `utils.ts` must match the PS2-side implementation exactly.

### Tile IDs
`tileId` in `TilesetTileAsset` is **not** the atlas sprite ID. At export time, `resolveRuntimeSpriteIdForCell` maps tile → sprite using the runtime catalog. The PS2 engine receives runtime sprite IDs in chunk tile data.

### Chunk Layout
The PS2 engine expects tile data as a flat array of `(spriteId: u16, flags: u16)` pairs in **row-major order** within each chunk. Empty tiles have `spriteId = 0`.

### Collision & Marker Objects
- Collision: axis-aligned rect, typed (`Solid`, `OneWay`, `Trigger`, `Hurt`), with two u32 `userData` fields for engine-specific data.
- Marker: can be `Point` or `Rect` shape; carries a `type` string, `event` string, `name` string, and a `properties` map (key-value string pairs). Strings are interned in the file's string table.

### Fixed-Point Numbers
`parallaxX` / `parallaxY` are stored as **fixed 8.8** (upper 8 bits = integer part, lower 8 bits = fraction). Use `packFixed88()` in `utils.ts`.

---

## Development Rules

1. **V2 only.** Never modify `src/ui/AppShell.tsx`. The V1 shell at `/v1` is frozen.
2. **No mutation.** All state updates return new objects. Spread, don't assign.
3. **Controller is the brain.** Add editor logic to `useAppShellController.ts`, not inside components.
4. **ID counters are monotonic.** Never recycle an ID. Increment `idCounters.*` when creating entities.
5. **Chunk keys.** Always use `chunkKey(layerId, chunkX, chunkY)` — do not construct the string manually.
6. **Export is separate from editor.** `src/export/` contains no React. Keep it pure.
7. **Types first.** Add new fields to `types.ts` before implementing them. Keep `EditorState` and `ProjectDocument` clearly separated.
