"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/** Event the example chips send to the search panel (pantry-search.tsx), with the ingredient ids. */
export const PICK_EVENT = "rh:pick";

/**
 * While its link's page is on the way, dims the results (`body[data-searching]`, globals.css), so a
 * tap shows at once even when the server takes a moment.
 */
export function PendingDim() {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    document.body.toggleAttribute("data-searching", true);
    return () => document.body.removeAttribute("data-searching");
  }, [pending]);
  return null;
}

/**
 * An example search. A plain click hands the ingredients to the search panel, which shows them
 * straight away and fetches the results; the link itself still works for a new tab.
 */
export function ExampleChip({ href, have, className, children }: { href: string; have: string[]; className: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        dispatchEvent(new CustomEvent(PICK_EVENT, { detail: have }));
      }}
    >
      {children}
    </Link>
  );
}

/** "Show more": fetched as soon as it scrolls into view, so the tap opens the next cards at once. */
export function MoreLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return (
    <Link href={href} scroll={false} prefetch className={className}>
      {children}
      <PendingDim />
    </Link>
  );
}

/**
 * A recipe card's link. The whole recipe is fetched as soon as a pointer rests on the card or a
 * finger touches it, which is usually done before the tap ends.
 */
export function CardLink({ href, lang, className, children }: { href: string; lang: string; className: string; children: ReactNode }) {
  const router = useRouter();
  const warm = () => router.prefetch(href);
  return (
    <Link href={href} lang={lang} className={className} onPointerEnter={warm} onPointerDown={warm} onFocus={warm}>
      {children}
    </Link>
  );
}
