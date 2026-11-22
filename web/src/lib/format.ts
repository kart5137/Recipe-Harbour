import type { Locale } from "./i18n.ts";

/** "20 min", "1 h 30 min", "2 h", "20–30 min", "1–2 h", "45 min–1.5 h" (German: Min. / Std., decimal comma). */
export function formatMinutes(min: [number, number] | null, lang: Locale = "en"): string | null {
  if (!min) return null;
  const [lo, hi] = min;
  const M = lang === "de" ? "Min." : "min";
  const H = lang === "de" ? "Std." : "h";
  const hours = (m: number) => {
    const v = m % 60 === 0 ? String(m / 60) : (m / 60).toFixed(1).replace(/\.0$/, "");
    return lang === "de" ? v.replace(".", ",") : v;
  };
  const single = (m: number) =>
    m < 90 ? `${m} ${M}` : m % 60 === 0 ? `${m / 60} ${H}` : `${Math.floor(m / 60)} ${H} ${m % 60} ${M}`;
  if (lo === hi) return single(lo);
  if (hi < 90) return `${lo}–${hi} ${M}`;
  if (lo >= 60) return `${hours(lo)}–${hours(hi)} ${H}`;
  return `${lo} ${M}–${hours(hi)} ${H}`;
}
