import type { ProjectDocument } from "../types";
import { createDefaultIdCounters } from "../model/project";

interface ProjectSaveDocument {
  format: "atlas-manager-project";
  version: number;
  project: ProjectDocument;
}

export function buildProjectJsonBlob(project: ProjectDocument): Blob {
  return new Blob([JSON.stringify(encodeProject(project), null, 2)], {
    type: "application/json",
  });
}

export async function loadProjectFromFile(file: File): Promise<ProjectDocument> {
  const text = await file.text();
  return decodeProject(text);
}

function encodeProject(project: ProjectDocument): ProjectSaveDocument {
  return {
    format: "atlas-manager-project",
    version: 1,
    project,
  };
}

function decodeProject(text: string): ProjectDocument {
  const parsed = JSON.parse(text) as ProjectSaveDocument | ProjectDocument;
  const project = "project" in parsed ? parsed.project : parsed;
  return {
    ...project,
    terrainSets: project.terrainSets ?? [],
    sprites: (project.sprites ?? []).map((sprite) => ({
      ...sprite,
      includeInAtlas: sprite.includeInAtlas ?? true,
    })),
    idCounters: {
      ...createDefaultIdCounters(),
      ...project.idCounters,
      terrainSet: project.idCounters?.terrainSet ?? 1,
    },
  };
}
