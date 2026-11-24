"use client";

import { useEffect, useRef } from "react";

import { BACKGROUND, FLOATERS } from "@/lib/backdrops";

/**
 * One food photo behind every page, with cut-out food floating over it. As you scroll, each item
 * drifts at its own speed and turns a little (the salt shaker falls), and wraps round so some are
 * always on screen. A frosted wash of the page colour keeps text readable; on the home page it
 * starts thin and the items float above it (see `.scrim` and `.floaters` in globals.css).
 */
const MARGIN = 200; // px an item travels off screen before it wraps round

export function Backdrop() {
  const photo = useRef<HTMLImageElement>(null);
  const items = useRef<(HTMLImageElement | null)[]>([]);

  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = still ? 0 : scrollY;
      const h = innerHeight;
      const span = h + 2 * MARGIN;
      FLOATERS.forEach((f, i) => {
        const el = items.current[i];
        if (!el) return;
        const top = ((((f.y / 100) * h - f.speed * y + MARGIN) % span) + span) % span - MARGIN;
        el.style.transform = `translate3d(-50%, ${top.toFixed(1)}px, 0) rotate(${(f.tilt + (f.spin * y) / 100).toFixed(1)}deg)`;
      });
      if (photo.current && !still) photo.current.style.transform = `scale(${(1.04 + Math.min(scrollY, 2000) / 25000).toFixed(4)})`;
      root.style.setProperty("--hero-scroll", Math.min(1, scrollY / 420).toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div aria-hidden className="backdrop">
      {/* Pre-sized WebP files in /public; next/image would only resize them again. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={photo}
        className="backdrop-photo"
        src={`/backdrops/${BACKGROUND.name}-1920.webp`}
        srcSet={`/backdrops/${BACKGROUND.name}-960.webp 960w, /backdrops/${BACKGROUND.name}-1920.webp 1920w`}
        sizes="100vw"
        alt=""
        fetchPriority="high"
        decoding="async"
      />
      <div className="scrim" />
      <div className="floaters">
        {FLOATERS.map((f, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={f.name}
            ref={(el) => {
              items.current[i] = el;
            }}
            src={`/floaters/${f.name}.webp`}
            alt=""
            decoding="async"
            className={f.phone ? "floater" : "floater max-sm:hidden"}
            style={{
              left: `${f.x}%`,
              width: `clamp(${Math.round(f.size * 0.6)}px, ${((f.size / 1280) * 100).toFixed(2)}vw, ${f.size}px)`,
              transform: `translate3d(-50%, ${f.y}vh, 0) rotate(${f.tilt}deg)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
