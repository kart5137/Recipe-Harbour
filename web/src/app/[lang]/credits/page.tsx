import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { dict } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = dict(await getLocale());
  return { title: `${t.credits.title} · Recipe Harbour` };
}

/** Who made the recipes, photo, data and models this app is built on. */
export default async function CreditsPage() {
  const t = dict(await getLocale()).credits;
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-6 sm:px-6">
      <div className="rise glass rounded-3xl p-5 sm:p-7">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">{t.title}</h1>
        <p className="mt-3 text-muted">{t.intro}</p>
      </div>
      <ul className="mt-4 space-y-4">
        {t.items.map((item, i) => (
          <li key={item.heading} className="rise glass rounded-3xl p-5 sm:p-6" style={{ "--i": i + 1 } as CSSProperties}>
            <h2 className="font-display text-xl font-semibold">{item.heading}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>
            <p className="mt-3 flex flex-wrap gap-2">
              {item.links.map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  className="press inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-sm font-medium transition hover:border-brand hover:text-brand"
                >
                  {label}
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ))}
            </p>
          </li>
        ))}
      </ul>
      <div
        className="rise mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted"
        style={{ "--i": t.items.length + 1 } as CSSProperties}
      >
        <a href="https://github.com/kart5137/Recipe-Harbour#credits" className="underline decoration-line underline-offset-4 hover:text-ink">
          {t.full}
        </a>
        <p className="font-medium text-ink">{t.madeBy}</p>
      </div>
    </main>
  );
}
