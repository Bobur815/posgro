import { useEffect, useState } from "react";

const isPast = (threshold: number) =>
  typeof window !== "undefined" && window.scrollY >= threshold;

/** True once the page is scrolled `threshold` px or more — same idea as MUI's useScrollTrigger. */
export function useScrollTrigger(threshold = 10): boolean {
  const [triggered, setTriggered] = useState<boolean>(() => isPast(threshold));

  useEffect(() => {
    const onScroll = () => setTriggered(isPast(threshold));
    onScroll(); // a reload can restore a scrolled position before this effect runs
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return triggered;
}
