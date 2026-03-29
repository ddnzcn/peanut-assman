import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { createDefaultLevel, createEmptyProject, DEFAULT_EDITOR_STATE } from "./project";
import type {
  AppState,
  HistorySnapshot,
  LevelDocument,
  LevelHistoryPatch,
  LevelLayer,
  ProjectAction,
  ProjectDocument,
  TileChunk,
} from "../types";
import { chunkKey, clamp, fnv1a32 } from "../utils";

const HISTORY_LIMIT = 100;
const TRACKED_ACTIONS = new Set<ProjectAction["type"]>(["updateLevel", "replaceLevelChunks"]);

const initialState: AppState = {
  project: createEmptyProject(),
  editor: DEFAULT_EDITOR_STATE,
  error: null,
  busy: false,
  undoStack: [],
  redoStack: [],
};

interface StoreValue {
  state: AppState;
  dispatch: React.Dispatch<ProjectAction>;
}

const ProjectStoreContext = createContext<StoreValue | null>(null);

export function ProjectStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <ProjectStoreContext.Provider value={value}>{children}</ProjectStoreContext.Provider>;
}

export function useProjectStore(): StoreValue {
  const context = useContext(ProjectStoreContext);
  if (!context) {
    throw new Error("Project store is not available.");
  }
  return context;
}

function createLevelHistorySnapshot(previousState: AppState, nextState: AppState, levelId: string): HistorySnapshot | null {
  const previousLevel = previousState.project.levels.find((level) => level.id === levelId);
  const nextLevel = nextState.project.levels.find((level) => level.id === levelId);
  if (!previousLevel || !nextLevel) {
    return null;
  }
  const previousPatch = buildLevelHistoryPatch(nextLevel, previousLevel);
  const nextPatch = buildLevelHistoryPatch(previousLevel, nextLevel);
  if (!previousPatch || !nextPatch) {
    return null;
  }
  return {
    levelId,
    previousPatch,
    nextPatch,
  };
}

function createHistorySnapshot(state: AppState, action: ProjectAction, nextState: AppState): HistorySnapshot | null {
  if (action.type === "updateLevel") {
    return createLevelHistorySnapshot(state, nextState, action.level.id);
  }
  if (action.type === "replaceLevelChunks") {
    return createLevelHistorySnapshot(state, nextState, action.levelId);
  }
  return null;
}

function pushHistoryEntry(state: AppState, nextState: AppState, snapshot: HistorySnapshot): AppState {
  return {
    ...nextState,
    undoStack: [...state.undoStack, snapshot].slice(-HISTORY_LIMIT),
    redoStack: [],
  };
}

function applyHistorySnapshot(
  state: AppState,
  snapshot: HistorySnapshot,
  direction: "undo" | "redo",
  history: Pick<AppState, "undoStack" | "redoStack">,
): AppState {
  return {
    ...state,
    project: {
      ...state.project,
      levels: state.project.levels.map((level) =>
        level.id === snapshot.levelId
          ? applyLevelHistoryPatch(level, direction === "undo" ? snapshot.previousPatch : snapshot.nextPatch)
          : level,
      ),
    },
    undoStack: history.undoStack,
    redoStack: history.redoStack,
  };
}

function buildLevelHistoryPatch(fromLevel: LevelDocument, toLevel: LevelDocument): LevelHistoryPatch | null {
  const patch: LevelHistoryPatch = {};

  if (fromLevel.name !== toLevel.name) patch.name = toLevel.name;
  if (fromLevel.mapWidthTiles !== toLevel.mapWidthTiles) patch.mapWidthTiles = toLevel.mapWidthTiles;
  if (fromLevel.mapHeightTiles !== toLevel.mapHeightTiles) patch.mapHeightTiles = toLevel.mapHeightTiles;
  if (fromLevel.tileWidth !== toLevel.tileWidth) patch.tileWidth = toLevel.tileWidth;
  if (fromLevel.tileHeight !== toLevel.tileHeight) patch.tileHeight = toLevel.tileHeight;
  if (fromLevel.chunkWidthTiles !== toLevel.chunkWidthTiles) patch.chunkWidthTiles = toLevel.chunkWidthTiles;
  if (fromLevel.chunkHeightTiles !== toLevel.chunkHeightTiles) patch.chunkHeightTiles = toLevel.chunkHeightTiles;
  if (fromLevel.tileIds !== toLevel.tileIds) patch.tileIds = [...toLevel.tileIds];
  if (fromLevel.tilesetIds !== toLevel.tilesetIds) patch.tilesetIds = [...toLevel.tilesetIds];
  if (fromLevel.layers !== toLevel.layers) patch.layers = structuredClone(toLevel.layers);
  if (fromLevel.collisions !== toLevel.collisions) patch.collisions = structuredClone(toLevel.collisions);
  if (fromLevel.markers !== toLevel.markers) patch.markers = structuredClone(toLevel.markers);

  if (fromLevel.chunks !== toLevel.chunks) {
    const chunkKeys = new Set([...Object.keys(fromLevel.chunks), ...Object.keys(toLevel.chunks)]);
    const chunksPatch: Record<string, TileChunk | null> = {};
    chunkKeys.forEach((key) => {
      if (fromLevel.chunks[key] !== toLevel.chunks[key]) {
        chunksPatch[key] = toLevel.chunks[key] ? structuredClone(toLevel.chunks[key]) : null;
      }
    });
    if (Object.keys(chunksPatch).length) {
      patch.chunks = chunksPatch;
    }
  }

  return Object.keys(patch).length ? patch : null;
}

function applyLevelHistoryPatch(level: LevelDocument, patch: LevelHistoryPatch): LevelDocument {
  const nextLevel: LevelDocument = { ...level };

  if ("name" in patch) nextLevel.name = patch.name!;
  if ("mapWidthTiles" in patch) nextLevel.mapWidthTiles = patch.mapWidthTiles!;
  if ("mapHeightTiles" in patch) nextLevel.mapHeightTiles = patch.mapHeightTiles!;
  if ("tileWidth" in patch) nextLevel.tileWidth = patch.tileWidth!;
  if ("tileHeight" in patch) nextLevel.tileHeight = patch.tileHeight!;
  if ("chunkWidthTiles" in patch) nextLevel.chunkWidthTiles = patch.chunkWidthTiles!;
  if ("chunkHeightTiles" in patch) nextLevel.chunkHeightTiles = patch.chunkHeightTiles!;
  if ("tileIds" in patch) nextLevel.tileIds = [...patch.tileIds!];
  if ("tilesetIds" in patch) nextLevel.tilesetIds = [...patch.tilesetIds!];
  if ("layers" in patch) nextLevel.layers = structuredClone(patch.layers!);
  if ("collisions" in patch) nextLevel.collisions = structuredClone(patch.collisions!);
  if ("markers" in patch) nextLevel.markers = structuredClone(patch.markers!);
  if ("chunks" in patch) {
    const nextChunks = { ...level.chunks };
    Object.entries(patch.chunks!).forEach(([key, chunk]) => {
      if (chunk === null) {
        delete nextChunks[key];
      } else {
        nextChunks[key] = structuredClone(chunk);
      }
    });
    nextLevel.chunks = nextChunks;
  }

  return nextLevel;
}

function reducer(state: AppState, action: ProjectAction): AppState {
  if (action.type === "undo") {
    if (!state.undoStack.length) {
      return state;
    }
    const previous = state.undoStack[state.undoStack.length - 1];
    return applyHistorySnapshot(state, previous, "undo", {
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, previous].slice(-HISTORY_LIMIT),
    });
  }

  if (action.type === "redo") {
    if (!state.redoStack.length) {
      return state;
    }
    const next = state.redoStack[state.redoStack.length - 1];
    return applyHistorySnapshot(state, next, "redo", {
      undoStack: [...state.undoStack, next].slice(-HISTORY_LIMIT),
      redoStack: state.redoStack.slice(0, -1),
    });
  }

  const nextState = reducePresent(state, action);
  if (nextState === state) {
    return state;
  }
  if (TRACKED_ACTIONS.has(action.type)) {
    const snapshot = createHistorySnapshot(state, action, nextState);
    if (snapshot) {
      return pushHistoryEntry(state, nextState, snapshot);
    }
  }
  return nextState;
}

function reducePresent(state: AppState, action: ProjectAction): AppState {
  switch (action.type) {
    case "setWorkspace":
      return { ...state, editor: { ...state.editor, workspace: action.workspace } };
    case "setError":
      return { ...state, error: action.error };
    case "setBusy":
      return { ...state, busy: action.busy };
    case "setSelectedSourceImage":
      return {
        ...state,
        editor: { ...state.editor, selectedSourceImageId: action.sourceImageId, selectedSliceIds: [] },
      };
    case "setSelectedSlices":
      return { ...state, editor: { ...state.editor, selectedSliceIds: action.sliceIds } };
    case "toggleSliceSelection": {
      const selected = state.editor.selectedSliceIds.includes(action.sliceId)
        ? state.editor.selectedSliceIds.filter((sliceId) => sliceId !== action.sliceId)
        : [...state.editor.selectedSliceIds, action.sliceId];
      return { ...state, editor: { ...state.editor, selectedSliceIds: selected } };
    }
    case "setSelectedTileset":
      return {
        ...state,
        editor: {
          ...state.editor,
          selectedTilesetId: action.tilesetId,
          selectedTerrainSetId:
            state.project.terrainSets.find((terrainSet) => terrainSet.tilesetId === action.tilesetId)?.id ?? null,
        },
      };
    case "setSelectedTerrainSet":
      return { ...state, editor: { ...state.editor, selectedTerrainSetId: action.terrainSetId } };
    case "setSelectedLevel":
      return { ...state, editor: { ...state.editor, selectedLevelId: action.levelId } };
    case "setSelectedLayer":
      return { ...state, editor: { ...state.editor, selectedLayerId: action.layerId } };
    case "setSelectedCollision":
      return { ...state, editor: { ...state.editor, selectedCollisionId: action.collisionId } };
    case "setSelectedMarker":
      return { ...state, editor: { ...state.editor, selectedMarkerId: action.markerId } };
    case "setLevelTool":
      return { ...state, editor: { ...state.editor, levelTool: action.tool } };
    case "setSlicerZoom":
      return { ...state, editor: { ...state.editor, slicerZoom: clamp(action.zoom, 0.25, 8) } };
    case "setLevelZoom":
      return { ...state, editor: { ...state.editor, levelZoom: clamp(action.zoom, 0.5, 8) } };
    case "panLevel":
      return {
        ...state,
        editor: {
          ...state.editor,
          levelPanX: state.editor.levelPanX + action.deltaX,
          levelPanY: state.editor.levelPanY + action.deltaY,
        },
      };
    case "setSlicerMode":
      return { ...state, editor: { ...state.editor, slicerMode: action.mode } };
    case "setTilesetDraft":
      return {
        ...state,
        editor: { ...state.editor, tilesetDraft: { ...state.editor.tilesetDraft, ...action.draft } },
      };
    case "toggleGrid":
      return { ...state, editor: { ...state.editor, gridVisible: !state.editor.gridVisible } };
    case "toggleChunkOverlay":
      return {
        ...state,
        editor: { ...state.editor, chunkOverlayVisible: !state.editor.chunkOverlayVisible },
      };
    case "toggleCullingOverlay":
      return {
        ...state,
        editor: { ...state.editor, cullingOverlayVisible: !state.editor.cullingOverlayVisible },
      };
    case "replaceProject": {
      const selectedLevelId = action.project.levels[0]?.id ?? null;
      const selectedLayerId = action.project.levels[0]?.layers[0]?.id ?? null;
      return {
        ...state,
        project: action.project,
        editor: {
          ...state.editor,
          selectedLevelId,
          selectedLayerId,
          selectedTilesetId: action.project.tilesets[0]?.id ?? null,
          selectedTerrainSetId: action.project.terrainSets[0]?.id ?? null,
          selectedSourceImageId: action.project.sourceImages[0]?.id ?? null,
          selectedSliceIds: [],
        },
      };
    }
    case "updateAtlasSettings":
      return {
        ...state,
        project: {
          ...state.project,
          atlasSettings: { ...state.project.atlasSettings, ...action.patch },
        },
      };
    case "addSourceImages":
      return {
        ...state,
        project: {
          ...state.project,
          sourceImages: [...state.project.sourceImages, ...action.sources],
          idCounters: {
            ...state.project.idCounters,
            sourceImage: state.project.idCounters.sourceImage + action.sources.length,
          },
        },
        editor: {
          ...state.editor,
          selectedSourceImageId: action.sources[0]?.id ?? state.editor.selectedSourceImageId,
        },
      };
    case "addSlices":
      return {
        ...state,
        project: {
          ...state.project,
          slices: [...state.project.slices, ...action.slices],
          sprites: [...state.project.sprites, ...(action.sprites ?? [])],
          idCounters: {
            ...state.project.idCounters,
            slice: state.project.idCounters.slice + action.slices.length,
            sprite: state.project.idCounters.sprite + (action.sprites?.length ?? 0),
          },
        },
        editor: { ...state.editor, selectedSliceIds: action.slices.map((slice) => slice.id) },
      };
    case "addSlicesToAtlas": {
      const existingBySliceId = new Map(state.project.sprites.map((sprite) => [sprite.sliceId, sprite]));
      const sliceById = new Map(state.project.slices.map((slice) => [slice.id, slice]));
      const updatedSprites = state.project.sprites.map((sprite) =>
        action.sliceIds.includes(sprite.sliceId) ? { ...sprite, includeInAtlas: true } : sprite,
      );
      const newSprites = action.sliceIds.flatMap((sliceId, index) => {
        const existing = existingBySliceId.get(sliceId);
        const slice = sliceById.get(sliceId);
        if (existing || !slice) {
          return [];
        }
        const name = `${slice.name}.png`;
        return [{
          id: state.project.idCounters.sprite + index,
          sliceId,
          name,
          nameHash: fnv1a32(name),
          includeInAtlas: true,
        }];
      });
      return {
        ...state,
        project: {
          ...state.project,
          sprites: [...updatedSprites, ...newSprites],
          idCounters: {
            ...state.project.idCounters,
            sprite: state.project.idCounters.sprite + newSprites.length,
          },
        },
      };
    }
    case "addLevelTiles": {
      const levelIndex = state.project.levels.findIndex((entry) => entry.id === action.levelId);
      if (levelIndex < 0) {
        return state;
      }

      const level = state.project.levels[levelIndex];
      const sliceById = new Map(state.project.slices.map((slice) => [slice.id, slice]));
      const spriteBySliceId = new Map(state.project.sprites.map((sprite) => [sprite.sliceId, sprite]));
      const tileBySliceId = new Map(state.project.tiles.map((tile) => [tile.sliceId, tile]));

      let nextSpriteId = state.project.idCounters.sprite;
      let nextTileId = state.project.idCounters.tile;
      const newSprites: ProjectDocument["sprites"] = [];
      const updatedSprites = state.project.sprites.map((sprite) =>
        action.sliceIds.includes(sprite.sliceId) ? { ...sprite, includeInAtlas: true } : sprite,
      );
      const newTiles: ProjectDocument["tiles"] = [];
      const addedTileIds: number[] = [];

      for (const sliceId of action.sliceIds) {
        const slice = sliceById.get(sliceId);
        if (!slice || (slice.kind !== "tile" && slice.kind !== "both")) {
          continue;
        }

        let sprite = spriteBySliceId.get(sliceId);
        if (!sprite) {
          const name = `${slice.name}.png`;
          sprite = {
            id: nextSpriteId,
            sliceId,
            name,
            nameHash: fnv1a32(name),
            includeInAtlas: true,
          };
          nextSpriteId += 1;
          newSprites.push(sprite);
          spriteBySliceId.set(sliceId, sprite);
        }

        let tile = tileBySliceId.get(sliceId);
        if (!tile) {
          tile = {
            tileId: nextTileId,
            sliceId,
            spriteId: sprite.id,
            name: slice.name,
          };
          nextTileId += 1;
          newTiles.push(tile);
          tileBySliceId.set(sliceId, tile);
        }

        addedTileIds.push(tile.tileId);
      }

      if (!addedTileIds.length && !newSprites.length && !newTiles.length) {
        return state;
      }

      const nextLevels = [...state.project.levels];
      nextLevels[levelIndex] = {
        ...level,
        tileIds: [...new Set([...level.tileIds, ...addedTileIds])],
      };

      return {
        ...state,
        project: {
          ...state.project,
          sprites: [...updatedSprites, ...newSprites],
          tiles: [...state.project.tiles, ...newTiles],
          levels: nextLevels,
          idCounters: {
            ...state.project.idCounters,
            sprite: nextSpriteId,
            tile: nextTileId,
          },
        },
      };
    }
    case "removeSlicesFromAtlas":
      return {
        ...state,
        project: {
          ...state.project,
          sprites: state.project.sprites.map((sprite) =>
            action.sliceIds.includes(sprite.sliceId) ? { ...sprite, includeInAtlas: false } : sprite,
          ),
        },
      };
    case "updateSliceKinds":
      return {
        ...state,
        project: {
          ...state.project,
          slices: state.project.slices.map((slice) =>
            action.sliceIds.includes(slice.id) ? { ...slice, kind: action.kind } : slice,
          ),
        },
      };
    case "publishTileset": {
      const nextTilesets = [
        ...state.project.tilesets.filter((tileset) => tileset.id !== action.tileset.id),
        action.tileset,
      ].sort((left, right) => left.id - right.id);
      const level = state.project.levels[0] ?? createDefaultLevel();
      const updatedLevel: LevelDocument = level.tilesetIds.includes(action.tileset.id)
        ? level
        : { ...level, tilesetIds: [...level.tilesetIds, action.tileset.id] };
      return {
        ...state,
        project: {
          ...state.project,
          tilesets: nextTilesets,
          sprites: [...state.project.sprites, ...action.sprites.filter((sprite) => !state.project.sprites.some((current) => current.id === sprite.id))],
          tiles: [...state.project.tiles, ...action.tiles.filter((tile) => !state.project.tiles.some((current) => current.tileId === tile.tileId))],
          levels: [updatedLevel, ...state.project.levels.slice(1)],
          idCounters: {
            ...state.project.idCounters,
            tileset: Math.max(state.project.idCounters.tileset, action.tileset.id + 1),
            sprite:
              Math.max(
                state.project.idCounters.sprite,
                ...action.sprites.map((sprite) => sprite.id + 1),
              ) || state.project.idCounters.sprite,
            tile:
              Math.max(
                state.project.idCounters.tile,
                ...action.tiles.map((tile) => tile.tileId + 1),
              ) || state.project.idCounters.tile,
          },
        },
        editor: { ...state.editor, selectedTilesetId: action.tileset.id, workspace: "level" },
      };
    }
    case "upsertTerrainSet": {
      const terrainSets = [
        ...state.project.terrainSets.filter((entry) => entry.id !== action.terrainSet.id),
        action.terrainSet,
      ].sort((left, right) => left.id - right.id);
      return {
        ...state,
        project: {
          ...state.project,
          terrainSets,
          idCounters: {
            ...state.project.idCounters,
            terrainSet: Math.max(state.project.idCounters.terrainSet, action.terrainSet.id + 1),
          },
        },
        editor: {
          ...state.editor,
          selectedTerrainSetId: action.terrainSet.id,
        },
      };
    }
    case "removeTerrainSet": {
      const terrainSets = state.project.terrainSets.filter((entry) => entry.id !== action.terrainSetId);
      return {
        ...state,
        project: { ...state.project, terrainSets },
        editor: {
          ...state.editor,
          selectedTerrainSetId:
            state.editor.selectedTerrainSetId === action.terrainSetId
              ? terrainSets[0]?.id ?? null
              : state.editor.selectedTerrainSetId,
        },
      };
    }
    case "reorderSprites": {
      if (
        action.fromIndex < 0 ||
        action.toIndex < 0 ||
        action.fromIndex >= state.project.sprites.length ||
        action.toIndex >= state.project.sprites.length
      ) {
        return state;
      }
      const sprites = [...state.project.sprites];
      const [moved] = sprites.splice(action.fromIndex, 1);
      sprites.splice(action.toIndex, 0, moved);
      return {
        ...state,
        project: {
          ...state.project,
          sprites,
        },
      };
    }
    case "addLevel":
      return {
        ...state,
        project: {
          ...state.project,
          levels: [...state.project.levels, action.level],
          idCounters: {
            ...state.project.idCounters,
            level: Math.max(state.project.idCounters.level, Number(action.level.id.split("-").pop() ?? state.project.idCounters.level) + 1),
            layer: Math.max(
              state.project.idCounters.layer,
              ...action.level.layers.map((layer) => Number(layer.id.split("-").pop() ?? state.project.idCounters.layer) + 1),
            ),
          },
        },
        editor: {
          ...state.editor,
          selectedLevelId: action.level.id,
          selectedLayerId: action.level.layers[0]?.id ?? null,
        },
      };
    case "removeLevel": {
      if (state.project.levels.length <= 1) {
        return state;
      }
      const levels = state.project.levels.filter((level) => level.id !== action.levelId);
      const selectedLevel = levels.find((level) => level.id === state.editor.selectedLevelId) ?? levels[0] ?? null;
      return {
        ...state,
        project: { ...state.project, levels },
        editor: {
          ...state.editor,
          selectedLevelId: selectedLevel?.id ?? null,
          selectedLayerId: selectedLevel?.layers[0]?.id ?? null,
        },
      };
    }
    case "addLayer":
      return {
        ...state,
        project: {
          ...state.project,
          levels: state.project.levels.map((level) =>
            level.id === action.levelId ? { ...level, layers: [...level.layers, action.layer] } : level,
          ),
          idCounters: {
            ...state.project.idCounters,
            layer: Math.max(state.project.idCounters.layer, Number(action.layer.id.split("-").pop() ?? state.project.idCounters.layer) + 1),
          },
        },
        editor: { ...state.editor, selectedLayerId: action.layer.id },
      };
    case "reorderLayer": {
      const level = state.project.levels.find((entry) => entry.id === action.levelId);
      if (!level) {
        return state;
      }
      const index = level.layers.findIndex((entry) => entry.id === action.layerId);
      if (index < 0) {
        return state;
      }
      const nextIndex =
        typeof action.toIndex === "number"
          ? action.toIndex
          : action.direction === "up"
            ? index - 1
            : index + 1;
      if (nextIndex < 0 || nextIndex >= level.layers.length) {
        return state;
      }
      const layers = [...level.layers];
      const [moved] = layers.splice(index, 1);
      layers.splice(nextIndex, 0, moved);
      return {
        ...state,
        project: {
          ...state.project,
          levels: state.project.levels.map((entry) =>
            entry.id === action.levelId ? { ...entry, layers } : entry,
          ),
        },
      };
    }
    case "removeLayer": {
      const level = state.project.levels.find((entry) => entry.id === action.levelId);
      if (!level || level.layers.length <= 1) {
        return state;
      }
      const layers = level.layers.filter((entry) => entry.id !== action.layerId);
      const chunks = Object.fromEntries(
        Object.entries(level.chunks).filter(([key]) => !key.startsWith(`${action.layerId}:`)),
      );
      const collisions = level.collisions.filter((entry) => entry.layerId !== action.layerId);
      const markers = level.markers.filter((entry) => entry.layerId !== action.layerId);
      const levels = state.project.levels.map((entry) =>
        entry.id === action.levelId ? { ...entry, layers, chunks, collisions, markers } : entry,
      );
      const selectedLayer = layers.find((entry) => entry.id === state.editor.selectedLayerId) ?? layers[0] ?? null;
      return {
        ...state,
        project: { ...state.project, levels },
        editor: {
          ...state.editor,
          selectedLayerId: selectedLayer?.id ?? null,
          selectedCollisionId: null,
          selectedMarkerId: null,
        },
      };
    }
    case "updateLevel":
      return {
        ...state,
        project: {
          ...state.project,
          levels: state.project.levels.map((level) => (level.id === action.level.id ? action.level : level)),
        },
      };
    case "replaceLevelChunks":
      return {
        ...state,
        project: {
          ...state.project,
          levels: state.project.levels.map((level) =>
            level.id === action.levelId ? { ...level, chunks: action.chunks } : level,
          ),
        },
      };
    case "setAtlasHoveredSprite":
      return { ...state, editor: { ...state.editor, atlasHoveredSpriteId: action.spriteId } };
    default:
      return state;
  }
}

export function upsertChunk(
  level: LevelDocument,
  layer: LevelLayer,
  chunkX: number,
  chunkY: number,
  chunk: TileChunk | null,
): LevelDocument {
  const key = chunkKey(layer.id, chunkX, chunkY);
  const nextChunks = { ...level.chunks };
  if (chunk) {
    nextChunks[key] = chunk;
  } else {
    delete nextChunks[key];
  }
  return { ...level, chunks: nextChunks };
}
