"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { parseState, toQuery } from "@/lib/params";

/** Back to the search this recipe was opened from (the search is carried in the URL). */
export function BackLink() {
  const sp = useSearchParams();
  const state = parseState(Object.fromEntries(sp.entries()));
  const fromSearch = state.have.length > 0 || state.q !== "";
  return (
    <Link
      href={`/${toQuery(state)}`}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-brand"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {fromSearch ? "Back to results" : "Search recipes"}
    </Link>
  );
}
