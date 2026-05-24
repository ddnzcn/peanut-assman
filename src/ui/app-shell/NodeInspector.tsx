import { useEffect, useState } from "react";
import type {
  AreaNodeData,
  CollisionShapeNodeData,
  Light2DNodeData,
  ProjectAction,
  ProjectDocument,
  SceneDocument,
  SceneNode,
  SliceAsset,
  SpriteNodeData,
  TileMapNodeData,
  TileMapProjection,
  Transform2D,
} from "../../types";

function DraftInput(props: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}) {
  const [draft, setDraft] = useState(() => String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);
  function commit(v: string) {
    const n = Number(v);
    if (Number.isNaN(n)) { setDraft(String(props.value)); return; }
    let clamped = props.min !== undefined ? Math.max(props.min, n) : n;
    clamped = props.max !== undefined ? Math.min(props.max, clamped) : clamped;
    props.onCommit(clamped);
    setDraft(String(clamped));
  }
  return (
    <input
      type="number"
      min={props.min}
      step={props.step ?? 1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); } }}
    />
  );
}

interface NodeInspectorProps {
  scene: SceneDocument;
  node: SceneNode;
  project: ProjectDocument;
  dispatch: React.Dispatch<ProjectAction>;
}

export function NodeInspector({ scene, node, project, dispatch }: NodeInspectorProps) {
  function updateNode(patch: Partial<SceneNode>) {
    dispatch({ type: "updateSceneNode", sceneId: scene.id, nodeId: node.id, patch });
  }

  function updateData(data: SceneNode["data"]) {
    dispatch({ type: "updateSceneNodeData", sceneId: scene.id, nodeId: node.id, data });
  }

  function updateTransform(patch: Partial<Transform2D>) {
    updateNode({ transform: { ...node.transform, ...patch } });
  }

  return (
    <div className="inspector-list" style={{ fontSize: "0.78rem" }}>
      {/* Name */}
      <label>
        Name
        <input
          value={node.name}
          onChange={(e) => updateNode({ name: e.target.value })}
        />
      </label>

      {/* Transform */}
      <div className="inspector-section-label">Transform</div>
      <div className="inspector-row inspector-row-2">
        <label>X <DraftInput value={node.transform.x} step={1} onCommit={(v) => updateTransform({ x: v })} /></label>
        <label>Y <DraftInput value={node.transform.y} step={1} onCommit={(v) => updateTransform({ y: v })} /></label>
      </div>
      <div className="inspector-row inspector-row-2">
        <label>Rotation <DraftInput value={node.transform.rotation} step={1} onCommit={(v) => updateTransform({ rotation: v })} /></label>
      </div>
      <div className="inspector-row inspector-row-2">
        <label>Scale X <DraftInput value={node.transform.scaleX} step={0.1} onCommit={(v) => updateTransform({ scaleX: v })} /></label>
        <label>Scale Y <DraftInput value={node.transform.scaleY} step={0.1} onCommit={(v) => updateTransform({ scaleY: v })} /></label>
      </div>

      {/* Render & Physics */}
      <div className="inspector-section-label">Display</div>
      <div className="inspector-row inspector-row-2">
        <label>Render Layer <DraftInput value={node.renderLayer} min={0} onCommit={(v) => updateNode({ renderLayer: v })} /></label>
      </div>
      <div className="inspector-row inspector-row-2">
        <label>Parallax X <DraftInput value={node.parallaxX} step={0.1} onCommit={(v) => updateNode({ parallaxX: v })} /></label>
        <label>Parallax Y <DraftInput value={node.parallaxY} step={0.1} onCommit={(v) => updateNode({ parallaxY: v })} /></label>
      </div>

      {/* Script */}
      <div className="inspector-section-label">Script</div>
      <label>
        Script ID
        <input
          value={node.scriptId}
          onChange={(e) => updateNode({ scriptId: e.target.value })}
          placeholder="none"
        />
      </label>

      {/* Type-specific */}
      {node.data.type === "TileMap" && <TileMapInspector data={node.data} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "Sprite" && <SpriteInspector data={node.data} slices={project.slices} sprites={project.sprites} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "CollisionShape" && <CollisionInspector data={node.data} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "Area" && <AreaInspector data={node.data} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "Light2D" && <LightInspector data={node.data} onUpdate={(d) => updateData(d)} />}
    </div>
  );
}

function TileMapInspector({ data, onUpdate }: { data: TileMapNodeData; onUpdate: (d: TileMapNodeData) => void }) {
  return (
    <>
      <div className="inspector-section-label">TileMap</div>
      <div className="inspector-row inspector-row-2">
        <label>Map W <DraftInput value={data.mapWidthTiles} min={1} onCommit={(v) => onUpdate({ ...data, mapWidthTiles: v })} /></label>
        <label>Map H <DraftInput value={data.mapHeightTiles} min={1} onCommit={(v) => onUpdate({ ...data, mapHeightTiles: v })} /></label>
      </div>
      <div className="inspector-row inspector-row-2">
        <label>Tile W <DraftInput value={data.tileWidth} min={1} onCommit={(v) => onUpdate({ ...data, tileWidth: v })} /></label>
        <label>Tile H <DraftInput value={data.tileHeight} min={1} onCommit={(v) => onUpdate({ ...data, tileHeight: v })} /></label>
      </div>
      <div className="inspector-row inspector-row-2">
        <label>Chunk W <DraftInput value={data.chunkWidthTiles} min={1} onCommit={(v) => onUpdate({ ...data, chunkWidthTiles: v })} /></label>
        <label>Chunk H <DraftInput value={data.chunkHeightTiles} min={1} onCommit={(v) => onUpdate({ ...data, chunkHeightTiles: v })} /></label>
      </div>
      <label>
        Projection
        <select
          value={data.projection}
          onChange={(e) => onUpdate({ ...data, projection: e.target.value as TileMapProjection })}
        >
          <option value="orthogonal">Orthogonal</option>
          <option value="isometric-diamond">Isometric (Diamond)</option>
          <option value="isometric-staggered">Isometric (Staggered)</option>
        </select>
      </label>
    </>
  );
}

function SpriteInspector({ data, slices, sprites, onUpdate }: {
  data: SpriteNodeData;
  slices: SliceAsset[];
  sprites: import("../../types").SpriteAsset[];
  onUpdate: (d: SpriteNodeData) => void;
}) {
  const atlasSliceIds = new Set(sprites.filter((s) => s.includeInAtlas).map((s) => s.sliceId));
  const availableSlices = slices.filter((s) => atlasSliceIds.has(s.id));
  return (
    <>
      <div className="inspector-section-label">Sprite</div>
      <label>
        Slice
        <select
          value={data.sliceId}
          onChange={(e) => onUpdate({ ...data, sliceId: e.target.value })}
        >
          <option value="">-- none --</option>
          {availableSlices.map((slice) => (
            <option key={slice.id} value={slice.id}>{slice.name}</option>
          ))}
        </select>
      </label>
      <label className="checkbox-row">
        <span>Flip H</span>
        <input type="checkbox" checked={data.flipH} onChange={(e) => onUpdate({ ...data, flipH: e.target.checked })} />
      </label>
      <label className="checkbox-row">
        <span>Flip V</span>
        <input type="checkbox" checked={data.flipV} onChange={(e) => onUpdate({ ...data, flipV: e.target.checked })} />
      </label>
      <label>
        Tint
        <input
          type="color"
          value={data.tintColor.slice(0, 7)}
          onChange={(e) => onUpdate({ ...data, tintColor: e.target.value + "ff" })}
        />
      </label>
    </>
  );
}

function CollisionInspector({ data, onUpdate }: { data: CollisionShapeNodeData; onUpdate: (d: CollisionShapeNodeData) => void }) {
  return (
    <>
      <div className="inspector-section-label">Collision Shape</div>
      <label>
        Shape
        <select
          value={data.shape}
          onChange={(e) => onUpdate({ ...data, shape: e.target.value as CollisionShapeNodeData["shape"] })}
        >
          <option value="rect">Rectangle</option>
          <option value="circle">Circle</option>
          <option value="polygon">Polygon</option>
        </select>
      </label>
      <div className="inspector-row inspector-row-2">
        <label>Width <DraftInput value={data.width} min={1} onCommit={(v) => onUpdate({ ...data, width: v })} /></label>
        <label>Height <DraftInput value={data.height} min={1} onCommit={(v) => onUpdate({ ...data, height: v })} /></label>
      </div>
      {data.shape === "circle" && (
        <label>Radius <DraftInput value={data.radius} min={1} onCommit={(v) => onUpdate({ ...data, radius: v })} /></label>
      )}
    </>
  );
}

function AreaInspector({ data, onUpdate }: { data: AreaNodeData; onUpdate: (d: AreaNodeData) => void }) {
  return (
    <>
      <div className="inspector-section-label">Area</div>
      <label>
        Shape
        <select
          value={data.shape}
          onChange={(e) => onUpdate({ ...data, shape: e.target.value as AreaNodeData["shape"] })}
        >
          <option value="point">Point</option>
          <option value="rect">Rectangle</option>
        </select>
      </label>
      {data.shape === "rect" && (
        <div className="inspector-row inspector-row-2">
          <label>Width <DraftInput value={data.width} min={1} onCommit={(v) => onUpdate({ ...data, width: v })} /></label>
          <label>Height <DraftInput value={data.height} min={1} onCommit={(v) => onUpdate({ ...data, height: v })} /></label>
        </div>
      )}
      <label>
        Area Tag
        <input
          value={data.areaTag}
          onChange={(e) => onUpdate({ ...data, areaTag: e.target.value })}
          placeholder="spawn_point"
        />
      </label>
    </>
  );
}

function LightInspector({ data, onUpdate }: { data: Light2DNodeData; onUpdate: (d: Light2DNodeData) => void }) {
  return (
    <>
      <div className="inspector-section-label">Light 2D</div>
      <label>
        Variant
        <select value={data.variant ?? "omni"} onChange={(e) => onUpdate({ ...data, variant: e.target.value as "omni" | "directional" })}>
          <option value="omni">Omni</option>
          <option value="directional">Directional</option>
        </select>
      </label>
      <label>Radius <DraftInput value={data.radius} min={1} onCommit={(v) => onUpdate({ ...data, radius: v })} /></label>
      <label>
        Color
        <input
          type="color"
          value={data.color}
          onChange={(e) => onUpdate({ ...data, color: e.target.value })}
        />
      </label>
      <label>Intensity <DraftInput value={data.intensity} step={0.1} min={0} onCommit={(v) => onUpdate({ ...data, intensity: v })} /></label>
      <label>Falloff <DraftInput value={data.falloff} step={0.1} min={0} onCommit={(v) => onUpdate({ ...data, falloff: v })} /></label>
      {(data.variant ?? "omni") === "directional" && (
        <>
          <label>Direction (°) <DraftInput value={data.directionAngle ?? 0} step={1} onCommit={(v) => onUpdate({ ...data, directionAngle: v })} /></label>
          <label>Cone Angle (°) <DraftInput value={data.coneAngle ?? 45} min={1} max={180} step={1} onCommit={(v) => onUpdate({ ...data, coneAngle: v })} /></label>
        </>
      )}
    </>
  );
}
