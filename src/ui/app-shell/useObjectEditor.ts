import { useState, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type {
  AppState,
  ProjectAction,
  SceneDocument,
  SceneNode,
  SceneNodeType,
} from "../../types";
import { getCanvasPixel } from "./canvas";
import { createNode, findNode, flattenNodes, getWorldTransform } from "../../scene/helpers";

interface ObjectEditorParams {
  state: AppState;
  dispatch: React.Dispatch<ProjectAction>;
  scene: SceneDocument | null;
  selectedNode: SceneNode | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useObjectEditor({
  state,
  dispatch,
  scene,
  selectedNode,
  canvasRef,
}: ObjectEditorParams) {
  const [objectPlaceType, setObjectPlaceType] = useState<SceneNodeType>("Sprite");
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  function hitTestSceneNodes(root: SceneNode, px: number, py: number): SceneNode | null {
    const nodes = flattenNodes(root).reverse();
    for (const node of nodes) {
      if (node.data.type === "Root" || node.data.type === "Node2D") continue;
      if (!node.visible) continue;
      const wt = getWorldTransform(root, node.id);
      let w = 16, h = 16;
      if (node.data.type === "TileMap") { w = node.data.mapWidthTiles * node.data.tileWidth; h = node.data.mapHeightTiles * node.data.tileHeight; }
      else if (node.data.type === "CollisionShape") { w = node.data.width; h = node.data.height; }
      else if (node.data.type === "Area") { w = node.data.width; h = node.data.height; }
      else if (node.data.type === "Light2D") { w = node.data.radius * 2; h = node.data.radius * 2; }
      if (px >= wt.x && px <= wt.x + w && py >= wt.y && py <= wt.y + h) return node;
    }
    return null;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>): boolean {
    if (!scene) return false;

    if (state.editor.levelTool === "objectPlace") {
      const pixel = getCanvasPixel(event, canvasRef.current, state.editor.levelZoom);
      if (!pixel) return false;
      const parentId = selectedNode?.id ?? scene.root.id;
      const nodeId = `node-${state.project.idCounters.node}`;
      const node = createNode(objectPlaceType, objectPlaceType, nodeId);
      node.transform = { ...node.transform, x: pixel.x, y: pixel.y };
      dispatch({ type: "addChildNode", sceneId: scene.id, parentId, node });
      return true;
    }

    if (state.editor.levelTool === "objectSelect") {
      const pixel = getCanvasPixel(event, canvasRef.current, state.editor.levelZoom);
      if (!pixel) return false;
      const hitNode = hitTestSceneNodes(scene.root, pixel.x, pixel.y);
      if (hitNode) {
        dispatch({ type: "selectNode", nodeId: hitNode.id });
        dragRef.current = { nodeId: hitNode.id, startX: pixel.x, startY: pixel.y, origX: hitNode.transform.x, origY: hitNode.transform.y };
      }
      return true;
    }

    return false;
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>): boolean {
    if (!dragRef.current || !scene || event.buttons !== 1) return false;
    const pixel = getCanvasPixel(event, canvasRef.current, state.editor.levelZoom);
    if (!pixel) return false;
    const drag = dragRef.current;
    const dx = pixel.x - drag.startX;
    const dy = pixel.y - drag.startY;
    const currentTransform = findNode(scene.root, drag.nodeId)?.transform ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    dispatch({
      type: "updateSceneNodeSilent",
      sceneId: scene.id,
      nodeId: drag.nodeId,
      patch: { transform: { ...currentTransform, x: drag.origX + dx, y: drag.origY + dy } },
    });
    return true;
  }

  function handlePointerUp(): boolean {
    if (dragRef.current) {
      dragRef.current = null;
      return true;
    }
    return false;
  }

  return {
    objectPlaceType,
    setObjectPlaceType,
    objectPointerDown: handlePointerDown,
    objectPointerMove: handlePointerMove,
    objectPointerUp: handlePointerUp,
  };
}
