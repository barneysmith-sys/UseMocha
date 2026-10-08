export type TerrainField = {
  count: number;
  sourceWidth: number;
  sourceHeight: number;
  /** xyz: u, v, depth */
  position: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  square: Float32Array;
  ridge: Float32Array;
  seed: Float32Array;
};

const HEADER = 12;
const STRIDE = 10;

export async function loadTerrain(url = "/terrain/alpine.bin"): Promise<TerrainField> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Terrain failed to load (${response.status})`);
  const buffer = await response.arrayBuffer();
  return decodeTerrain(buffer);
}

export function decodeTerrain(buffer: ArrayBuffer): TerrainField {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== "MALP") throw new Error("Unrecognized terrain field");
  const count = view.getUint32(4, true);
  const sourceWidth = view.getUint16(8, true);
  const sourceHeight = view.getUint16(10, true);
  const position = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  const square = new Float32Array(count);
  const ridge = new Float32Array(count);
  const seed = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const o = HEADER + i * STRIDE;
    const u = view.getUint16(o, true) / 65535;
    const v = view.getUint16(o + 2, true) / 65535;
    const depth = view.getUint8(o + 8) / 255;
    position[i * 3] = u;
    position[i * 3 + 1] = v;
    position[i * 3 + 2] = depth;
    size[i] = (view.getUint8(o + 4) / 255) * 10;
    alpha[i] = view.getUint8(o + 5) / 255;
    square[i] = view.getUint8(o + 6) > 0 ? 1 : 0;
    ridge[i] = view.getUint8(o + 7) / 255;
    seed[i] = view.getUint8(o + 9) / 255;
  }

  return { count, sourceWidth, sourceHeight, position, size, alpha, square, ridge, seed };
}

/** Keep squares, crests, and a random slice of the body. */
export function decimateTerrain(field: TerrainField, ratio: number): TerrainField {
  if (ratio >= 0.98) return field;
  const keep: number[] = [];
  for (let i = 0; i < field.count; i++) {
    const important = field.square[i] > 0.5 || field.alpha[i] > 0.84 || field.ridge[i] > 0.78;
    if (important || field.seed[i] <= ratio) keep.push(i);
  }
  const count = keep.length;
  const position = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const alpha = new Float32Array(count);
  const square = new Float32Array(count);
  const ridge = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let n = 0; n < count; n++) {
    const i = keep[n];
    position[n * 3] = field.position[i * 3];
    position[n * 3 + 1] = field.position[i * 3 + 1];
    position[n * 3 + 2] = field.position[i * 3 + 2];
    size[n] = field.size[i];
    alpha[n] = field.alpha[i];
    square[n] = field.square[i];
    ridge[n] = field.ridge[i];
    seed[n] = field.seed[i];
  }
  return { ...field, count, position, size, alpha, square, ridge, seed };
}

export function prefersStaticLandscape() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("landscape") === "static";
}

export function canUseWebGL() {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
