/** "20 min", "1 h 30 min", "2 h", "20–30 min", "1–2 h", "45 min–1.5 h". */
export function formatMinutes(min: [number, number] | null): string | null {
  if (!min) return null;
  const [lo, hi] = min;
  const hours = (m: number) => (m % 60 === 0 ? String(m / 60) : (m / 60).toFixed(1).replace(/\.0$/, ""));
  const single = (m: number) =>
    m < 90 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`;
  if (lo === hi) return single(lo);
  if (hi < 90) return `${lo}–${hi} min`;
  if (lo >= 60) return `${hours(lo)}–${hours(hi)} h`;
  return `${lo} min–${hours(hi)} h`;
}
