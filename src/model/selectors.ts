import { buildAtlas } from "../atlas";
import { buildRuntimeSpriteCatalog } from "../export/runtimeSprites";
import type {
  AppState,
  LevelDocument,
  LevelLayer,
  PackedAtlas,
  ProjectDocument,
  SpriteAsset,
  TerrainSet,
  TileChunk,
  TilesetAsset,
} from "../types";
import { chunkKey, fnv1a32 } from "../utils";

export function getSelectedLevel(state: AppState): LevelDocument | null {
  return (
    state.project.levels.find((level) => level.id === state.editor.selectedLevelId) ??
    state.project.levels[0] ??
    null
  );
}

export function getSelectedLayer(state: AppState): LevelLayer | null {
  const level = getSelectedLevel(state);
  if (!level) {
    return null;
  }
  if (!state.editor.selectedLayerId) {
    return null;
  }
  return level.layers.find((layer) => layer.id === state.editor.selectedLayerId) ?? null;
}

export function getSelectedTileset(state: AppState): TilesetAsset | null {
  return (
    state.project.tilesets.find((tileset) => tileset.id === state.editor.selectedTilesetId) ??
    state.project.tilesets[0] ??
    null
  );
}

export function getEffectiveLevelTileIds(
  project: ProjectDocument,
  level: LevelDocument | null,
): number[] {
  if (!level) {
    return [];
  }
  if (level.tileIds.length) {
    return level.tileIds;
  }
  return project.tilesets
    .filter((tileset) => level.tilesetIds.includes(tileset.id))
    .flatMap((tileset) => tileset.tileIds);
}

export function getSelectedTerrainSet(state: AppState): TerrainSet | null {
  const level = getSelectedLevel(state);
  const levelTileIds = new Set(getEffectiveLevelTileIds(state.project, level));
  const selectedById = state.project.terrainSets.find(
    (terrainSet) =>
      terrainSet.id === state.editor.selectedTerrainSetId &&
      (
        (level && terrainSet.levelId === level.id) ||
        (!terrainSet.levelId &&
          Object.values(terrainSet.slots).some((tileId) => levelTileIds.has(tileId)))
      ),
  );
  return (
    selectedById ??
    state.project.terrainSets.find((terrainSet) => terrainSet.levelId === state.editor.selectedLevelId) ??
    state.project.terrainSets.find((terrainSet) => terrainSet.tilesetId === state.editor.selectedTilesetId) ??
    null
  );
}

export function getTileChunk(
  level: LevelDocument,
  layerId: string,
  chunkX: number,
  chunkY: number,
): TileChunk | null {
  return level.chunks[chunkKey(layerId, chunkX, chunkY)] ?? null;
}

export function getSpriteForSlice(project: AppState["project"], sliceId: string): SpriteAsset | null {
  return project.sprites.find((sprite) => sprite.sliceId === sliceId) ?? null;
}

export function getTileById(project: AppState["project"], tileId: number) {
  return project.tiles.find((tile) => tile.tileId === tileId) ?? null;
}

export async function buildAtlasFromProject(project: AppState["project"]): Promise<PackedAtlas | null> {
  const { imports } = await buildRuntimeSpriteCatalog(project);
  if (!imports.length) {
    return null;
  }
  return buildAtlas(imports, { ...project.atlasSettings, allowRotation: false });
}

export function buildNameHash(name: string): number {
  return fnv1a32(name);
}
