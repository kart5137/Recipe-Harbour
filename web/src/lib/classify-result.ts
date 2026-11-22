/**
 * Turn the model's probabilities into what the photo dialog shows.
 *
 * Only ingredients the model card marks as offered (reliable on real photos) are suggested.
 * - confident: the top guess is offered and its probability is at least CONFIDENT
 * - unknown: the model is confident about something it cannot reliably recognise (e.g. an
 *   apple at 83 %), or no offered ingredient is plausible: no suggestion, type it instead
 * - unsure: otherwise, the offered ingredients in the top 3 with at least PLAUSIBLE probability
 */
export type ModelLabel = { id: string; offered: boolean; test_photos: number; top1: number | null; top3: number | null };
export type Labels = { version: string; classes: ModelLabel[] };

export type Guess = { id: string; p: number; offered: boolean };
export type Interpretation =
  | { status: "confident"; best: Guess; others: Guess[] }
  | { status: "unsure"; options: Guess[] }
  | { status: "unknown"; topGuess: Guess };

export const CONFIDENT = 0.6;
export const PLAUSIBLE = 0.15;

export function interpret(probs: ArrayLike<number>, labels: Labels): Interpretation {
  const guesses: Guess[] = labels.classes
    .map((c, i) => ({ id: c.id, p: probs[i] ?? 0, offered: c.offered }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);
  const plausible = guesses.filter((g) => g.offered && g.p >= PLAUSIBLE);
  const best = guesses[0];
  if (best.offered && best.p >= CONFIDENT) {
    return { status: "confident", best, others: plausible.filter((g) => g.id !== best.id) };
  }
  if (!best.offered && best.p >= CONFIDENT) return { status: "unknown", topGuess: best };
  if (plausible.length) return { status: "unsure", options: plausible };
  return { status: "unknown", topGuess: best };
}

export function offeredIds(labels: Labels): string[] {
  return labels.classes.filter((c) => c.offered).map((c) => c.id);
}
