"use client";

import { CameraOff, Check, LoaderCircle, PackageSearch, Plus, ScanBarcode, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { normaliseBarcode } from "@/lib/barcode";
import { useDict, useLocale } from "@/components/locale";
import type { Dict, Locale } from "@/lib/i18n";
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

type Props = { open: boolean; onClose: () => void; onAdd: (id: string) => void; have: string[] };

/** Scan a product barcode (or type it), look it up in Open Food Facts, confirm the ingredient. */
export function ScanDialog({ open, onClose, onAdd, have }: Props) {
  const t = useDict();
  const lang = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [cameraError, setCameraError] = useState<CameraError["kind"] | null>(null);
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
        if (!cancelled) setCameraError(e instanceof CameraError ? e.kind : "other");
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
          {t.scan.title}
        </h2>
        <button type="button" onClick={close} className="grid size-9 place-items-center rounded-full hover:bg-surface-2" aria-label={t.scan.close}>
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="space-y-4 p-5">
        {phase.kind === "scanning" && (
          <>
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} muted playsInline className="size-full object-cover" aria-label={t.scan.cameraPreview} />
              {!cameraError && (
                <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
              )}
              {(starting || cameraError) && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">
                  {cameraError ? (
                    <span className="flex flex-col items-center gap-2">
                      <CameraOff className="size-8" aria-hidden />
                      {t.scan.camera[cameraError]}
                    </span>
                  ) : (
                    <LoaderCircle className="size-8 animate-spin" aria-label={t.scan.starting} />
                  )}
                </div>
              )}
            </div>
            {!cameraError && <p className="text-center text-sm text-muted">{t.scan.hold}</p>}
          </>
        )}

        {phase.kind === "looking" && (
          <p className="flex items-center justify-center gap-2 py-10 text-muted" role="status">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            {t.scan.looking(phase.code)}
          </p>
        )}

        {phase.kind === "result" && <ResultView t={t} lang={lang} result={phase.result} have={have} onAdd={(id) => {
          onAdd(id);
          setPhase({ kind: "added", id });
        }} onAgain={again} />}

        {phase.kind === "added" && (
          <div className="space-y-4 py-4 text-center" role="status">
            <p className="inline-flex items-center gap-2 rounded-full bg-have-soft px-4 py-2 font-semibold text-have">
              <Check className="size-4" aria-hidden />
              {t.scan.added(label(phase.id, lang))}
            </p>
            <div className="flex justify-center gap-3">
              <button type="button" onClick={again} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink">
                {t.scan.another}
              </button>
              <button type="button" onClick={close} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold">
                {t.scan.done}
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
              placeholder={t.scan.typed}
              aria-label={t.scan.typedAria}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
            <button type="submit" className="rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink disabled:opacity-50" disabled={!typed.trim()}>
              {t.scan.lookUp}
            </button>
          </form>
        )}
      </div>

      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        {t.scan.credit[0]}{" "}
        <a href="https://world.openfoodfacts.org" className="underline underline-offset-2 hover:text-ink">
          {t.scan.credit[1]}
        </a>{" "}
        {t.scan.credit[2]}{" "}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" className="underline underline-offset-2 hover:text-ink">
          {t.scan.credit[3]}
        </a>
        {t.scan.credit[4]}
      </p>
    </dialog>
  );
}

type ResultProps = { t: Dict; lang: Locale; result: Lookup; have: string[]; onAdd: (id: string) => void; onAgain: () => void };

function ResultView({ t, lang, result, have, onAdd, onAgain }: ResultProps) {
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
              {t.scan.ingredient} <span className="font-semibold">{label(id, lang)}</span>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onAgain} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
                {t.scan.again}
              </button>
              {have.includes(id) ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-have-soft px-4 py-2 text-sm font-semibold text-have">
                  <Check className="size-4" aria-hidden /> {t.scan.already}
                </span>
              ) : (
                <button type="button" onClick={() => onAdd(id)} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
                  <Plus className="size-4" aria-hidden /> {t.scan.add(label(id, lang))}
                </button>
              )}
            </div>
          </div>
        ) : (
          <Message text={t.scan.noMatch} again={t.scan.again} onAgain={onAgain} />
        )}
      </div>
    );
  }
  const text = { not_found: t.scan.notFound, invalid: t.scan.invalid, unavailable: t.scan.unavailable }[result.status];
  return <Message text={text} again={t.scan.again} onAgain={onAgain} />;
}

function Message({ text, again, onAgain }: { text: string; again: string; onAgain: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-miss/30 bg-miss-soft p-4 text-sm">
      <p>{text}</p>
      <button type="button" onClick={onAgain} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold">
        {again}
      </button>
    </div>
  );
}
