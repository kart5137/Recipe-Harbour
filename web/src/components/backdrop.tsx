"use client";

import { useEffect } from "react";

import { BACKGROUND } from "@/lib/backdrops";

/**
 * The food photo behind every page. It stays put while the page scrolls; a frosted wash of the
 * page colour keeps text readable. On the home page the wash starts thin, so the photo shows at
 * the top, and thickens a little as you scroll (`--hero-scroll`, see `.scrim` in globals.css).
 */
export function Backdrop() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      root.style.setProperty("--hero-scroll", Math.min(1, scrollY / 420).toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", schedule, { passive: true });
    return () => {
      removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div aria-hidden className="backdrop">
      {/* Pre-sized WebP files in /public/backdrops; next/image would only resize them again. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="backdrop-photo"
        src={`/backdrops/${BACKGROUND.name}-1920.webp`}
        srcSet={`/backdrops/${BACKGROUND.name}-960.webp 960w, /backdrops/${BACKGROUND.name}-1920.webp 1920w`}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        decoding="async"
      />
      <div className="scrim" />
    </div>
  );
}
