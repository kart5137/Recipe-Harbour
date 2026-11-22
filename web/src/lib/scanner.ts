/**
 * Camera barcode reading in the browser. Uses the built-in BarcodeDetector where it
 * supports retail formats (Chrome on Android, Safari 17+ on macOS); otherwise ZXing, which
 * is loaded only when the scanner opens. Only codes with a valid check digit are reported.
 */
import { normaliseBarcode } from "./barcode.ts";

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = {
  new (opts: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

const RETAIL = ["ean_13", "ean_8", "upc_a", "upc_e"];
const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

export class CameraError extends Error {
  constructor(public kind: "blocked" | "no_camera" | "insecure" | "other", message: string) {
    super(message);
  }
}

function cameraError(e: unknown): CameraError {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return new CameraError("blocked", name);
  if (name === "NotFoundError" || name === "OverconstrainedError") return new CameraError("no_camera", name);
  return new CameraError("other", String((e as Error)?.message ?? e));
}

/** Start reading barcodes from the camera into `video`. Resolves to a stop function. */
export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("insecure", "Camera API unavailable (needs HTTPS)");
  }
  const report = (raw: string) => {
    const code = normaliseBarcode(raw);
    if (code) onCode(code);
  };

  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  const nativeFormats = Native ? await Native.getSupportedFormats().catch(() => [] as string[]) : [];
  if (Native && RETAIL.some((f) => nativeFormats.includes(f))) {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
    } catch (e) {
      throw cameraError(e);
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    const detector = new Native({ formats: RETAIL.filter((f) => nativeFormats.includes(f)) });
    let busy = false;
    const timer = setInterval(async () => {
      if (busy || video.readyState < 2) return;
      busy = true;
      try {
        const found = await detector.detect(video);
        if (found[0]) report(found[0].rawValue);
      } catch {
        /* a frame that could not be read */
      } finally {
        busy = false;
      }
    }, 200);
    return () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }

  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ]);
  const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
  try {
    const controls = await reader.decodeFromConstraints(CONSTRAINTS, video, (result) => {
      if (result) report(result.getText());
    });
    return () => controls.stop();
  } catch (e) {
    throw cameraError(e);
  }
}
