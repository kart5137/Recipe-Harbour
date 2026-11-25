import { Flame, Thermometer, Timer } from "lucide-react";

import { dict, type Locale } from "@/lib/i18n";
import type { Cue } from "@/lib/method";

const fraction = (n: number, lang: Locale) =>
  ({ 0.25: "¼", 0.5: "½", 0.75: "¾" })[n] ?? (lang === "de" ? String(n).replace(".", ",") : String(n));

/** "15–20 min", "Medium heat", "180 °C": a step's time or heat as the reader's language says it. */
export function cueText(cue: Cue, lang: Locale): string {
  const t = dict(lang).recipe;
  if (cue.kind === "time") return `${fraction(cue.from, lang)}${cue.to !== null ? `–${fraction(cue.to, lang)}` : ""} ${t.units[cue.unit]}`;
  if (cue.kind === "overnight") return t.overnight;
  if (cue.kind === "heat") return t.heat[cue.level];
  return `${cue.value} °${cue.scale}`;
}

/** A step's time or heat, as a small tag under the step (recipe page and cooking mode). */
export function CuePill({ cue, lang, large = false }: { cue: Cue; lang: Locale; large?: boolean }) {
  const size = large ? "size-4" : "size-3.5";
  const icon =
    cue.kind === "heat" ? <Flame className={size} aria-hidden /> : cue.kind === "temp" ? <Thermometer className={size} aria-hidden /> : <Timer className={size} aria-hidden />;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 font-medium text-ink ${large ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"}`}
    >
      {icon}
      {cueText(cue, lang)}
    </span>
  );
}
