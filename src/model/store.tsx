import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { createEmptyProject, DEFAULT_EDITOR_STATE } from "./project";
import type {
  AnimatedTileAsset,
  AppState,
  ProjectAction,
  ProjectDocument,
  SceneDocument,
  SceneHistorySnapshot,
  SceneNode,
  SpriteAnimation,
} from "../types";
import { clamp, fnv1a32 } from "../utils";
import {
  duplicateNode,
  findNode,
  findParent,
  insertNode,
  moveNode,
  removeNode,
  reorderNode,
  updateNode,
} from "../scene/helpers";

const HISTORY_LIMIT = 100;
const TRACKED_SCENE_ACTIONS = new Set<ProjectAction["type"]>([
  "updateSceneNode",
  "updateSceneNodeData",
  "addChildNode",
  "removeNode",
  "duplicateNode",
  "moveNode",
  "reorderNode",
]);

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

function createSceneSnapshot(
  previousScenes: SceneDocument[],
  nextScenes: SceneDocument[],
  sceneId: string,
): SceneHistorySnapshot | null {
  const prev = previousScenes.find((s) => s.id === sceneId);
  const next = nextScenes.find((s) => s.id === sceneId);
  if (!prev || !next || prev.root === next.root) return null;
  return {
    sceneId,
    previousRoot: structuredClone(prev.root),
    nextRoot: structuredClone(next.root),
  };
}

function applySceneSnapshot(
  state: AppState,
  snapshot: SceneHistorySnapshot,
  direction: "undo" | "redo",
  history: Pick<AppState, "undoStack" | "redoStack">,
): AppState {
  const targetRoot = direction === "undo" ? snapshot.previousRoot : snapshot.nextRoot;
  return {
    ...state,
    project: {
      ...state.project,
      scenes: state.project.scenes.map((scene) =>
        scene.id === snapshot.sceneId ? { ...scene, root: targetRoot } : scene,
      ),
    },
    undoStack: history.undoStack,
    redoStack: history.redoStack,
  };
}

function updateSceneRoot(
  scenes: SceneDocument[],
  sceneId: string,
  updater: (root: SceneNode) => SceneNode,
): SceneDocument[] {
  return scenes.map((scene) =>
    scene.id === sceneId ? { ...scene, root: updater(scene.root) } : scene,
  );
}

function reducer(state: AppState, action: ProjectAction): AppState {
  if (action.type === "undo") {
    if (!state.undoStack.length) return state;
    const previous = state.undoStack[state.undoStack.length - 1];
    return applySceneSnapshot(state, previous, "undo", {
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, previous].slice(-HISTORY_LIMIT),
    });
  }

  if (action.type === "redo") {
    if (!state.redoStack.length) return state;
    const next = state.redoStack[state.redoStack.length - 1];
    return applySceneSnapshot(state, next, "redo", {
      undoStack: [...state.undoStack, next].slice(-HISTORY_LIMIT),
      redoStack: state.redoStack.slice(0, -1),
    });
  }

  if (action.type === "commitSceneStroke") {
    if (action.baseRoot === action.currentRoot) return state;
    const snapshot: SceneHistorySnapshot = {
      sceneId: action.sceneId,
      previousRoot: structuredClone(action.baseRoot),
      nextRoot: structuredClone(action.currentRoot),
    };
    return {
      ...state,
      undoStack: [...state.undoStack, snapshot].slice(-HISTORY_LIMIT),
      redoStack: [],
    };
  }

  const nextState = reducePresent(state, action);
  if (nextState === state) return state;

  if (TRACKED_SCENE_ACTIONS.has(action.type) && "sceneId" in action) {
    const snapshot = createSceneSnapshot(
      state.project.scenes,
      nextState.project.scenes,
      (action as { sceneId: string }).sceneId,
    );
    if (snapshot) {
      return {
        ...nextState,
        undoStack: [...state.undoStack, snapshot].slice(-HISTORY_LIMIT),
        redoStack: [],
      };
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
      const project = normalizeProject(action.project);
      const selectedSceneId = project.scenes[0]?.id ?? null;
      return {
        ...state,
        project,
        editor: {
          ...state.editor,
          selectedSceneId,
          selectedNodeId: null,
          selectedTilesetId: project.tilesets[0]?.id ?? null,
          selectedTerrainSetId: project.terrainSets[0]?.id ?? null,
          selectedSourceImageId: project.sourceImages[0]?.id ?? null,
          selectedSpriteAnimationId: null,
          selectedAnimatedTileId: null,
          animCurrentFrame: 0,
          animIsPlaying: false,
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
    case "removeSourceImage": {
      const removedSliceIds = new Set(
        state.project.slices
          .filter((s) => s.sourceImageId === action.sourceImageId)
          .map((s) => s.id),
      );
      const removedSpriteIds = new Set(
        state.project.sprites
          .filter((sp) => removedSliceIds.has(sp.sliceId))
          .map((sp) => sp.id),
      );
      const nextSourceImages = state.project.sourceImages.filter((s) => s.id !== action.sourceImageId);
      const nextSlices = state.project.slices.filter((s) => s.sourceImageId !== action.sourceImageId);
      const nextSprites = state.project.sprites.filter((sp) => !removedSpriteIds.has(sp.id));
      return {
        ...state,
        project: {
          ...state.project,
          sourceImages: nextSourceImages,
          slices: nextSlices,
          sprites: nextSprites,
        },
        editor: {
          ...state.editor,
          selectedSourceImageId:
            state.editor.selectedSourceImageId === action.sourceImageId
              ? (nextSourceImages[0]?.id ?? null)
              : state.editor.selectedSourceImageId,
          selectedSliceIds: state.editor.selectedSliceIds.filter((id) => !removedSliceIds.has(id)),
        },
      };
    }
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
        if (existing || !slice) return [];
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
    case "addSceneTiles": {
      const scene = state.project.scenes.find((s) => s.id === action.sceneId);
      if (!scene) return state;
      const node = findNode(scene.root, action.nodeId);
      if (!node || node.data.type !== "TileMap") return state;

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
        if (!slice || (slice.kind !== "tile" && slice.kind !== "both")) continue;

        let sprite = spriteBySliceId.get(sliceId);
        if (!sprite) {
          const name = `${slice.name}.png`;
          sprite = { id: nextSpriteId, sliceId, name, nameHash: fnv1a32(name), includeInAtlas: true };
          nextSpriteId += 1;
          newSprites.push(sprite);
          spriteBySliceId.set(sliceId, sprite);
        }

        let tile = tileBySliceId.get(sliceId);
        if (!tile) {
          tile = { tileId: nextTileId, sliceId, spriteId: sprite.id, name: slice.name };
          nextTileId += 1;
          newTiles.push(tile);
          tileBySliceId.set(sliceId, tile);
        }

        addedTileIds.push(tile.tileId);
      }

      if (!addedTileIds.length && !newSprites.length && !newTiles.length) return state;

      const tileMapData = node.data;
      const nextTileIds = [...new Set([...tileMapData.tileIds, ...addedTileIds])];
      const nextScenes = updateSceneRoot(state.project.scenes, action.sceneId, (root) =>
        updateNode(root, action.nodeId, (n) => ({
          ...n,
          data: { ...tileMapData, tileIds: nextTileIds },
        })),
      );

      return {
        ...state,
        project: {
          ...state.project,
          sprites: [...updatedSprites, ...newSprites],
          tiles: [...state.project.tiles, ...newTiles],
          scenes: nextScenes,
          idCounters: { ...state.project.idCounters, sprite: nextSpriteId, tile: nextTileId },
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

      const scene = state.project.scenes[0];
      let nextScenes = state.project.scenes;
      if (scene) {
        const tileMapNode = findFirstTileMap(scene.root);
        if (tileMapNode && tileMapNode.data.type === "TileMap" && !tileMapNode.data.tilesetIds.includes(action.tileset.id)) {
          nextScenes = updateSceneRoot(state.project.scenes, scene.id, (root) =>
            updateNode(root, tileMapNode.id, (n) => ({
              ...n,
              data: { ...n.data, tilesetIds: [...(n.data as typeof tileMapNode.data).tilesetIds, action.tileset.id] },
            })),
          );
        }
      }

      return {
        ...state,
        project: {
          ...state.project,
          tilesets: nextTilesets,
          sprites: [...state.project.sprites, ...action.sprites.filter((sprite) => !state.project.sprites.some((current) => current.id === sprite.id))],
          tiles: [...state.project.tiles, ...action.tiles.filter((tile) => !state.project.tiles.some((current) => current.tileId === tile.tileId))],
          scenes: nextScenes,
          idCounters: {
            ...state.project.idCounters,
            tileset: Math.max(state.project.idCounters.tileset, action.tileset.id + 1),
            sprite:
              Math.max(state.project.idCounters.sprite, ...action.sprites.map((sprite) => sprite.id + 1)) || state.project.idCounters.sprite,
            tile:
              Math.max(state.project.idCounters.tile, ...action.tiles.map((tile) => tile.tileId + 1)) || state.project.idCounters.tile,
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
        editor: { ...state.editor, selectedTerrainSetId: action.terrainSet.id },
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
    case "upsertSpriteAnimation": {
      const existing = state.project.spriteAnimations.find((a) => a.id === action.animation.id);
      const spriteAnimations: SpriteAnimation[] = existing
        ? state.project.spriteAnimations.map((a) => (a.id === action.animation.id ? action.animation : a))
        : [...state.project.spriteAnimations, action.animation];
      return {
        ...state,
        project: {
          ...state.project,
          spriteAnimations,
          idCounters: {
            ...state.project.idCounters,
            spriteAnimation: Math.max(state.project.idCounters.spriteAnimation, action.animation.id + 1),
          },
        },
        editor: { ...state.editor, selectedSpriteAnimationId: action.animation.id, animCurrentFrame: 0, animIsPlaying: false },
      };
    }
    case "removeSpriteAnimation": {
      const spriteAnimations = state.project.spriteAnimations.filter((a) => a.id !== action.animationId);
      return {
        ...state,
        project: { ...state.project, spriteAnimations },
        editor: {
          ...state.editor,
          selectedSpriteAnimationId:
            state.editor.selectedSpriteAnimationId === action.animationId
              ? (spriteAnimations[0]?.id ?? null)
              : state.editor.selectedSpriteAnimationId,
          animCurrentFrame: 0,
          animIsPlaying: false,
        },
      };
    }
    case "setSelectedSpriteAnimation":
      return {
        ...state,
        editor: { ...state.editor, selectedSpriteAnimationId: action.animationId, animCurrentFrame: 0, animIsPlaying: false },
      };
    case "upsertAnimatedTile": {
      const existing = state.project.animatedTiles.find((a) => a.id === action.animatedTile.id);
      const animatedTiles: AnimatedTileAsset[] = existing
        ? state.project.animatedTiles.map((a) => (a.id === action.animatedTile.id ? action.animatedTile : a))
        : [...state.project.animatedTiles, action.animatedTile];
      return {
        ...state,
        project: {
          ...state.project,
          animatedTiles,
          idCounters: {
            ...state.project.idCounters,
            animatedTile: Math.max(state.project.idCounters.animatedTile, action.animatedTile.id + 1),
            tile: existing ? state.project.idCounters.tile : Math.max(state.project.idCounters.tile, action.animatedTile.baseTileId + 1),
          },
        },
        editor: { ...state.editor, selectedAnimatedTileId: action.animatedTile.id },
      };
    }
    case "removeAnimatedTile": {
      const animatedTiles = state.project.animatedTiles.filter((a) => a.id !== action.animatedTileId);
      return {
        ...state,
        project: { ...state.project, animatedTiles },
        editor: {
          ...state.editor,
          selectedAnimatedTileId:
            state.editor.selectedAnimatedTileId === action.animatedTileId
              ? (animatedTiles[0]?.id ?? null)
              : state.editor.selectedAnimatedTileId,
        },
      };
    }
    case "setSelectedAnimatedTile":
      return { ...state, editor: { ...state.editor, selectedAnimatedTileId: action.animatedTileId } };
    case "setAnimFrame":
      return { ...state, editor: { ...state.editor, animCurrentFrame: action.frame } };
    case "setAnimPlaying":
      return { ...state, editor: { ...state.editor, animIsPlaying: action.playing, animCurrentFrame: action.playing ? state.editor.animCurrentFrame : 0 } };
    case "setLevelPickerTab":
      return { ...state, editor: { ...state.editor, levelPickerTab: action.tab } };
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
      return { ...state, project: { ...state.project, sprites } };
    }
    case "setAtlasHoveredSprite":
      return { ...state, editor: { ...state.editor, atlasHoveredSpriteId: action.spriteId } };
    case "saveBrush": {
      const id = state.editor.nextBrushId;
      const brush = { ...action.brush, id };
      return {
        ...state,
        editor: {
          ...state.editor,
          savedBrushes: [...(state.editor.savedBrushes ?? []), brush],
          activeBrushId: id,
          nextBrushId: id + 1,
        },
      };
    }
    case "deleteBrush": {
      const remaining = (state.editor.savedBrushes ?? []).filter((b) => b.id !== action.brushId);
      return {
        ...state,
        editor: {
          ...state.editor,
          savedBrushes: remaining,
          activeBrushId: state.editor.activeBrushId === action.brushId
            ? (remaining[remaining.length - 1]?.id ?? null)
            : state.editor.activeBrushId,
        },
      };
    }
    case "setActiveBrush":
      return { ...state, editor: { ...state.editor, activeBrushId: action.brushId } };

    // Scene graph actions
    case "selectScene":
      return { ...state, editor: { ...state.editor, selectedSceneId: action.sceneId, selectedNodeId: null } };
    case "selectNode":
      return { ...state, editor: { ...state.editor, selectedNodeId: action.nodeId } };
    case "addScene":
      return {
        ...state,
        project: {
          ...state.project,
          scenes: [...state.project.scenes, action.scene],
          idCounters: {
            ...state.project.idCounters,
            scene: state.project.idCounters.scene + 1,
          },
        },
        editor: { ...state.editor, selectedSceneId: action.scene.id, selectedNodeId: null },
      };
    case "renameScene":
      return {
        ...state,
        project: {
          ...state.project,
          scenes: state.project.scenes.map((s) =>
            s.id === action.sceneId ? { ...s, name: action.name } : s,
          ),
        },
      };
    case "removeScene": {
      if (state.project.scenes.length <= 1) return state;
      const scenes = state.project.scenes.filter((s) => s.id !== action.sceneId);
      return {
        ...state,
        project: { ...state.project, scenes },
        editor: {
          ...state.editor,
          selectedSceneId: state.editor.selectedSceneId === action.sceneId ? (scenes[0]?.id ?? null) : state.editor.selectedSceneId,
          selectedNodeId: state.editor.selectedSceneId === action.sceneId ? null : state.editor.selectedNodeId,
        },
      };
    }
    case "addChildNode":
      return {
        ...state,
        project: {
          ...state.project,
          scenes: updateSceneRoot(state.project.scenes, action.sceneId, (root) =>
            insertNode(root, action.parentId, action.node, action.index),
          ),
          idCounters: { ...state.project.idCounters, node: state.project.idCounters.node + 1 },
        },
        editor: { ...state.editor, selectedNodeId: action.node.id },
      };
    case "removeNode":
      return {
        ...state,
        project: {
          ...state.project,
          scenes: updateSceneRoot(state.project.scenes, action.sceneId, (root) =>
            removeNode(root, action.nodeId),
          ),
        },
        editor: {
          ...state.editor,
          selectedNodeId: state.editor.selectedNodeId === action.nodeId ? null : state.editor.selectedNodeId,
        },
      };
    case "duplicateNode": {
      const dupeScene = state.project.scenes.find((s) => s.id === action.sceneId);
      if (!dupeScene) return state;
      const sourceNode = findNode(dupeScene.root, action.nodeId);
      if (!sourceNode || sourceNode.id === dupeScene.root.id) return state;
      const parent = findParent(dupeScene.root, action.nodeId);
      if (!parent) return state;
      const { node: cloned, nextId } = duplicateNode(sourceNode, state.project.idCounters.node);
      const siblingIndex = parent.children.findIndex((c) => c.id === action.nodeId);
      return {
        ...state,
        project: {
          ...state.project,
          scenes: updateSceneRoot(state.project.scenes, action.sceneId, (root) =>
            insertNode(root, parent.id, cloned, siblingIndex + 1),
          ),
          idCounters: { ...state.project.idCounters, node: nextId },
        },
        editor: { ...state.editor, selectedNodeId: cloned.id },
      };
    }
    case "moveNode":
      return {
        ...state,
        project: {
          ...state.project,
          scenes: updateSceneRoot(state.project.scenes, action.sceneId, (root) =>
            moveNode(root, action.nodeId, action.newParentId, action.index),
          ),
        },
      };
    case "reorderNode":
      return {
        ...state,
        project: {
          ...state.project,
          scenes: updateSceneRoot(state.project.scenes, action.sceneId, (root) =>
            reorderNode(root, action.parentId, action.nodeId, action.toIndex),
          ),
        },
      };
    case "updateSceneNode":
    case "updateSceneNodeSilent":
      return {
        ...state,
        project: {
          ...state.project,
          scenes: updateSceneRoot(state.project.scenes, action.sceneId, (root) =>
            updateNode(root, action.nodeId, (node) => ({ ...node, ...action.patch, id: node.id })),
          ),
        },
      };
    case "updateSceneNodeData":
    case "updateSceneNodeDataSilent":
      return {
        ...state,
        project: {
          ...state.project,
          scenes: updateSceneRoot(state.project.scenes, action.sceneId, (root) =>
            updateNode(root, action.nodeId, (node) => ({ ...node, data: action.data })),
          ),
        },
      };
    default:
      return state;
  }
}

function findFirstTileMap(root: SceneNode): SceneNode | null {
  if (root.data.type === "TileMap") return root;
  for (const child of root.children) {
    const found = findFirstTileMap(child);
    if (found) return found;
  }
  return null;
}

function normalizeProject(project: ProjectDocument): ProjectDocument {
  return {
    ...project,
    scenes: project.scenes ?? [],
    spriteAnimations: project.spriteAnimations ?? [],
    animatedTiles: project.animatedTiles ?? [],
    idCounters: {
      ...project.idCounters,
      scene: project.idCounters.scene ?? 2,
      node: project.idCounters.node ?? 10,
      spriteAnimation: project.idCounters.spriteAnimation ?? 1,
      animatedTile: project.idCounters.animatedTile ?? 1,
    },
  };
}
