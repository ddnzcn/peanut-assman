import { useState, type DragEvent } from "react";
import type { ProjectDocument } from "../../types";
import { layerCapabilityLabel } from "./canvas";

export function LevelNavigator(props: {
  levels: ProjectDocument["levels"];
  selectedLevelId: string | null;
  selectedLayerId: string | null;
  onSelectLevel: (levelId: string) => void;
  onSelectLayer: (layerId: string) => void;
  onRenameLevel: (levelId: string, name: string) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onAddLevel: () => void;
  onRemoveLevel: () => void;
  onAddLayer: () => void;
  onMoveLayerUp: () => void;
  onMoveLayerDown: () => void;
  onReorderLayer: (layerId: string, toIndex: number) => void;
  onRemoveLayer: () => void;
}) {
  const selectedLevel = props.levels.find((level) => level.id === props.selectedLevelId) ?? props.levels[0] ?? null;
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [editingLevelName, setEditingLevelName] = useState("");
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState("");
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);

  return (
    <div className="navigator-sections">
      <section className="navigator-section">
        <div className="navigator-header">
          <h2>Pages</h2>
          <div className="navigator-actions">
            <button className="ghost navigator-action" onClick={props.onAddLevel} title="Add page">
              +
            </button>
            <button className="ghost navigator-action" onClick={props.onRemoveLevel} title="Remove page">
              −
            </button>
          </div>
        </div>
        <div className="navigator-list">
          {props.levels.map((level) => (
            <div key={level.id} className={level.id === selectedLevel?.id ? "navigator-row active" : "navigator-row"}>
              {editingLevelId === level.id ? (
                <input
                  className="navigator-inline-input"
                  value={editingLevelName}
                  autoFocus
                  onChange={(event) => setEditingLevelName(event.target.value)}
                  onBlur={() => {
                    props.onRenameLevel(level.id, editingLevelName.trim() || level.name);
                    setEditingLevelId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      props.onRenameLevel(level.id, editingLevelName.trim() || level.name);
                      setEditingLevelId(null);
                    }
                    if (event.key === "Escape") {
                      setEditingLevelId(null);
                    }
                  }}
                />
              ) : (
                <button
                  className="navigator-row-button"
                  onClick={() => props.onSelectLevel(level.id)}
                  onDoubleClick={() => {
                    setEditingLevelId(level.id);
                    setEditingLevelName(level.name);
                  }}
                >
                  <span className="navigator-copy">
                    <strong>{level.name}</strong>
                    <small>
                      {level.mapWidthTiles} x {level.mapHeightTiles}
                    </small>
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="navigator-section">
        <div className="navigator-header">
          <h2>Layers</h2>
          <div className="navigator-actions">
            <button className="ghost navigator-action" onClick={props.onAddLayer} title="Add layer">
              +
            </button>
            <button className="ghost navigator-action" onClick={props.onMoveLayerUp} title="Move layer up">
              ↑
            </button>
            <button className="ghost navigator-action" onClick={props.onMoveLayerDown} title="Move layer down">
              ↓
            </button>
            <button className="ghost navigator-action" onClick={props.onRemoveLayer} title="Remove layer">
              −
            </button>
          </div>
        </div>
        <div className="navigator-list">
          {selectedLevel?.layers.map((layer) => (
            <div
              key={layer.id}
              className={
                draggedLayerId === layer.id
                  ? "navigator-row active navigator-row-dragging"
                  : layer.id === props.selectedLayerId
                    ? "navigator-row active"
                    : "navigator-row"
              }
              draggable={editingLayerId !== layer.id}
              onDragStart={() => setDraggedLayerId(layer.id)}
              onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
              onDrop={() => {
                if (!selectedLevel || !draggedLayerId || draggedLayerId === layer.id) {
                  setDraggedLayerId(null);
                  return;
                }
                const toIndex = selectedLevel.layers.findIndex((entry) => entry.id === layer.id);
                props.onReorderLayer(draggedLayerId, toIndex);
                setDraggedLayerId(null);
              }}
              onDragEnd={() => setDraggedLayerId(null)}
            >
              {editingLayerId === layer.id ? (
                <input
                  className="navigator-inline-input"
                  value={editingLayerName}
                  autoFocus
                  onChange={(event) => setEditingLayerName(event.target.value)}
                  onBlur={() => {
                    props.onRenameLayer(layer.id, editingLayerName.trim() || layer.name);
                    setEditingLayerId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      props.onRenameLayer(layer.id, editingLayerName.trim() || layer.name);
                      setEditingLayerId(null);
                    }
                    if (event.key === "Escape") {
                      setEditingLayerId(null);
                    }
                  }}
                />
              ) : (
                <button
                  className="navigator-row-button navigator-row-sortable"
                  onClick={() => props.onSelectLayer(layer.id)}
                  onDoubleClick={() => {
                    setEditingLayerId(layer.id);
                    setEditingLayerName(layer.name);
                  }}
                >
                  <span className="navigator-copy">
                    <strong>{layer.name}</strong>
                    <small>{layerCapabilityLabel(layer)}</small>
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
