"use client";

import { useEffect } from "react";

const KEY = "scroll:";

/**
 * The page scrolls inside <body> (see globals.css), so the browser no longer restores the scroll
 * position on Back and Forward. This does it instead: it remembers how far each address was
 * scrolled and, after a Back or Forward, scrolls there again once the page is long enough.
 */
export function ScrollMemory() {
  useEffect(() => {
    const page = document.body;
    const here = () => KEY + location.pathname + location.search;
    let restoring = 0; // frame id while a restore is running
    let frame = 0;

    const save = () => {
      frame = 0;
      if (restoring) return;
      try {
        sessionStorage.setItem(here(), String(Math.round(page.scrollTop)));
      } catch {
        // storage blocked (private mode): Back simply starts at the top
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(save);
    };

    const onPop = () => {
      cancelAnimationFrame(restoring);
      let target = 0;
      try {
        target = Number(sessionStorage.getItem(here())) || 0;
      } catch {}
      const until = performance.now() + 2000; // the page may still be rendering
      const step = () => {
        const room = page.scrollHeight - page.clientHeight;
        if (room >= target || performance.now() > until) {
          page.scrollTop = target;
          restoring = 0;
          return;
        }
        restoring = requestAnimationFrame(step);
      };
      restoring = requestAnimationFrame(step);
    };

    page.addEventListener("scroll", onScroll, { passive: true });
    addEventListener("popstate", onPop);
    return () => {
      page.removeEventListener("scroll", onScroll);
      removeEventListener("popstate", onPop);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(restoring);
    };
  }, []);

  return null;
}
