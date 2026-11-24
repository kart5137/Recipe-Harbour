"use client";

import { useEffect, useRef, useState } from "react";

import { PHOTO_CREDITS } from "@/lib/backdrops";

/**
 * Food photos behind every page (Wikimedia Commons, credited in the footer). They crossfade
 * into one another as you scroll down the page. A frosted wash of the page colour keeps text
 * readable; on the home page it starts thin, so the first photo shows at the top, and thickens
 * as you scroll (see `.scrim` in globals.css).
 */
const PHOTOS = PHOTO_CREDITS.map((p) => p.name);

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function Backdrop() {
  const photos = useRef<(HTMLImageElement | null)[]>([]);
  // The first photo loads with the page; the others once it has settled.
  const [all, setAll] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setAll(true), 1200);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = root.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      const n = PHOTOS.length - 1;
      photos.current.forEach((img, i) => {
        if (!img || i === 0) return;
        // Each photo holds for a while, then the next one fades in over half a stretch.
        const o = smooth((p * n - (i - 1) - 0.25) / 0.5);
        img.style.opacity = String(o);
        if (!still) img.style.transform = `scale(${(1.06 - 0.06 * o).toFixed(4)})`;
      });
      root.style.setProperty("--hero-scroll", smooth(scrollY / 420).toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    const grow = new ResizeObserver(schedule); // results loading in change the page height
    grow.observe(document.body);
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      grow.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [all]);

  return (
    <div aria-hidden className="backdrop">
      {PHOTOS.map((name, i) =>
        i === 0 || all ? (
          // Pre-sized WebP files in /public/backdrops; next/image would only resize them again.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={name}
            ref={(el) => {
              photos.current[i] = el;
            }}
            src={`/backdrops/${name}-1920.webp`}
            srcSet={`/backdrops/${name}-960.webp 960w, /backdrops/${name}-1920.webp 1920w`}
            sizes="100vw"
            alt=""
            fetchPriority={i === 0 ? "high" : "low"}
            decoding="async"
            style={i === 0 ? undefined : { opacity: 0 }}
          />
        ) : null,
      )}
      <div className="scrim" />
    </div>
  );
}
