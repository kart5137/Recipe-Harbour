// Copy the ONNX Runtime Web WebAssembly files to public/ort/, where the photo recogniser loads
// them from (src/lib/classifier.ts). Runs before dev and build; the copies are not committed.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm"));
const out = join(import.meta.dirname, "..", "public", "ort");
mkdirSync(out, { recursive: true });
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) copyFileSync(join(dist, f), join(out, f));
console.log("copied ONNX Runtime files to public/ort");
