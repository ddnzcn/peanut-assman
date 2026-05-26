import { useState, useRef, type DragEvent } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Film,
  Grid3x3,
  Image,
  Lock,
  MapPin,
  Play,
  Plus,
  Shield,
  Sun,
  Trash2,
  Unlock,
} from "lucide-react";
import type {
  ProjectAction,
  SceneDocument,
  SceneNode,
  SceneNodeType,
} from "../../types";
import { createDefaultScene, createNode } from "../../scene/helpers";

const NODE_TYPE_ICONS: Record<SceneNodeType, typeof Box> = {
  Root: Box,
  Node2D: Box,
  Sprite: Image,
  TileMap: Grid3x3,
  CollisionShape: Shield,
  Area: MapPin,
  Light2D: Sun,
  AnimatedSprite: Play,
};

const NODE_TYPE_COLORS: Record<SceneNodeType, string> = {
  Root: "var(--text-muted)",
  Node2D: "var(--text-muted)",
  Sprite: "#87c5ff",
  TileMap: "#f0c57b",
  CollisionShape: "#ff7c7c",
  Area: "#77d8ff",
  Light2D: "#ffe066",
  AnimatedSprite: "#c587ff",
};

const ADDABLE_NODE_TYPES: SceneNodeType[] = [
  "Node2D",
  "Sprite",
  "TileMap",
  "CollisionShape",
  "Area",
  "Light2D",
  "AnimatedSprite",
];

interface SceneTreeProps {
  scenes: SceneDocument[];
  selectedSceneId: string | null;
  selectedNodeId: string | null;
  nodeIdCounter: number;
  sceneIdCounter: number;
  dispatch: React.Dispatch<ProjectAction>;
}

export function SceneTree({
  scenes,
  selectedSceneId,
  selectedNodeId,
  nodeIdCounter,
  sceneIdCounter,
  dispatch,
}: SceneTreeProps) {
  const scene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [addMenuParentId, setAddMenuParentId] = useState<string | null>(null);
  const dragNodeIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  if (!scene) {
    return (
      <div style={{ padding: "0.5rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
        No scenes
      </div>
    );
  }

  function toggleCollapse(nodeId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function handleSelect(nodeId: string) {
    dispatch({ type: "selectNode", nodeId });
  }

  function handleRename(nodeId: string, name: string) {
    if (!scene) return;
    dispatch({
      type: "updateSceneNode",
      sceneId: scene.id,
      nodeId,
      patch: { name },
    });
    setRenamingId(null);
  }

  function handleToggleVisible(nodeId: string, visible: boolean) {
    if (!scene) return;
    dispatch({
      type: "updateSceneNode",
      sceneId: scene.id,
      nodeId,
      patch: { visible: !visible },
    });
  }

  function handleToggleLocked(nodeId: string, locked: boolean) {
    if (!scene) return;
    dispatch({
      type: "updateSceneNode",
      sceneId: scene.id,
      nodeId,
      patch: { locked: !locked },
    });
  }

  function handleAddNode(parentId: string, type: SceneNodeType) {
    if (!scene) return;
    const id = `node-${nodeIdCounter}`;
    const node = createNode(type, type, id);
    dispatch({
      type: "addChildNode",
      sceneId: scene.id,
      parentId,
      node,
    });
    setAddMenuParentId(null);
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(parentId);
      return next;
    });
  }

  function handleRemoveNode(nodeId: string) {
    if (!scene || nodeId === scene.root.id) return;
    dispatch({ type: "removeNode", sceneId: scene.id, nodeId });
  }

  function handleDragStart(nodeId: string) {
    if (nodeId === scene.root.id) return;
    dragNodeIdRef.current = nodeId;
  }

  function handleDragOver(e: DragEvent, nodeId: string) {
    e.preventDefault();
    if (dragNodeIdRef.current && dragNodeIdRef.current !== nodeId) {
      setDragOverId(nodeId);
    }
  }

  function handleDrop(targetId: string) {
    const dragId = dragNodeIdRef.current;
    if (!dragId || !scene || dragId === targetId) {
      dragNodeIdRef.current = null;
      setDragOverId(null);
      return;
    }
    dispatch({
      type: "moveNode",
      sceneId: scene.id,
      nodeId: dragId,
      newParentId: targetId,
      index: 0,
    });
    dragNodeIdRef.current = null;
    setDragOverId(null);
  }

  function handleDragEnd() {
    dragNodeIdRef.current = null;
    setDragOverId(null);
  }

  function renderNode(node: SceneNode, depth: number): React.ReactNode {
    const isSelected = node.id === selectedNodeId;
    const isCollapsed = collapsed.has(node.id);
    const hasChildren = node.children.length > 0;
    const isRoot = node.data.type === "Root";
    const isDragOver = node.id === dragOverId;
    const Icon = NODE_TYPE_ICONS[node.data.type];
    const iconColor = NODE_TYPE_COLORS[node.data.type];

    return (
      <div key={node.id}>
        <div
          className={`scene-tree-row${isSelected ? " active" : ""}${isDragOver ? " drag-over" : ""}`}
          style={{ paddingLeft: depth * 14 + 4 }}
          onClick={() => handleSelect(node.id)}
          draggable={!isRoot}
          onDragStart={() => handleDragStart(node.id)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDrop={() => handleDrop(node.id)}
          onDragEnd={handleDragEnd}
          onDoubleClick={() => !isRoot && setRenamingId(node.id)}
        >
          <button
            className="scene-tree-chevron"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleCollapse(node.id);
            }}
            style={{ visibility: hasChildren ? "visible" : "hidden" }}
          >
            {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
          </button>

          <Icon size={11} style={{ color: iconColor, flexShrink: 0 }} />

          {renamingId === node.id ? (
            <input
              className="scene-tree-rename"
              defaultValue={node.name}
              autoFocus
              onBlur={(e) => handleRename(node.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename(node.id, (e.target as HTMLInputElement).value);
                if (e.key === "Escape") setRenamingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="scene-tree-name">{node.name}</span>
          )}

          <div className="scene-tree-actions">
            <button
              className="scene-tree-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleVisible(node.id, node.visible);
              }}
              title={node.visible ? "Hide" : "Show"}
            >
              {node.visible ? <Eye size={10} /> : <EyeOff size={10} />}
            </button>
            {!isRoot && (
              <>
                <button
                  className="scene-tree-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "duplicateNode", sceneId: scene.id, nodeId: node.id });
                  }}
                  title="Duplicate (Ctrl+D)"
                >
                  <Copy size={10} />
                </button>
                <button
                  className="scene-tree-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleLocked(node.id, node.locked);
                  }}
                  title={node.locked ? "Unlock" : "Lock"}
                >
                  {node.locked ? <Lock size={10} /> : <Unlock size={10} />}
                </button>
              </>
            )}
          </div>
        </div>

        {!isCollapsed && hasChildren && (
          <div className="scene-tree-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  function handleAddScene() {
    const id = `scene-${sceneIdCounter}`;
    const newScene = createDefaultScene(id);
    dispatch({ type: "addScene", scene: newScene });
  }

  function handleRemoveScene(sceneId: string) {
    if (scenes.length <= 1) return;
    dispatch({ type: "removeScene", sceneId });
  }

  const [renamingSceneId, setRenamingSceneId] = useState<string | null>(null);

  function handleRenameScene(sceneId: string, name: string) {
    if (!name.trim()) { setRenamingSceneId(null); return; }
    dispatch({ type: "renameScene", sceneId, name: name.trim() });
    setRenamingSceneId(null);
  }

  return (
    <div className="scene-tree">
      {/* Scene list */}
      <div className="pn-panel-header">
        <Film size={12} />
        <h3>Scenes</h3>
        <button
          className="pn-tool-btn"
          style={{ width: 20, height: 20, marginLeft: "auto" }}
          title="Add scene"
          onClick={handleAddScene}
        >
          <Plus size={10} />
        </button>
      </div>
      <div className="scene-list">
        {scenes.map((s) => (
          <div
            key={s.id}
            className={`scene-list-item${s.id === selectedSceneId ? " active" : ""}`}
            onClick={() => dispatch({ type: "selectScene", sceneId: s.id })}
            onDoubleClick={() => setRenamingSceneId(s.id)}
          >
            <Film size={10} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
            {renamingSceneId === s.id ? (
              <input
                className="scene-tree-rename"
                defaultValue={s.name}
                autoFocus
                onBlur={(e) => handleRenameScene(s.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameScene(s.id, (e.target as HTMLInputElement).value);
                  if (e.key === "Escape") setRenamingSceneId(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="scene-tree-name">{s.name}</span>
            )}
            {scenes.length > 1 && (
              <button
                className="scene-tree-action-btn"
                style={{ opacity: s.id === selectedSceneId ? 1 : 0 }}
                onClick={(e) => { e.stopPropagation(); handleRemoveScene(s.id); }}
                title="Delete scene"
              >
                <Trash2 size={9} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Node tree header */}
      <div className="pn-panel-header" style={{ borderTop: "1px solid var(--border)" }}>
        <Grid3x3 size={12} />
        <h3>Nodes</h3>
        <button
          className="pn-tool-btn"
          style={{ width: 20, height: 20, marginLeft: "auto" }}
          title="Add node"
          onClick={() => setAddMenuParentId(addMenuParentId ? null : (selectedNodeId ?? scene.root.id))}
        >
          <Plus size={10} />
        </button>
        {selectedNodeId && selectedNodeId !== scene.root.id && (
          <button
            className="pn-tool-btn"
            style={{ width: 20, height: 20 }}
            title="Delete selected node"
            onClick={() => handleRemoveNode(selectedNodeId)}
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>

      {addMenuParentId && (
        <div className="scene-tree-add-menu">
          {ADDABLE_NODE_TYPES.map((type) => {
            const TypeIcon = NODE_TYPE_ICONS[type];
            return (
              <button
                key={type}
                className="scene-tree-add-item"
                onClick={() => handleAddNode(addMenuParentId, type)}
              >
                <TypeIcon size={11} style={{ color: NODE_TYPE_COLORS[type] }} />
                <span>{type}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="scene-tree-scroll">
        {renderNode(scene.root, 0)}
      </div>
    </div>
  );
}
