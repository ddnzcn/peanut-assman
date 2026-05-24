import type { ProjectDocument, TileMapChunk, TileMapNodeData } from "../../types";
import { buildAnimatedTileLookup, resolveAnimatedTileSliceId } from "../../animation/playback";
import { getTileAt } from "../../level/editor";
import { calculateBlob47Mask, getTerrainSetMarkerTileId } from "../../terrain";

const VERT_SRC = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
uniform vec2 u_resolution;
void main() {
  vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FRAG_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
void main() {
  vec4 color = texture2D(u_texture, v_uv);
  if (color.a < 0.01) discard;
  gl_FragColor = color;
}`;

interface TextureEntry {
  texture: WebGLTexture;
  width: number;
  height: number;
  sourceId: string;
  dataUrl: string;
}

interface WebGLTileRendererState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  posBuffer: WebGLBuffer;
  uvBuffer: WebGLBuffer;
  aPosLoc: number;
  aUvLoc: number;
  uResolutionLoc: WebGLUniformLocation;
  uTextureLoc: WebGLUniformLocation;
  textures: Map<string, TextureEntry>;
  pendingImages: Map<string, HTMLImageElement>;
}

let _state: WebGLTileRendererState | null = null;

export function initWebGLTileRenderer(canvas: HTMLCanvasElement): boolean {
  if (_state && _state.gl.canvas === canvas) return true;

  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) return false;

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return false;

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;

  const posBuffer = gl.createBuffer()!;
  const uvBuffer = gl.createBuffer()!;

  _state = {
    gl,
    program,
    posBuffer,
    uvBuffer,
    aPosLoc: gl.getAttribLocation(program, "a_pos"),
    aUvLoc: gl.getAttribLocation(program, "a_uv"),
    uResolutionLoc: gl.getUniformLocation(program, "u_resolution")!,
    uTextureLoc: gl.getUniformLocation(program, "u_texture")!,
    textures: new Map(),
    pendingImages: new Map(),
  };

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

  return true;
}

export function renderTilesWebGL(
  canvas: HTMLCanvasElement,
  project: ProjectDocument,
  tileMap: TileMapNodeData,
  zoom: number,
  animTimeMs?: number,
): void {
  if (!_state || _state.gl.canvas !== canvas) {
    if (!initWebGLTileRenderer(canvas)) return;
  }
  const { gl, program, posBuffer, uvBuffer, aPosLoc, aUvLoc, uResolutionLoc, uTextureLoc, textures, pendingImages } = _state!;

  const w = canvas.width;
  const h = canvas.height;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.071, 0.09, 0.11, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniform2f(uResolutionLoc, w, h);

  const tileById = new Map(project.tiles.map((t) => [t.tileId, t]));
  const sliceById = new Map(project.slices.map((s) => [s.id, s]));
  const sourceById = new Map(project.sourceImages.map((s) => [s.id, s]));
  const animLookup = buildAnimatedTileLookup(project.animatedTiles ?? []);
  const terrainTileToSetId = new Map<number, number>();
  const terrainSetsMap = new Map(project.terrainSets.map((s) => [s.id, s]));
  project.terrainSets.forEach((set) => {
    Object.values(set.slots).forEach((tileId) => {
      if (tileId) terrainTileToSetId.set(tileId, set.id);
    });
  });

  const tileW = tileMap.tileWidth * zoom;
  const tileH = tileMap.tileHeight * zoom;

  const batches = new Map<string, { positions: number[]; uvs: number[] }>();

  function addQuad(sourceId: string, sx: number, sy: number, sw: number, sh: number, texW: number, texH: number, dx: number, dy: number, dw: number, dh: number) {
    let batch = batches.get(sourceId);
    if (!batch) {
      batch = { positions: [], uvs: [] };
      batches.set(sourceId, batch);
    }
    const u0 = sx / texW;
    const v0 = sy / texH;
    const u1 = (sx + sw) / texW;
    const v1 = (sy + sh) / texH;

    batch.positions.push(
      dx, dy, dx + dw, dy, dx, dy + dh,
      dx + dw, dy, dx + dw, dy + dh, dx, dy + dh,
    );
    batch.uvs.push(
      u0, v0, u1, v0, u0, v1,
      u1, v0, u1, v1, u0, v1,
    );
  }

  function resolveTileQuad(tileId: number, x: number, y: number) {
    const animSliceId = animTimeMs !== undefined
      ? resolveAnimatedTileSliceId(animLookup, tileId, animTimeMs)
      : null;
    const slice = animSliceId
      ? sliceById.get(animSliceId)
      : (() => { const t = tileById.get(tileId); return t ? sliceById.get(t.sliceId) : undefined; })();
    const source = slice ? sourceById.get(slice.sourceImageId) : undefined;
    if (!slice || !source) return;
    addQuad(
      source.id,
      slice.sourceRect.x, slice.sourceRect.y,
      slice.sourceRect.width, slice.sourceRect.height,
      source.width, source.height,
      x * tileW, y * tileH, tileW, tileH,
    );
  }

  for (const chunk of Object.values(tileMap.chunks) as TileMapChunk[]) {
    for (let i = 0; i < chunk.tiles.length; i++) {
      const cell = chunk.tiles[i];
      if (!cell.tileId) continue;

      const localX = i % tileMap.chunkWidthTiles;
      const localY = Math.floor(i / tileMap.chunkWidthTiles);
      const x = chunk.chunkX * tileMap.chunkWidthTiles + localX;
      const y = chunk.chunkY * tileMap.chunkHeightTiles + localY;

      const setId = terrainTileToSetId.get(cell.tileId);
      const terrainSet = setId !== undefined ? terrainSetsMap.get(setId) : undefined;

      if (terrainSet && terrainSet.mode === "blob47") {
        const isAt = (tx: number, ty: number) => {
          if (tx < 0 || ty < 0 || tx >= tileMap.mapWidthTiles || ty >= tileMap.mapHeightTiles) return false;
          return terrainTileToSetId.get(getTileAt(tileMap, tx, ty).tileId) === setId;
        };
        const mask = calculateBlob47Mask(
          isAt(x, y - 1), isAt(x, y + 1), isAt(x - 1, y), isAt(x + 1, y),
          isAt(x - 1, y - 1), isAt(x + 1, y - 1), isAt(x - 1, y + 1), isAt(x + 1, y + 1),
        );
        resolveTileQuad(terrainSet.slots[mask] || getTerrainSetMarkerTileId(terrainSet), x, y);
        continue;
      }

      if (terrainSet && (terrainSet.mode === "subtile" || terrainSet.mode === "rpgmaker")) {
        const isAt = (tx: number, ty: number) => {
          if (tx < 0 || ty < 0 || tx >= tileMap.mapWidthTiles || ty >= tileMap.mapHeightTiles) return false;
          return terrainTileToSetId.get(getTileAt(tileMap, tx, ty).tileId) === setId;
        };
        const n = isAt(x, y - 1), s = isAt(x, y + 1), w2 = isAt(x - 1, y), e = isAt(x + 1, y);
        const nw = isAt(x - 1, y - 1), ne = isAt(x + 1, y - 1), sw = isAt(x - 1, y + 1), se = isAt(x + 1, y + 1);
        const sub = (qi: number, n1: boolean, n2: boolean, diag: boolean, xOff: number, yOff: number) => {
          let st = 0;
          if (n1 && n2) st = diag ? 4 : 3;
          else if (n1) st = 1;
          else if (n2) st = 2;
          const subTileId = terrainSet.slots[qi * 5 + st];
          if (!subTileId) return;
          const t = tileById.get(subTileId);
          const sl = t ? sliceById.get(t.sliceId) : undefined;
          const src = sl ? sourceById.get(sl.sourceImageId) : undefined;
          if (!sl || !src) return;
          addQuad(
            src.id,
            sl.sourceRect.x, sl.sourceRect.y,
            sl.sourceRect.width, sl.sourceRect.height,
            src.width, src.height,
            x * tileW + xOff * tileW / 2, y * tileH + yOff * tileH / 2,
            tileW / 2, tileH / 2,
          );
        };
        sub(0, n, w2, nw, 0, 0);
        sub(1, n, e, ne, 1, 0);
        sub(2, s, w2, sw, 0, 1);
        sub(3, s, e, se, 1, 1);
        continue;
      }

      resolveTileQuad(cell.tileId, x, y);
    }
  }

  for (const [sourceId, batch] of batches) {
    const source = sourceById.get(sourceId);
    if (!source) continue;

    let entry = textures.get(sourceId);
    if (!entry || entry.dataUrl !== source.dataUrl) {
      let img = pendingImages.get(sourceId);
      if (!img) {
        img = new Image();
        img.src = source.dataUrl;
        pendingImages.set(sourceId, img);
      }
      if (!img.complete || !img.naturalWidth) continue;

      const tex = entry?.texture ?? gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

      entry = { texture: tex, width: img.naturalWidth, height: img.naturalHeight, sourceId, dataUrl: source.dataUrl };
      textures.set(sourceId, entry);
      pendingImages.delete(sourceId);
    }

    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.uniform1i(uTextureLoc, 0);

    const posArr = new Float32Array(batch.positions);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, posArr, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

    const uvArr = new Float32Array(batch.uvs);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uvArr, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aUvLoc);
    gl.vertexAttribPointer(aUvLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, posArr.length / 2);
  }
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
