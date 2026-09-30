import { useEffect, useState } from "react";

/** Ignore scroll jitter smaller than this (trackpads, iOS bounce). */
const TOLERANCE = 6;

/**
 * True while the page is scrolling down past `offset` px; false while scrolling up or near the
 * top — the "headroom" pattern, same idea as MUI's Slide + useScrollTrigger recipe.
 */
export function useHideOnScroll(offset: number): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      if (y <= offset) {
        setHidden(false);
      } else if (Math.abs(y - lastY) >= TOLERANCE) {
        setHidden(y > lastY);
      } else {
        return; // keep lastY, so slow scrolling still adds up past the tolerance
      }
      lastY = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [offset]);

  return hidden;
}
