import { useEffect, useState } from "react";
import type {
  AnimatedSpriteNodeData,
  AreaNodeData,
  Camera2DNodeData,
  CollisionShapeNodeData,
  DecalNodeData,
  Light2DNodeData,
  NavRegion2DNodeData,
  Path2DNodeData,
  PathFollow2DNodeData,
  ProjectAction,
  ProjectDocument,
  SceneDocument,
  SceneNode,
  SliceAsset,
  SpawnerNodeData,
  SpriteAnimation,
  SpriteAsset,
  SpriteNodeData,
  TileMapNodeData,
  TileMapProjection,
  TimerNodeData,
  Transform2D,
  VisibilityNotifierNodeData,
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
      {node.data.type === "AnimatedSprite" && <AnimatedSpriteInspector data={node.data} spriteAnimations={project.spriteAnimations} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "Camera2D" && <Camera2DInspector data={node.data} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "Spawner" && <SpawnerInspector data={node.data} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "Timer" && <TimerInspector data={node.data} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "VisibilityNotifier" && <VisibilityNotifierInspector data={node.data} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "Decal" && <DecalInspector data={node.data} slices={project.slices} sprites={project.sprites} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "Path2D" && <Path2DInspector data={node.data} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "PathFollow2D" && <PathFollow2DInspector data={node.data} onUpdate={(d) => updateData(d)} />}
      {node.data.type === "NavRegion2D" && <NavRegion2DInspector data={node.data} onUpdate={(d) => updateData(d)} />}
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

function AnimatedSpriteInspector({ data, spriteAnimations, onUpdate }: { data: AnimatedSpriteNodeData; spriteAnimations: SpriteAnimation[]; onUpdate: (d: AnimatedSpriteNodeData) => void }) {
  const ids = data.spriteAnimationIds;
  function toggleAnim(id: number) {
    const next = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
    onUpdate({ ...data, spriteAnimationIds: next });
  }
  return (
    <>
      <div className="inspector-section-label">Animated Sprite</div>
      <div className="inspector-section-label" style={{ fontSize: "0.7rem", opacity: 0.7 }}>Animations ({ids.length})</div>
      <div style={{ maxHeight: 120, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {spriteAnimations.length === 0 && <span style={{ fontSize: "0.7rem", opacity: 0.5 }}>No animations defined</span>}
        {spriteAnimations.map((anim) => (
          <label key={anim.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem" }}>
            <input type="checkbox" checked={ids.includes(anim.id)} onChange={() => toggleAnim(anim.id)} />
            {anim.name}
          </label>
        ))}
      </div>
      <label><input type="checkbox" checked={data.flipH} onChange={(e) => onUpdate({ ...data, flipH: e.target.checked })} /> Flip H</label>
      <label><input type="checkbox" checked={data.flipV} onChange={(e) => onUpdate({ ...data, flipV: e.target.checked })} /> Flip V</label>
      <label>
        Tint
        <input type="color" value={data.tintColor.slice(0, 7)} onChange={(e) => onUpdate({ ...data, tintColor: e.target.value })} />
      </label>
    </>
  );
}

function Camera2DInspector({ data, onUpdate }: { data: Camera2DNodeData; onUpdate: (d: Camera2DNodeData) => void }) {
  return (
    <>
      <div className="inspector-section-label">Camera 2D</div>
      <label>Zoom <DraftInput value={data.zoom} step={0.1} min={0.1} onCommit={(v) => onUpdate({ ...data, zoom: v })} /></label>
      <label>Smoothing <DraftInput value={data.smoothingSpeed} step={0.1} min={0} onCommit={(v) => onUpdate({ ...data, smoothingSpeed: v })} /></label>
      <label className="checkbox-row"><span>Is Current</span><input type="checkbox" checked={data.isCurrent} onChange={(e) => onUpdate({ ...data, isCurrent: e.target.checked })} /></label>
      <label className="checkbox-row"><span>Use Bounds</span><input type="checkbox" checked={data.useBounds} onChange={(e) => onUpdate({ ...data, useBounds: e.target.checked })} /></label>
      {data.useBounds && (
        <>
          <label>Left <DraftInput value={data.boundsLeft} step={1} onCommit={(v) => onUpdate({ ...data, boundsLeft: v })} /></label>
          <label>Top <DraftInput value={data.boundsTop} step={1} onCommit={(v) => onUpdate({ ...data, boundsTop: v })} /></label>
          <label>Right <DraftInput value={data.boundsRight} step={1} onCommit={(v) => onUpdate({ ...data, boundsRight: v })} /></label>
          <label>Bottom <DraftInput value={data.boundsBottom} step={1} onCommit={(v) => onUpdate({ ...data, boundsBottom: v })} /></label>
        </>
      )}
      <label>Follow Target<input type="text" value={data.followTargetName} onChange={(e) => onUpdate({ ...data, followTargetName: e.target.value })} placeholder="node name" /></label>
    </>
  );
}

function SpawnerInspector({ data, onUpdate }: { data: SpawnerNodeData; onUpdate: (d: SpawnerNodeData) => void }) {
  return (
    <>
      <div className="inspector-section-label">Spawner</div>
      <label>Scene<input type="text" value={data.sceneName} onChange={(e) => onUpdate({ ...data, sceneName: e.target.value })} placeholder="scene name" /></label>
      <label>Interval (ms) <DraftInput value={data.spawnIntervalMs} step={50} min={0} onCommit={(v) => onUpdate({ ...data, spawnIntervalMs: v })} /></label>
      <label>Max Alive <DraftInput value={data.maxAlive} step={1} min={0} onCommit={(v) => onUpdate({ ...data, maxAlive: v })} /></label>
      <label className="checkbox-row"><span>Auto Start</span><input type="checkbox" checked={data.autoStart} onChange={(e) => onUpdate({ ...data, autoStart: e.target.checked })} /></label>
      <label>Area Radius <DraftInput value={data.spawnAreaRadius} step={1} min={0} onCommit={(v) => onUpdate({ ...data, spawnAreaRadius: v })} /></label>
    </>
  );
}

function TimerInspector({ data, onUpdate }: { data: TimerNodeData; onUpdate: (d: TimerNodeData) => void }) {
  return (
    <>
      <div className="inspector-section-label">Timer</div>
      <label>Wait Time (ms) <DraftInput value={data.waitTimeMs} step={50} min={0} onCommit={(v) => onUpdate({ ...data, waitTimeMs: v })} /></label>
      <label className="checkbox-row"><span>One Shot</span><input type="checkbox" checked={data.oneShot} onChange={(e) => onUpdate({ ...data, oneShot: e.target.checked })} /></label>
      <label className="checkbox-row"><span>Auto Start</span><input type="checkbox" checked={data.autoStart} onChange={(e) => onUpdate({ ...data, autoStart: e.target.checked })} /></label>
      <label>Event<input type="text" value={data.eventName} onChange={(e) => onUpdate({ ...data, eventName: e.target.value })} placeholder="event name" /></label>
    </>
  );
}

function VisibilityNotifierInspector({ data, onUpdate }: { data: VisibilityNotifierNodeData; onUpdate: (d: VisibilityNotifierNodeData) => void }) {
  return (
    <>
      <div className="inspector-section-label">Visibility Notifier</div>
      <label>Width <DraftInput value={data.width} step={1} min={1} onCommit={(v) => onUpdate({ ...data, width: v })} /></label>
      <label>Height <DraftInput value={data.height} step={1} min={1} onCommit={(v) => onUpdate({ ...data, height: v })} /></label>
      <label>Enter Event<input type="text" value={data.enterEventName} onChange={(e) => onUpdate({ ...data, enterEventName: e.target.value })} placeholder="event name" /></label>
      <label>Exit Event<input type="text" value={data.exitEventName} onChange={(e) => onUpdate({ ...data, exitEventName: e.target.value })} placeholder="event name" /></label>
    </>
  );
}

function DecalInspector({ data, slices, sprites, onUpdate }: { data: DecalNodeData; slices: SliceAsset[]; sprites: SpriteAsset[]; onUpdate: (d: DecalNodeData) => void }) {
  const atlasSliceIds = new Set(sprites.filter((s) => s.includeInAtlas).map((s) => s.sliceId));
  const availableSlices = slices.filter((s) => atlasSliceIds.has(s.id));
  return (
    <>
      <div className="inspector-section-label">Decal</div>
      <label>Slice<select value={data.sliceId} onChange={(e) => onUpdate({ ...data, sliceId: e.target.value })}>
        <option value="">-- none --</option>
        {availableSlices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
      <label>Blend<select value={data.blendMode} onChange={(e) => onUpdate({ ...data, blendMode: e.target.value as DecalNodeData["blendMode"] })}>
        <option value="alpha">Alpha</option>
        <option value="additive">Additive</option>
        <option value="multiply">Multiply</option>
      </select></label>
      <label>Sort Offset <DraftInput value={data.sortOffset} step={1} onCommit={(v) => onUpdate({ ...data, sortOffset: v })} /></label>
      <label className="checkbox-row"><span>Flip H</span><input type="checkbox" checked={data.flipH} onChange={(e) => onUpdate({ ...data, flipH: e.target.checked })} /></label>
      <label className="checkbox-row"><span>Flip V</span><input type="checkbox" checked={data.flipV} onChange={(e) => onUpdate({ ...data, flipV: e.target.checked })} /></label>
      <label>Tint<input type="color" value={data.tintColor.slice(0, 7)} onChange={(e) => onUpdate({ ...data, tintColor: e.target.value })} /></label>
    </>
  );
}

function Path2DInspector({ data, onUpdate }: { data: Path2DNodeData; onUpdate: (d: Path2DNodeData) => void }) {
  return (
    <>
      <div className="inspector-section-label">Path 2D</div>
      <label className="checkbox-row"><span>Closed</span><input type="checkbox" checked={data.closed} onChange={(e) => onUpdate({ ...data, closed: e.target.checked })} /></label>
      <label>Color<input type="color" value={data.color.slice(0, 7)} onChange={(e) => onUpdate({ ...data, color: e.target.value })} /></label>
      <div className="inspector-section-label" style={{ fontSize: "0.7rem", opacity: 0.7 }}>Points ({data.points.length}) — drag on canvas, shift-click segment to add, alt-click handle to remove</div>
    </>
  );
}

function PathFollow2DInspector({ data, onUpdate }: { data: PathFollow2DNodeData; onUpdate: (d: PathFollow2DNodeData) => void }) {
  return (
    <>
      <div className="inspector-section-label">Path Follow 2D</div>
      <label>Path Target<input type="text" value={data.pathNodeName} onChange={(e) => onUpdate({ ...data, pathNodeName: e.target.value })} placeholder="path node name" /></label>
      <label>Progress <DraftInput value={data.progress} step={0.01} min={0} max={1} onCommit={(v) => onUpdate({ ...data, progress: v })} /></label>
      <label className="checkbox-row"><span>Loop</span><input type="checkbox" checked={data.loop} onChange={(e) => onUpdate({ ...data, loop: e.target.checked })} /></label>
      <label className="checkbox-row"><span>Rotate To Path</span><input type="checkbox" checked={data.rotateToPath} onChange={(e) => onUpdate({ ...data, rotateToPath: e.target.checked })} /></label>
      <label className="checkbox-row"><span>Cubic Interp</span><input type="checkbox" checked={data.cubicInterp} onChange={(e) => onUpdate({ ...data, cubicInterp: e.target.checked })} /></label>
      <label>Loop Time (ms) <DraftInput value={data.loopOffsetMs} step={100} min={0} onCommit={(v) => onUpdate({ ...data, loopOffsetMs: v })} /></label>
    </>
  );
}

function NavRegion2DInspector({ data, onUpdate }: { data: NavRegion2DNodeData; onUpdate: (d: NavRegion2DNodeData) => void }) {
  function setBit(bit: number, on: boolean) {
    const next = on ? (data.navLayer | (1 << bit)) : (data.navLayer & ~(1 << bit));
    onUpdate({ ...data, navLayer: next & 0xff });
  }
  return (
    <>
      <div className="inspector-section-label">Nav Region 2D</div>
      <div className="inspector-section-label" style={{ fontSize: "0.7rem", opacity: 0.7 }}>Nav Layer (bits 0..7)</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {Array.from({ length: 8 }, (_, i) => (
          <label key={i} style={{ display: "flex", alignItems: "center", gap: 2, fontSize: "0.7rem" }}>
            <input type="checkbox" checked={(data.navLayer & (1 << i)) !== 0} onChange={(e) => setBit(i, e.target.checked)} />{i}
          </label>
        ))}
      </div>
      <div className="inspector-section-label" style={{ fontSize: "0.7rem", opacity: 0.7 }}>Points ({data.points.length}) — drag on canvas, shift-click segment to add, alt-click handle to remove (min 3)</div>
    </>
  );
}
