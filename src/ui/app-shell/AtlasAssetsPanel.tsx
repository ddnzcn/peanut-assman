import type { DragEvent } from "react";
import type { ProjectDocument, SliceAsset, SourceImageAsset } from "../../types";
import { SliceAssetPreview } from "./shared";

export function AtlasAssetsPanel(props: {
  project: ProjectDocument;
  sourceImages: SourceImageAsset[];
  selectedSourceImageId: string | null;
  atlasSprites: Array<{ sprite: ProjectDocument["sprites"][number]; slice: SliceAsset | null }>;
  onSelectSource: (sourceImageId: string) => void;
  onRemoveSource: (sourceImageId: string) => void;
  onDragStart: (index: number) => void;
  onDrop: (toIndex: number) => void;
}) {
  function handleRemoveSource(sourceId: string) {
    const source = props.project.sourceImages.find((s) => s.id === sourceId);
    if (!source) return;
    const usedBySlices = props.project.slices.filter((s) => s.sourceImageId === sourceId);
    const usedByTiles = props.project.tiles.filter((t) => {
      const slice = props.project.slices.find((s) => s.id === t.sliceId);
      return slice?.sourceImageId === sourceId;
    });
    const usageWarning =
      usedBySlices.length > 0
        ? `This image has ${usedBySlices.length} slice(s)${usedByTiles.length > 0 ? ` and ${usedByTiles.length} tile(s)` : ""} that will be removed.`
        : "";
    const confirmMsg = `Remove "${source.fileName}"?${usageWarning ? `\n\n${usageWarning}` : ""}\n\nThis cannot be undone.`;
    if (window.confirm(confirmMsg)) {
      props.onRemoveSource(sourceId);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h2>Atlas Assets</h2>
        <span>Visible while packing</span>
      </div>
      <div className="asset-list">
        {props.sourceImages.map((source) => (
          <div key={source.id} style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
            <button
              className={source.id === props.selectedSourceImageId ? "asset-card active" : "asset-card"}
              style={{ flex: 1 }}
              onClick={() => props.onSelectSource(source.id)}
            >
              <strong>{source.fileName}</strong>
              <span>
                {source.width} x {source.height}
              </span>
            </button>
            <button
              className="ghost"
              style={{ padding: "0 0.4rem", fontSize: "0.75rem", opacity: 0.6, flexShrink: 0 }}
              title="Remove this source image"
              onClick={() => handleRemoveSource(source.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="panel-header">
        <h2>Draw Order</h2>
        <span>Drag to reprioritize packing</span>
      </div>
      <div className="dense-picker-container" style={{ flex: 1 }}>
        <div className="dense-picker-grid">
          {props.atlasSprites.map((entry, index) => (
            <div
              key={entry.sprite.id}
              className="dense-tile-btn atlas-drag-card"
              draggable
              onDragStart={() => props.onDragStart(index)}
              onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
              onDrop={() => props.onDrop(index)}
              title={`${entry.sprite.name} (#${entry.sprite.id})`}
            >
              <SliceAssetPreview project={props.project} slice={entry.slice} />
              <div className="dense-tile-label">{entry.sprite.name}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
