import { type NextRequest, NextResponse } from "next/server";

import { LOCALES } from "@/lib/i18n";
import { LOCALE_COOKIE, negotiate } from "@/lib/negotiate";

/** Every page lives under /en or /de; a path without one is redirected to the visitor's language. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return;
  const lang = negotiate(request.headers.get("accept-language"), request.cookies.get(LOCALE_COOKIE)?.value);
  const url = request.nextUrl.clone();
  url.pathname = `/${lang}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Not for Next.js internals, the product API, the model files or anything with a file extension.
  matcher: ["/((?!_next|api/|model/|.*\\..*).*)"],
};
