"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { BACKGROUND } from "@/lib/backdrops";

/**
 * The food photo behind every page. It stays put while the page scrolls; a frosted wash (a
 * pre-blurred copy of the photo under the page colour) keeps text readable. On the home page the
 * wash starts thin, so the photo shows at the top, and thickens a little as you scroll. Only the
 * wash's opacity changes, so scrolling never repaints the photo (see `.backdrop` in globals.css).
 */
export function Backdrop() {
  const scrim = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const el = scrim.current;
    if (!el) return;
    // Next keeps pages you left in the document, hidden, for a quick Back; only a shown one counts.
    const hero = [...document.querySelectorAll("[data-photo-hero]")].some((e) => e.getClientRects().length > 0);
    if (!hero) {
      delete el.dataset.hero;
      el.style.opacity = "1";
      return;
    }
    el.dataset.hero = "";
    el.style.removeProperty("opacity");
    // Where the browser can tie an animation to scrolling, it runs on the graphics chip (globals.css).
    if (CSS.supports("animation-timeline: scroll()")) return;
    const page = document.body; // the page scrolls inside <body>, see globals.css
    let frame = 0;
    const update = () => {
      frame = 0;
      el.style.opacity = (0.12 + 0.38 * Math.min(1, page.scrollTop / 420)).toFixed(3);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    page.addEventListener("scroll", schedule, { passive: true });
    return () => {
      page.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

  const src = `/backdrops/${BACKGROUND.name}`;
  /* Pre-sized WebP files in /public/backdrops; next/image would only resize them again. */
  /* eslint-disable @next/next/no-img-element */
  return (
    <div aria-hidden className="backdrop">
      <img
        className="backdrop-photo"
        src={`${src}-1920.webp`}
        srcSet={`${src}-960.webp 960w, ${src}-1920.webp 1920w`}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        decoding="async"
      />
      <div ref={scrim} className="scrim">
        <img src={`${src}-blur.webp`} alt="" decoding="async" />
      </div>
    </div>
  );
}
