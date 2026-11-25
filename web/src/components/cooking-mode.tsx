"use client";

import { ChefHat, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Sun, Timer, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { CuePill, cueText } from "@/components/cue-pill";
import { useDict, useLocale } from "@/components/locale";
import type { Cue, Method, PrepLine } from "@/lib/method";

type Page =
  | { kind: "ready" }
  | { kind: "step"; n: number; text: string; cues: Cue[]; section: "prep" | "cook" | "method" }
  | { kind: "done" };

type Clock = { id: string; step: number; label: string; total: number; end: number | null; left: number; done: boolean };

/** The time now, for event handlers and timers only (never during render). */
const stamp = () => Date.now();

const UNIT_MS = { s: 1000, min: 60_000, h: 3_600_000 } as const;

/** The "Start cooking" button. Without `onClick` it is the placeholder shown until the page is live. */
export function StartCookingButton({ onClick }: { onClick?: () => void }) {
  const t = useDict().cook;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink shadow-sm hover:opacity-90"
    >
      <ChefHat className="size-5" aria-hidden />
      {t.start}
    </button>
  );
}

/**
 * Cooking mode: the recipe one step at a time, in large type, with timers for the times the steps
 * name, and the screen kept on. It lives in the address (?cook=1), so the phone's Back button
 * closes it and leaves you on the recipe.
 */
export function CookingMode({ method, title, textLang }: { method: Method; title: string; textLang: string }) {
  const open = useSearchParams().get("cook") === "1";

  const start = () => {
    const url = new URL(location.href);
    url.searchParams.set("cook", "1");
    history.pushState({ rhCook: true }, "", url);
  };
  const close = () => {
    // Opened here: step back, so Back afterwards does not reopen it. Opened from a link: just drop it.
    if ((history.state as { rhCook?: boolean } | null)?.rhCook) {
      history.back();
      return;
    }
    const url = new URL(location.href);
    url.searchParams.delete("cook");
    history.replaceState(null, "", url);
  };

  return (
    <>
      <StartCookingButton onClick={start} />
      {open && <CookView method={method} title={title} textLang={textLang} onClose={close} />}
    </>
  );
}

function pagesOf(m: Method): Page[] {
  const split = m.cook.length > 0;
  return [
    ...(m.cut.length || m.season.length ? [{ kind: "ready" } as const] : []),
    ...m.prep.map((text, i): Page => ({ kind: "step", n: i + 1, text, cues: [], section: split ? "prep" : "method" })),
    ...m.cook.map((s, i): Page => ({ kind: "step", n: m.prep.length + i + 1, text: s.text, cues: s.cues, section: "cook" })),
    { kind: "done" },
  ];
}

const clockText = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

function CookView({ method, title, textLang, onClose }: { method: Method; title: string; textLang: string; onClose: () => void }) {
  const d = useDict();
  const t = d.cook;
  const lang = useLocale();
  const pages = pagesOf(method);
  const total = method.prep.length + method.cook.length;

  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "prev" | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [clocks, setClocks] = useState<Clock[]>([]);
  const [now, setNow] = useState(0);
  const [awake, setAwake] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const clocksRef = useRef(clocks);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const go = (step: number) => {
    const next = Math.min(pages.length - 1, Math.max(0, index + step));
    if (next === index) return;
    setDir(step > 0 ? "next" : "prev");
    setIndex(next);
  };
  const goRef = useRef(go);
  const closeRef = useRef(onClose);
  useEffect(() => {
    goRef.current = go;
    closeRef.current = onClose;
    clocksRef.current = clocks;
  });

  // The page behind stops scrolling; keys move between steps; focus starts in the dialog.
  useEffect(() => {
    document.body.toggleAttribute("data-cooking", true);
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goRef.current(1);
      else if (e.key === "ArrowLeft") goRef.current(-1);
      else if (e.key === "Escape") closeRef.current();
    };
    addEventListener("keydown", onKey);
    return () => {
      document.body.removeAttribute("data-cooking");
      removeEventListener("keydown", onKey);
    };
  }, []);

  // Keep the screen on. The browser drops the lock when the tab is hidden, so it is asked for again.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const ask = async () => {
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
        if (!live) {
          void lock.release();
          return;
        }
        setAwake(true);
        lock.addEventListener("release", () => live && setAwake(false));
      } catch {
        // refused (battery saver, or an embedded page): the screen behaves as usual
      }
    };
    void ask();
    const onVisible = () => void ask();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  // Timers tick while one runs; a finished one buzzes, beeps and stays until you dismiss it.
  const running = clocks.some((c) => c.end !== null);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const at = stamp();
      setNow(at);
      if (clocksRef.current.some((c) => c.end !== null && c.end <= at)) {
        setClocks((cs) => cs.map((c) => (c.end !== null && c.end <= at ? { ...c, end: null, left: 0, done: true } : c)));
        alarm(audio.current);
      }
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const startClock = (step: number, ci: number, cue: Cue & { kind: "time" }) => {
    // The sound needs a tap to be allowed, so it is set up here rather than when the time is up.
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {}
    const at = stamp();
    const total = cue.from * UNIT_MS[cue.unit];
    setNow(at);
    setClocks((cs) =>
      cs.some((c) => c.id === `${step}-${ci}`)
        ? cs
        : [...cs, { id: `${step}-${ci}`, step, label: cueText(cue, lang), total, end: at + total, left: total, done: false }],
    );
  };
  const toggleClock = (id: string) => {
    const at = stamp();
    setNow(at);
    setClocks((cs) =>
      cs.map((c) => (c.id !== id || c.done ? c : c.end !== null ? { ...c, end: null, left: Math.max(0, c.end - at) } : { ...c, end: at + c.left })),
    );
  };
  const removeClock = (id: string) => setClocks((cs) => cs.filter((c) => c.id !== id));
  const leftOf = (c: Clock) => (c.end !== null ? Math.max(0, c.end - now) : c.left);

  const onPointerDown = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  const page = pages[index];
  const last = index === pages.length - 1;
  const toggleTick = (k: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={`${t.start}: ${title}`}
      tabIndex={-1}
      className="cook-open fixed inset-0 z-50 flex flex-col bg-bg text-ink outline-none"
    >
      <div className="px-4 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold" lang={textLang}>
            {title}
          </p>
          {awake && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Sun className="size-3.5" aria-hidden />
              {t.awake}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface hover:border-brand"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="mx-auto mt-3 h-1.5 max-w-2xl overflow-hidden rounded-full bg-line">
          <div
            className="h-full origin-left rounded-full bg-brand transition-transform duration-300 ease-out"
            style={{ transform: `scaleX(${(index + 1) / pages.length})` }}
          />
        </div>
        {clocks.length > 0 && (
          <ul className="mx-auto mt-3 flex max-w-2xl flex-wrap gap-2" aria-live="polite">
            {clocks.map((c) => (
              <li
                key={c.id}
                className={`pop inline-flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm font-semibold tabular-nums ${
                  c.done ? "ring border-brand bg-brand text-brand-ink" : "border-line bg-surface"
                }`}
              >
                <Timer className="size-4" aria-hidden />
                <span className="ml-1 font-normal opacity-80">{t.timerFor(c.step)} ·</span>
                <span>{c.done ? t.timeUp : clockText(leftOf(c))}</span>
                {!c.done && (
                  <button
                    type="button"
                    onClick={() => toggleClock(c.id)}
                    aria-label={c.end !== null ? t.pause : t.resume}
                    className="ml-1 grid size-7 place-items-center rounded-full hover:bg-surface-2"
                  >
                    {c.end !== null ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeClock(c.id)}
                  aria-label={t.remove}
                  className="grid size-7 place-items-center rounded-full hover:bg-surface-2/40"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto px-5 py-6 sm:px-6"
        style={{ touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        <div key={index} className={`mx-auto max-w-2xl ${dir === "next" ? "step-next" : dir === "prev" ? "step-prev" : ""}`}>
          {page.kind === "ready" && (
            <>
              <h2 className="font-display text-3xl font-bold">{t.getReady}</h2>
              <p className="mt-2 text-muted">{t.getReadyHint}</p>
              <div className="mt-6 space-y-6" lang={textLang}>
                {method.cut.length > 0 && <TickList heading={d.recipe.cutHeading} lines={method.cut} prefix="c" ticked={ticked} toggle={toggleTick} />}
                {method.season.length > 0 && (
                  <TickList heading={d.recipe.seasonHeading} lines={method.season} prefix="s" ticked={ticked} toggle={toggleTick} />
                )}
              </div>
            </>
          )}

          {page.kind === "step" && (
            <>
              <p className="text-sm font-semibold tracking-wide text-brand uppercase">
                {page.section === "prep" ? d.recipe.preparation : page.section === "cook" ? d.recipe.cooking : d.recipe.method} ·{" "}
                {t.step(page.n, total)}
              </p>
              <p className="mt-4 text-[1.4rem] leading-relaxed sm:text-3xl sm:leading-relaxed" lang={textLang}>
                {page.text}
              </p>
              {page.cues.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  {page.cues.map((c, ci) => {
                    if (c.kind !== "time") return <CuePill key={ci} cue={c} lang={lang} large />;
                    const clock = clocks.find((k) => k.id === `${page.n}-${ci}`);
                    return clock ? (
                      <span
                        key={ci}
                        className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand-soft px-4 py-2 text-sm font-semibold tabular-nums"
                      >
                        <Timer className="size-4" aria-hidden />
                        {clock.done ? t.timeUp : clockText(leftOf(clock))}
                      </span>
                    ) : (
                      <button
                        key={ci}
                        type="button"
                        onClick={() => startClock(page.n, ci, c)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:opacity-90"
                      >
                        <Timer className="size-4" aria-hidden />
                        {t.startTimer(cueText(c, lang))}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {page.kind === "done" && (
            <div className="flex flex-col items-center pt-10 text-center">
              <span className="grid size-20 place-items-center rounded-full bg-brand-soft text-brand">
                <ChefHat className="size-10" aria-hidden />
              </span>
              <h2 className="mt-6 font-display text-3xl font-bold">{t.enjoy}</h2>
              <p className="mt-2 text-muted">{t.doneHint}</p>
              <button
                type="button"
                onClick={() => {
                  setDir("prev");
                  setIndex(0);
                }}
                className="mt-8 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold hover:border-brand"
              >
                <RotateCcw className="size-4" aria-hidden />
                {t.again}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-surface/80 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-6">
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface py-3.5 text-base font-semibold hover:border-brand disabled:opacity-40"
          >
            <ChevronLeft className="size-5" aria-hidden />
            {t.back}
          </button>
          <button
            type="button"
            onClick={() => (last ? onClose() : go(1))}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand py-3.5 text-base font-semibold text-brand-ink hover:opacity-90"
          >
            {last ? t.finish : t.next}
            {!last && <ChevronRight className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}

function TickList({
  heading,
  lines,
  prefix,
  ticked,
  toggle,
}: {
  heading: string;
  lines: PrepLine[];
  prefix: string;
  ticked: Set<string>;
  toggle: (k: string) => void;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">{heading}</h3>
      <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
        {lines.map((l, i) => {
          const k = `${prefix}${i}`;
          const on = ticked.has(k);
          return (
            <li key={k}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3.5 text-lg">
                <input type="checkbox" checked={on} onChange={() => toggle(k)} className="size-5 shrink-0 accent-[var(--have)]" />
                <span className={`flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 transition-opacity ${on ? "opacity-50" : ""}`}>
                  {l.amount && <span className="font-semibold">{l.amount}</span>}
                  <span className={on ? "line-through" : ""}>{l.name}</span>
                  {l.cut && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-sm font-medium">{l.cut}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Three short beeps and a buzz. Quietly does nothing where sound or vibration is unavailable. */
function alarm(ctx: AudioContext | null) {
  navigator.vibrate?.([400, 150, 400, 150, 800]);
  if (!ctx) return;
  try {
    for (let i = 0; i < 3; i++) {
      const at = ctx.currentTime + i * 0.45;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.32);
    }
  } catch {}
}
