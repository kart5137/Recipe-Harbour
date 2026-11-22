import { Anchor } from "lucide-react";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line/70 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-brand">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-brand-ink shadow-sm">
            <Anchor className="size-5" aria-hidden />
          </span>
          <span className="font-display text-xl font-bold tracking-tight">Recipe Harbour</span>
        </Link>
      </div>
    </header>
  );
}
