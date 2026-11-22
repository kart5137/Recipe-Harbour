/** Search state <-> URL (?have=onion,garlic&q=soup&lang=de&staples=0&n=48), shared by server and client. */
export type SearchState = {
  have: string[];
  q: string;
  lang: "all" | "en" | "de";
  staples: boolean;
  n: number;
};

export const PAGE = 24;
const MAX_N = 480;

type Raw = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseState(sp: Raw): SearchState {
  const have = [...new Set(first(sp.have).split(",").map((s) => s.trim()).filter((s) => /^[a-z_]{1,40}$/.test(s)))];
  const lang = first(sp.lang);
  const n = Number.parseInt(first(sp.n), 10);
  return {
    have: have.slice(0, 20),
    q: first(sp.q).slice(0, 80),
    lang: lang === "en" || lang === "de" ? lang : "all",
    staples: first(sp.staples) !== "0",
    n: Number.isFinite(n) && n > 0 ? Math.min(n, MAX_N) : PAGE,
  };
}

export function toQuery(s: Partial<SearchState>): string {
  const p = new URLSearchParams();
  if (s.have?.length) p.set("have", s.have.join(","));
  if (s.q?.trim()) p.set("q", s.q.trim());
  if (s.lang && s.lang !== "all") p.set("lang", s.lang);
  if (s.staples === false) p.set("staples", "0");
  if (s.n && s.n !== PAGE) p.set("n", String(s.n));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}
