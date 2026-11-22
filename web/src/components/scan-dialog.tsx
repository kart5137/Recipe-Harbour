"use client";

import { CameraOff, Check, LoaderCircle, PackageSearch, Plus, ScanBarcode, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { normaliseBarcode } from "@/lib/barcode";
import { label } from "@/lib/labels";
import { CameraError, startScanner } from "@/lib/scanner";

type Lookup =
  | { status: "found"; code: string; name: string; brand: string; ingredient: string | null }
  | { status: "not_found" | "invalid" | "unavailable"; code?: string; message?: string };

type Phase =
  | { kind: "scanning" }
  | { kind: "looking"; code: string }
  | { kind: "result"; result: Lookup }
  | { kind: "added"; id: string };

const CAMERA_MESSAGES: Record<CameraError["kind"], string> = {
  blocked: "Camera access is blocked. Allow it in your browser settings, or type the barcode below.",
  no_camera: "No camera was found on this device. Type the barcode below instead.",
  insecure: "The camera only works over a secure (https) connection. Type the barcode below instead.",
  other: "The camera could not be started. Type the barcode below instead.",
};

type Props = { open: boolean; onClose: () => void; onAdd: (id: string) => void; have: string[] };

/** Scan a product barcode (or type it), look it up in Open Food Facts, confirm the ingredient. */
export function ScanDialog({ open, onClose, onAdd, have }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [typed, setTyped] = useState("");
  const titleId = useId();

  const stopCamera = () => {
    stopRef.current?.();
    stopRef.current = null;
  };

  const lookup = useCallback(async (code: string) => {
    stopRef.current?.();
    stopRef.current = null;
    setPhase({ kind: "looking", code });
    try {
      const res = await fetch(`/api/product/${code}`);
      const body = (await res.json()) as Lookup;
      setPhase({ kind: "result", result: body });
    } catch {
      setPhase({ kind: "result", result: { status: "unavailable" } });
    }
  }, []);

  // Open/close the native dialog with the prop.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Run the camera while the dialog is open and scanning.
  useEffect(() => {
    if (!open || phase.kind !== "scanning" || !videoRef.current) return;
    let cancelled = false;
    setStarting(true);
    setCameraError(null);
    startScanner(videoRef.current, (code) => {
      if (!cancelled) void lookup(code);
    })
      .then((stop) => {
        if (cancelled) stop();
        else stopRef.current = stop;
      })
      .catch((e) => {
        if (!cancelled) setCameraError(CAMERA_MESSAGES[e instanceof CameraError ? e.kind : "other"]);
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });
    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [open, phase.kind, lookup]);

  const close = () => {
    stopCamera();
    setPhase({ kind: "scanning" });
    setTyped("");
    onClose();
  };
  const again = () => {
    setTyped("");
    setPhase({ kind: "scanning" });
  };
  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normaliseBarcode(typed);
    if (!code) {
      setPhase({ kind: "result", result: { status: "invalid" } });
      return;
    }
    void lookup(code);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id={titleId} className="flex items-center gap-2 font-display text-xl font-semibold">
          <ScanBarcode className="size-5 text-brand" aria-hidden />
          Scan a product
        </h2>
        <button type="button" onClick={close} className="grid size-9 place-items-center rounded-full hover:bg-surface-2" aria-label="Close">
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="space-y-4 p-5">
        {phase.kind === "scanning" && (
          <>
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} muted playsInline className="size-full object-cover" aria-label="Camera preview" />
              {!cameraError && (
                <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
              )}
              {(starting || cameraError) && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">
                  {cameraError ? (
                    <span className="flex flex-col items-center gap-2">
                      <CameraOff className="size-8" aria-hidden />
                      {cameraError}
                    </span>
                  ) : (
                    <LoaderCircle className="size-8 animate-spin" aria-label="Starting camera" />
                  )}
                </div>
              )}
            </div>
            {!cameraError && <p className="text-center text-sm text-muted">Hold the barcode of a packaged food inside the frame.</p>}
          </>
        )}

        {phase.kind === "looking" && (
          <p className="flex items-center justify-center gap-2 py-10 text-muted" role="status">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            Looking up {phase.code}…
          </p>
        )}

        {phase.kind === "result" && <ResultView result={phase.result} have={have} onAdd={(id) => {
          onAdd(id);
          setPhase({ kind: "added", id });
        }} onAgain={again} />}

        {phase.kind === "added" && (
          <div className="space-y-4 py-4 text-center" role="status">
            <p className="inline-flex items-center gap-2 rounded-full bg-have-soft px-4 py-2 font-semibold text-have">
              <Check className="size-4" aria-hidden />
              Added {label(phase.id)}
            </p>
            <div className="flex justify-center gap-3">
              <button type="button" onClick={again} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink">
                Scan another
              </button>
              <button type="button" onClick={close} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold">
                Done
              </button>
            </div>
          </div>
        )}

        {(phase.kind === "scanning" || phase.kind === "result") && (
          <form onSubmit={submitTyped} className="flex gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              inputMode="numeric"
              placeholder="Or type the barcode number"
              aria-label="Barcode number"
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
            <button type="submit" className="rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink disabled:opacity-50" disabled={!typed.trim()}>
              Look up
            </button>
          </form>
        )}
      </div>

      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        Product data from{" "}
        <a href="https://world.openfoodfacts.org" className="underline underline-offset-2 hover:text-ink">
          Open Food Facts
        </a>{" "}
        contributors, available under the{" "}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" className="underline underline-offset-2 hover:text-ink">
          ODbL
        </a>
        .
      </p>
    </dialog>
  );
}

function ResultView({ result, have, onAdd, onAgain }: { result: Lookup; have: string[]; onAdd: (id: string) => void; onAgain: () => void }) {
  if (result.status === "found") {
    const id = result.ingredient;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-surface-2 p-4">
          <PackageSearch className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="font-semibold">{result.name}</p>
            <p className="text-sm text-muted">
              {[result.brand, result.code].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {id ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              Ingredient: <span className="font-semibold">{label(id)}</span>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onAgain} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
                Scan again
              </button>
              {have.includes(id) ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-have-soft px-4 py-2 text-sm font-semibold text-have">
                  <Check className="size-4" aria-hidden /> Already added
                </span>
              ) : (
                <button type="button" onClick={() => onAdd(id)} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
                  <Plus className="size-4" aria-hidden /> Add {label(id)}
                </button>
              )}
            </div>
          </div>
        ) : (
          <Message text="We could not tell which recipe ingredient this product is. Type it in the search box instead." onAgain={onAgain} />
        )}
      </div>
    );
  }
  const text = {
    not_found: "This barcode is not in Open Food Facts yet. Type the ingredient in the search box instead.",
    invalid: "That is not a valid product barcode. Check the digits under the bars.",
    unavailable: "The product database is not answering right now. Try again in a minute.",
  }[result.status];
  return <Message text={text} onAgain={onAgain} />;
}

function Message({ text, onAgain }: { text: string; onAgain: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-miss/30 bg-miss-soft p-4 text-sm">
      <p>{text}</p>
      <button type="button" onClick={onAgain} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold">
        Scan again
      </button>
    </div>
  );
}
