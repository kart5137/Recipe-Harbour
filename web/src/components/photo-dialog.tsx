"use client";

import { Camera, CameraOff, Check, ImageUp, LoaderCircle, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { type Classifier, loadClassifier } from "@/lib/classifier";
import { type Guess, type Interpretation, interpret, offeredIds } from "@/lib/classify-result";
import { label } from "@/lib/labels";

type Phase =
  | { kind: "loading"; progress: number }
  | { kind: "failed" }
  | { kind: "ready" }
  | { kind: "analysing"; preview: string }
  | { kind: "result"; preview: string; result: Interpretation }
  | { kind: "added"; id: string };

type Props = { open: boolean; onClose: () => void; onAdd: (id: string) => void; have: string[] };

const pct = (p: number) => `${Math.round(p * 100)} %`;
/** What the model recognises, without the search label's broader wording ("Radish & root veg" -> "radish"). */
const seen = (id: string) => label(id).split(" & ")[0].toLowerCase();

/** Recognise a fruit or vegetable in a photo, on the device, and confirm it as an ingredient. */
export function PhotoDialog({ open, onClose, onAdd, have }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clfRef = useRef<Classifier | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading", progress: 0 });
  const [camera, setCamera] = useState<"off" | "starting" | "on" | string>("off");
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

  // Load TensorFlow.js and the model the first time the dialog opens.
  useEffect(() => {
    if (!open || clfRef.current) return;
    let cancelled = false;
    loadClassifier((f) => !cancelled && setPhase({ kind: "loading", progress: f }))
      .then((c) => {
        if (cancelled) return;
        clfRef.current = c;
        setOffered(offeredIds(c.labels));
        toReady();
      })
      .catch(() => !cancelled && setPhase({ kind: "failed" }));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Live camera while ready ("starting" is set by toReady before this runs).
  useEffect(() => {
    if (!open || phase.kind !== "ready" || camera !== "starting" || !videoRef.current) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } })
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
    const clf = clfRef.current;
    if (!clf) return;
    setPhase({ kind: "analysing", preview });
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
    if (clfRef.current) toReady();
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
          Photo of fruit or vegetables
        </h2>
        <button type="button" onClick={close} className="grid size-9 place-items-center rounded-full hover:bg-surface-2" aria-label="Close">
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="space-y-4 p-5">
        {phase.kind === "loading" && (
          <div className="space-y-3 py-6 text-center" role="status">
            <p className="text-sm text-muted">Loading the recognition model (about 5 MB, once)…</p>
            <div className="mx-auto h-2 w-56 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.round(phase.progress * 100)}%` }} />
            </div>
          </div>
        )}

        {phase.kind === "failed" && (
          <p className="rounded-2xl border border-miss/30 bg-miss-soft p-4 text-sm">
            The recognition model could not be loaded. Check your connection and open this again, or type the
            ingredient in the search box.
          </p>
        )}

        {phase.kind === "ready" && (
          <>
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} muted playsInline className="size-full object-cover" aria-label="Camera preview" />
              {camera === "on" && (
                <div aria-hidden className="pointer-events-none absolute inset-10 rounded-2xl border-2 border-white/80" />
              )}
              {camera !== "on" && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">
                  {camera === "starting" ? (
                    <LoaderCircle className="size-8 animate-spin" aria-label="Starting camera" />
                  ) : (
                    <span className="flex flex-col items-center gap-2">
                      <CameraOff className="size-8" aria-hidden />
                      {camera === "blocked"
                        ? "Camera access is blocked. Choose a photo instead, or allow the camera in your browser settings."
                        : "No camera available. Choose a photo instead."}
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
                <Camera className="size-4" aria-hidden /> Take photo
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-sm font-semibold"
              >
                <ImageUp className="size-4" aria-hidden /> Choose a photo
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                aria-label="Photo of fruit or vegetables"
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
            <img src={phase.preview} alt="Your photo" className="size-28 shrink-0 rounded-2xl object-cover" />
            <div className="min-w-0 flex-1 space-y-3" role="status">
              {phase.kind === "analysing" ? (
                <p className="flex items-center gap-2 pt-2 text-muted">
                  <LoaderCircle className="size-5 animate-spin" aria-hidden /> Looking…
                </p>
              ) : (
                <ResultView result={phase.result} have={have} onAdd={add} />
              )}
            </div>
          </div>
        )}
        {phase.kind === "result" && (
          <div className="flex justify-end">
            <button type="button" onClick={again} className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm font-semibold">
              <RotateCcw className="size-4" aria-hidden /> Try another photo
            </button>
          </div>
        )}

        {phase.kind === "added" && (
          <div className="space-y-4 py-4 text-center" role="status">
            <p className="inline-flex items-center gap-2 rounded-full bg-have-soft px-4 py-2 font-semibold text-have">
              <Check className="size-4" aria-hidden /> Added {label(phase.id)}
            </p>
            <div className="flex justify-center gap-3">
              <button type="button" onClick={again} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink">
                Take another
              </button>
              <button type="button" onClick={close} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold">
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">
        Photos stay on your device. Works best with one item, close up
        {offered.length > 0 && <>: {offered.map(seen).join(", ")}</>}.
      </p>
    </dialog>
  );
}

function AddButton({ g, have, onAdd, primary }: { g: Guess; have: string[]; onAdd: (id: string) => void; primary?: boolean }) {
  if (have.includes(g.id)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-have-soft px-3 py-1.5 text-sm font-semibold text-have">
        <Check className="size-4" aria-hidden /> {label(g.id)} added
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onAdd(g.id)}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${primary ? "bg-brand text-brand-ink" : "border border-line"}`}
    >
      <Plus className="size-4" aria-hidden /> {label(g.id)}
      <span className={`font-normal ${primary ? "opacity-80" : "text-muted"}`}>{pct(g.p)}</span>
    </button>
  );
}

function ResultView({ result, have, onAdd }: { result: Interpretation; have: string[]; onAdd: (id: string) => void }) {
  if (result.status === "confident") {
    return (
      <>
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-brand" aria-hidden /> Looks like {seen(result.best.id)}
        </p>
        <div className="flex flex-wrap gap-2">
          <AddButton g={result.best} have={have} onAdd={onAdd} primary />
          {result.others.map((g) => (
            <AddButton key={g.id} g={g} have={have} onAdd={onAdd} />
          ))}
        </div>
      </>
    );
  }
  if (result.status === "unsure") {
    return (
      <>
        <p className="font-semibold">Not sure. Could it be one of these?</p>
        <div className="flex flex-wrap gap-2">
          {result.options.map((g) => (
            <AddButton key={g.id} g={g} have={have} onAdd={onAdd} />
          ))}
        </div>
        <p className="text-xs text-muted">If none is right, type the ingredient in the search box.</p>
      </>
    );
  }
  return (
    <p className="text-sm">
      The camera can&apos;t recognise this yet. Type the ingredient in the search box, or try a closer photo of one item.
    </p>
  );
}
