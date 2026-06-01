import { buildAtlas, type RuntimeAnimTileData } from "../atlas";
import { buildRuntimeSpriteCatalog } from "../export/runtimeSprites";
import type {
  AppState,
  PackedAtlas,
  ProjectDocument,
  SceneDocument,
  SceneNode,
  SpriteAsset,
  TerrainSet,
  TileMapNodeData,
  TilesetAsset,
} from "../types";
import { findNode } from "../scene/helpers";
import { fnv1a32 } from "../utils";

export function getSelectedScene(state: AppState): SceneDocument | null {
  return (
    state.project.scenes.find((scene) => scene.id === state.editor.selectedSceneId) ??
    state.project.scenes[0] ??
    null
  );
}

export function getSelectedNode(state: AppState): SceneNode | null {
  const scene = getSelectedScene(state);
  if (!scene || !state.editor.selectedNodeId) return null;
  return findNode(scene.root, state.editor.selectedNodeId);
}

export function getSelectedTileMapData(state: AppState): TileMapNodeData | null {
  const node = getSelectedNode(state);
  if (node && node.data.type === "TileMap") return node.data;
  return null;
}

export function getSelectedTileset(state: AppState): TilesetAsset | null {
  return (
    state.project.tilesets.find((tileset) => tileset.id === state.editor.selectedTilesetId) ??
    state.project.tilesets[0] ??
    null
  );
}

export function getEffectiveTileMapTileIds(
  project: ProjectDocument,
  tileMapData: TileMapNodeData | null,
): number[] {
  if (!tileMapData) return [];
  if (tileMapData.tileIds.length) return tileMapData.tileIds;
  return project.tilesets
    .filter((tileset) => tileMapData.tilesetIds.includes(tileset.id))
    .flatMap((tileset) => tileset.tileIds);
}

export function getSelectedTerrainSet(state: AppState): TerrainSet | null {
  const tileMapData = getSelectedTileMapData(state);
  const tileIds = new Set(getEffectiveTileMapTileIds(state.project, tileMapData));
  const selectedById = state.project.terrainSets.find(
    (terrainSet) =>
      terrainSet.id === state.editor.selectedTerrainSetId &&
      (
        (state.editor.selectedNodeId && terrainSet.sceneNodeId === state.editor.selectedNodeId) ||
        (!terrainSet.sceneNodeId &&
          Object.values(terrainSet.slots).some((tileId) => tileIds.has(tileId)))
      ),
  );
  return (
    selectedById ??
    state.project.terrainSets.find((terrainSet) => terrainSet.sceneNodeId === state.editor.selectedNodeId) ??
    state.project.terrainSets.find((terrainSet) => terrainSet.tilesetId === state.editor.selectedTilesetId) ??
    null
  );
}

export function getSpriteForSlice(project: AppState["project"], sliceId: string): SpriteAsset | null {
  return project.sprites.find((sprite) => sprite.sliceId === sliceId) ?? null;
}

export function getTileById(project: AppState["project"], tileId: number) {
  return project.tiles.find((tile) => tile.tileId === tileId) ?? null;
}

export async function buildAtlasFromProject(project: AppState["project"]): Promise<PackedAtlas | null> {
  const { imports } = await buildRuntimeSpriteCatalog(project);
  if (!imports.length) return null;

  const spriteBySliceId = new Map(project.sprites.map((s) => [s.sliceId, s]));
  const spriteIndexById = new Map(imports.map((imp, idx) => [imp.id, idx]));
  const tileByTileId = new Map(project.tiles.map((t) => [t.tileId, t]));

  const runtimeAnims = (project.spriteAnimations ?? [])
    .map((anim) => {
      const frames = anim.frames.flatMap((f) => {
        const sprite = spriteBySliceId.get(f.sliceId);
        if (!sprite) return [];
        const spriteIndex = spriteIndexById.get(sprite.id);
        if (spriteIndex === undefined) return [];
        return [{ spriteIndex, durationMs: f.durationMs }];
      });
      return { nameHash: anim.nameHash, loop: anim.loop, frames };
    })
    .filter((a) => a.frames.length > 0);

  const runtimeAnimTiles: RuntimeAnimTileData[] = (project.animatedTiles ?? [])
    .flatMap((animTile) => {
      if (animTile.frames.length === 0) return [];
      const firstFrameSprite = spriteBySliceId.get(animTile.frames[0].sliceId);
      if (!firstFrameSprite) return [];
      const baseSpriteIndex = spriteIndexById.get(firstFrameSprite.id);
      if (baseSpriteIndex === undefined) return [];

      const frames = animTile.frames.flatMap((f) => {
        const sprite = spriteBySliceId.get(f.sliceId);
        if (!sprite) return [];
        const spriteIndex = spriteIndexById.get(sprite.id);
        if (spriteIndex === undefined) return [];
        return [{ spriteIndex, durationMs: f.durationMs }];
      });

      if (frames.length === 0) return [];
      return [{ baseSpriteIndex, frames }];
    });

  return buildAtlas(imports, { ...project.atlasSettings, allowRotation: false }, runtimeAnims, runtimeAnimTiles);
}

export function buildNameHash(name: string): number {
  return fnv1a32(name);
}
