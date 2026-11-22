/**
 * The produce classifier in the browser (TensorFlow.js). TensorFlow.js and the 4.7 MB model
 * are loaded on first use only; the image is centre-cropped to a square and resized to
 * 224 x 224, like the training crops. The model rescales 0-255 RGB itself.
 */
import type { Labels } from "./classify-result.ts";

type Tf = typeof import("@tensorflow/tfjs");
type LayersModel = import("@tensorflow/tfjs").LayersModel;

export type Classifier = {
  labels: Labels;
  backend: string;
  classify(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<{
    probs: Float32Array;
    ms: number;
  }>;
};

let loading: Promise<Classifier> | null = null;

export function loadClassifier(onProgress?: (fraction: number) => void): Promise<Classifier> {
  loading ??= load(onProgress).catch((e) => {
    loading = null; // allow a retry after a network error
    throw e;
  });
  return loading;
}

async function load(onProgress?: (fraction: number) => void): Promise<Classifier> {
  const tf: Tf = await import("@tensorflow/tfjs");
  try {
    await tf.setBackend("webgl");
  } catch {
    await tf.setBackend("cpu");
  }
  await tf.ready();
  const [model, labels] = await Promise.all([
    tf.loadLayersModel("/model/model.json", { onProgress }) as Promise<LayersModel>,
    fetch("/model/labels.json").then((r) => {
      if (!r.ok) throw new Error(`labels.json: ${r.status}`);
      return r.json() as Promise<Labels>;
    }),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 224;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  // Warm-up run so the first real photo is not slowed by shader compilation.
  tf.tidy(() => model.predict(tf.zeros([1, 224, 224, 3])));

  return {
    labels,
    backend: tf.getBackend(),
    async classify(source) {
      const w = "videoWidth" in source ? source.videoWidth : source.width;
      const h = "videoHeight" in source ? source.videoHeight : source.height;
      const side = Math.min(w, h);
      ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 224, 224);
      const t0 = performance.now();
      const out = tf.tidy(() => {
        const x = tf.browser.fromPixels(canvas).toFloat().expandDims(0);
        return model.predict(x) as import("@tensorflow/tfjs").Tensor;
      });
      const probs = (await out.data()) as Float32Array;
      out.dispose();
      return { probs, ms: performance.now() - t0 };
    },
  };
}
