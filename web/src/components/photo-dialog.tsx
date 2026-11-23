"use client";

import { Camera, CameraOff, Check, ImageUp, LoaderCircle, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { type Classifier, loadClassifier } from "@/lib/classifier";
import { type Guess, type Interpretation, interpret, offeredIds } from "@/lib/classify-result";
import { useDict, useLocale } from "@/components/locale";
import type { Dict, Locale } from "@/lib/i18n";
import { label } from "@/lib/labels";

type Phase =
  | { kind: "failed" }
  | { kind: "ready" }
  | { kind: "analysing"; preview: string }
  | { kind: "result"; preview: string; result: Interpretation }
  | { kind: "added"; id: string };

type Props = { open: boolean; onClose: () => void; onAdd: (id: string) => void; have: string[] };

const pct = (p: number) => `${Math.round(p * 100)} %`;
/** What the model recognises, without the search label's broader wording ("Radish & root veg" -> "radish").
 *  German nouns keep their capital letter. */
const seen = (id: string, lang: Locale) => {
  const s = label(id, lang).split(" & ")[0];
  return lang === "de" ? s : s.toLowerCase();
};

/** Recognise a fruit or vegetable in a photo, on the device, and confirm it as an ingredient. */
export function PhotoDialog({ open, onClose, onAdd, have }: Props) {
  const t = useDict();
  const lang = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clfRef = useRef<Classifier | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });
  const [camera, setCamera] = useState<"off" | "starting" | "on" | string>("starting");
  const [offered, setOffered] = useState<string[]>([]);
  const [perf, setPerf] = useState<{ backend: string; ms: number } | null>(null); // diagnostics only
  const titleId = useId();

  /** Move to the "ready" screen; the camera starts if the browser has one. */
  const toReady = () => {
    const hasCamera = typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
    setCamera(hasCamera ? "starting" : "unavailable");
    setPhase({ kind: "ready" });
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("off");
  };

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // The camera starts straight away; the model loads quietly behind it (usually it was
  // already fetched in the background, see preloadClassifier).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadClassifier()
      .then((c) => {
        if (cancelled) return;
        clfRef.current = c;
        setOffered(offeredIds(c.labels));
      })
      .catch(() => {}); // reported if a photo is taken before it works
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Live camera while ready ("starting" is set by toReady before this runs).
  useEffect(() => {
    if (!open || phase.kind !== "ready" || camera !== "starting" || !videoRef.current) return;
    let cancelled = false;
    const media = navigator.mediaDevices;
    (media?.getUserMedia
      ? media.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } })
      : Promise.reject({ name: "NotSupportedError" }))
      .then(async (stream) => {
        if (cancelled || !videoRef.current) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        setCamera("on");
      })
      .catch((e: { name?: string }) => !cancelled && setCamera(e?.name === "NotAllowedError" ? "blocked" : "unavailable"));
    return () => {
      cancelled = true;
    };
  }, [open, phase.kind, camera]);

  // Release the camera when the dialog closes or the component goes away.
  useEffect(() => {
    if (open) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [open]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const analyse = async (source: HTMLVideoElement | ImageBitmap, preview: string) => {
    setPhase({ kind: "analysing", preview });
    let clf: Classifier;
    try {
      clf = clfRef.current ?? (await loadClassifier());
    } catch {
      setPhase({ kind: "failed" });
      return;
    }
    clfRef.current = clf;
    const { probs, ms } = await clf.classify(source);
    setPerf({ backend: clf.backend, ms: Math.round(ms) });
    setPhase({ kind: "result", preview, result: interpret(probs, clf.labels) });
  };

  const takePhoto = async () => {
    const v = videoRef.current;
    if (!v || camera !== "on") return;
    const c = document.createElement("canvas");
    const side = Math.min(v.videoWidth, v.videoHeight);
    c.width = c.height = 320;
    c.getContext("2d")!.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, 320, 320);
    const bitmap = await createImageBitmap(c);
    stopCamera();
    await analyse(bitmap, c.toDataURL("image/jpeg", 0.85));
  };

  const fromFile = async (file: File | undefined) => {
    if (!file) return;
    stopCamera();
    const bitmap = await createImageBitmap(file);
    await analyse(bitmap, URL.createObjectURL(file));
  };

  const again = () => toReady();
  const add = (id: string) => {
    onAdd(id);
    setPhase({ kind: "added", id });
  };
  const close = () => {
    stopCamera();
    setPhase({ kind: "ready" });
    setCamera("starting"); // starts again when the dialog is next opened
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-backend={perf?.backend}
      data-inference-ms={perf?.ms}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-3xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id={titleId} className="flex items-center gap-2 font-display text-xl font-semibold">
          <Camera className="size-5 text-brand" aria-hidden />
          {t.photo.title}
        </h2>
        <button type="button" onClick={close} className="grid size-9 place-items-center rounded-full hover:bg-surface-2" aria-label={t.scan.close}>
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="space-y-4 p-5">
        {phase.kind === "failed" && (
          <div className="space-y-3">
            <p className="rounded-2xl border border-miss/30 bg-miss-soft p-4 text-sm">{t.photo.failed}</p>
            <div className="flex justify-end">
              <button type="button" onClick={again} className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold">
                <RotateCcw className="size-4" aria-hidden /> {t.photo.tryAnother}
              </button>
            </div>
          </div>
        )}

        {phase.kind === "ready" && (
          <>
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} muted playsInline className="size-full object-cover" aria-label={t.scan.cameraPreview} />
              {camera === "on" && (
                <div aria-hidden className="pointer-events-none absolute inset-10 rounded-2xl border-2 border-white/80" />
              )}
              {camera !== "on" && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">
                  {camera === "starting" ? (
                    <LoaderCircle className="size-8 animate-spin" aria-label={t.scan.starting} />
                  ) : (
                    <span className="flex flex-col items-center gap-2">
                      <CameraOff className="size-8" aria-hidden />
                      {camera === "blocked" ? t.photo.blocked : t.photo.noCamera}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={takePhoto}
                disabled={camera !== "on"}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-40"
              >
                <Camera className="size-4" aria-hidden /> {t.photo.take}
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-semibold"
              >
                <ImageUp className="size-4" aria-hidden /> {t.photo.choose}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                aria-label={t.photo.inputAria}
                onChange={(e) => {
                  void fromFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </>
        )}

        {(phase.kind === "analysing" || phase.kind === "result") && (
          <div className="flex gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local, already-decoded photo */}
            <img src={phase.preview} alt={t.photo.yourPhoto} className="size-28 shrink-0 rounded-2xl object-cover" />
            <div className="min-w-0 flex-1 space-y-3" role="status">
              {phase.kind === "analysing" ? (
                <p className="flex items-center gap-2 pt-2 text-muted">
                  <LoaderCircle className="size-5 animate-spin" aria-hidden /> {t.photo.looking}
                </p>
              ) : (
                <ResultView t={t} lang={lang} result={phase.result} have={have} onAdd={add} />
              )}
            </div>
          </div>
        )}
        {phase.kind === "result" && (
          <div className="flex justify-end">
            <button type="button" onClick={again} className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold">
              <RotateCcw className="size-4" aria-hidden /> {t.photo.tryAnother}
            </button>
          </div>
        )}

        {phase.kind === "added" && (
          <div className="space-y-4 py-4 text-center" role="status">
            <p className="inline-flex items-center gap-2 rounded-full bg-have-soft px-4 py-2 font-semibold text-have">
              <Check className="size-4" aria-hidden /> {t.scan.added(label(phase.id, lang))}
            </p>
            <div className="flex justify-center gap-3">
              <button type="button" onClick={again} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink">
                {t.photo.takeAnother}
              </button>
              <button type="button" onClick={close} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold">
                {t.scan.done}
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">
        {t.photo.footer}
        {offered.length > 0 && <>: {offered.map((id) => seen(id, lang)).join(", ")}</>}.
      </p>
    </dialog>
  );
}

type AddProps = { t: Dict; lang: Locale; g: Guess; have: string[]; onAdd: (id: string) => void; primary?: boolean };

function AddButton({ t, lang, g, have, onAdd, primary }: AddProps) {
  if (have.includes(g.id)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-have-soft px-3 py-1.5 text-sm font-semibold text-have">
        <Check className="size-4" aria-hidden /> {t.photo.addedChip(label(g.id, lang))}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onAdd(g.id)}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${primary ? "bg-brand text-brand-ink" : "border border-line"}`}
    >
      <Plus className="size-4" aria-hidden /> {label(g.id, lang)}
      <span className={`font-normal ${primary ? "opacity-80" : "text-muted"}`}>{pct(g.p)}</span>
    </button>
  );
}

type ResultProps = { t: Dict; lang: Locale; result: Interpretation; have: string[]; onAdd: (id: string) => void };

function ResultView({ t, lang, result, have, onAdd }: ResultProps) {
  const common = { t, lang, have, onAdd };
  if (result.status === "confident") {
    return (
      <>
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-brand" aria-hidden /> {t.photo.looksLike(seen(result.best.id, lang))}
        </p>
        <div className="flex flex-wrap gap-2">
          <AddButton g={result.best} {...common} primary />
          {result.others.map((g) => (
            <AddButton key={g.id} g={g} {...common} />
          ))}
        </div>
      </>
    );
  }
  if (result.status === "unsure") {
    return (
      <>
        <p className="font-semibold">{t.photo.notSure}</p>
        <div className="flex flex-wrap gap-2">
          {result.options.map((g) => (
            <AddButton key={g.id} g={g} {...common} />
          ))}
        </div>
        <p className="text-xs text-muted">{t.photo.noneRight}</p>
      </>
    );
  }
  return <p className="text-sm">{t.photo.unknown}</p>;
}
