/**
 * The produce recogniser in the browser (ONNX Runtime Web, WebAssembly).
 *
 * An image-text model turns the photo into a vector; head.bin holds one vector per ingredient
 * name (made from the model's own text vectors, then tuned on real photos, see
 * docs/model/MODEL_CARD.md). An ingredient's score is its best-matching name; the scores go
 * through a softmax so the dialog can show percentages.
 *
 * Everything is fetched on first use (or quietly in the background, see preloadClassifier) and
 * then comes from the browser cache. Photos never leave the device.
 */
import type { Labels } from "./classify-result.ts";

type Meta = Labels & {
  input: { size: number; mean: number[]; std: number[] };
  dim: number;
  names: string[];
  scale: number;
};

export type Classifier = {
  labels: Labels;
  backend: string;
  classify(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<{
    probs: Float32Array;
    ms: number;
  }>;
};

/**
 * Where the model files are served from. Production uses the Hugging Face copy, pinned to one
 * upload so the three files always match (model/upload_hf.py prints the value). Set
 * NEXT_PUBLIC_MODEL_BASE=/model/ to use the local files in public/model/ instead.
 */
const BASE =
  process.env.NEXT_PUBLIC_MODEL_BASE ||
  "https://huggingface.co/Gurukart/recipe-harbour-photo-model/resolve/8c4a7200fcd9ead7841e5efd173b0053e681270c/";
let loading: Promise<Classifier> | null = null;

export function loadClassifier(): Promise<Classifier> {
  loading ??= load().catch((e) => {
    loading = null; // allow a retry after a network error
    throw e;
  });
  return loading;
}

/**
 * Fetch the model while the page is idle, so the photo dialog is ready when it is opened.
 * Skipped when the browser asks to save data or the connection is slow; then it loads when
 * the dialog opens.
 */
export function preloadClassifier(): void {
  if (typeof window === "undefined" || loading) return;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData || (c?.effectiveType && c.effectiveType !== "4g")) return;
  const start = () => void loadClassifier().catch(() => {});
  if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 5000 });
  else setTimeout(start, 2000);
}

const CACHE = "rh-photo-model";

/**
 * Fetch a model file, keeping it in Cache Storage. Hugging Face redirects every download to a
 * freshly signed CDN address, so the normal HTTP cache never hits; BASE is pinned to one upload,
 * so a stored copy stays valid. Copies from other uploads are removed.
 */
async function fetchOk(url: string): Promise<Response> {
  const cache = typeof caches === "undefined" ? null : await caches.open(CACHE).catch(() => null);
  const hit = await cache?.match(url);
  if (hit) return hit;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  if (cache) {
    try {
      await cache.put(url, r.clone());
      for (const req of await cache.keys()) if (!req.url.startsWith(new URL(BASE, location.href).href)) await cache.delete(req);
    } catch {
      // storage full or not allowed (private window): keep working without the copy
    }
  }
  return r;
}

/** IEEE 754 half precision to float32. */
function halfToFloat(src: Uint16Array): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const h = src[i];
    const s = h & 0x8000 ? -1 : 1;
    const e = (h >> 10) & 0x1f;
    const f = h & 0x3ff;
    out[i] = e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}

async function load(): Promise<Classifier> {
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.wasmPaths = "/ort/";
  // Several threads need a cross-origin isolated page; otherwise ONNX Runtime uses one.
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

  const [meta, headBuf, modelBuf] = await Promise.all([
    fetchOk(BASE + "labels.json").then((r) => r.json() as Promise<Meta>),
    fetchOk(BASE + "head.bin").then((r) => r.arrayBuffer()),
    fetchOk(BASE + "vision.onnx").then((r) => r.arrayBuffer()),
  ]);
  const session = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  const head = halfToFloat(new Uint16Array(headBuf));
  const { size, mean, std } = meta.input;
  const ids = meta.classes.map((c) => c.id);
  const owner = Int32Array.from(meta.names, (id) => ids.indexOf(id));
  if (head.length !== meta.names.length * meta.dim || owner.some((i) => i < 0)) throw new Error("model files do not match");

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";

  const run = async (pixels: Float32Array) => {
    const input = new ort.Tensor("float32", pixels, [1, 3, size, size]);
    const out = await session.run({ pixel_values: input });
    return out.embeds.data as Float32Array;
  };
  await run(new Float32Array(3 * size * size)); // warm-up, so the first real photo is not slower

  return {
    labels: meta,
    backend: "wasm",
    async classify(source) {
      const w = "videoWidth" in source ? source.videoWidth : source.width;
      const h = "videoHeight" in source ? source.videoHeight : source.height;
      const side = Math.min(w, h);
      ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
      const rgba = ctx.getImageData(0, 0, size, size).data;
      const plane = size * size;
      const px = new Float32Array(3 * plane);
      for (let i = 0; i < plane; i++) {
        for (let c = 0; c < 3; c++) px[c * plane + i] = (rgba[i * 4 + c] / 255 - mean[c]) / std[c];
      }
      const t0 = performance.now();
      const e = await run(px);
      const ms = performance.now() - t0;

      // Best name per ingredient, then softmax over ingredients.
      const best = new Float32Array(ids.length).fill(-Infinity);
      for (let n = 0; n < owner.length; n++) {
        let dot = 0;
        const off = n * meta.dim;
        for (let k = 0; k < meta.dim; k++) dot += head[off + k] * e[k];
        if (dot > best[owner[n]]) best[owner[n]] = dot;
      }
      const top = Math.max(...best);
      let sum = 0;
      const probs = best.map((v) => {
        const x = Math.exp(meta.scale * (v - top));
        sum += x;
        return x;
      });
      for (let i = 0; i < probs.length; i++) probs[i] /= sum;
      return { probs, ms };
    },
  };
}
