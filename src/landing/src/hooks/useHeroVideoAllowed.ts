import { useEffect, useState } from "react";

/**
 * The Network Information API is Chromium-only and missing from lib.dom.d.ts. Only the fields
 * read here; every one of them may be absent.
 */
interface NetworkInformation extends EventTarget {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const SLOW = new Set<NetworkInformation["effectiveType"]>(["slow-2g", "2g", "3g"]);

const connection = (): NetworkInformation | undefined =>
  typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { connection?: NetworkInformation }).connection;

function allowed(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia(REDUCED_MOTION).matches) return false;
  const conn = connection();
  return !(conn?.saveData || SLOW.has(conn?.effectiveType));
}

/**
 * False when the viewer asked for less motion, turned on Data Saver, or is on a 2g/3g connection:
 * the hero then shows its poster instead of the video. Re-evaluated when any of those change.
 */
export function useHeroVideoAllowed(): boolean {
  const [ok, setOk] = useState<boolean>(allowed);

  useEffect(() => {
    const update = () => setOk(allowed());
    const motion = window.matchMedia(REDUCED_MOTION);
    const conn = connection();
    motion.addEventListener("change", update);
    conn?.addEventListener("change", update);
    return () => {
      motion.removeEventListener("change", update);
      conn?.removeEventListener("change", update);
    };
  }, []);

  return ok;
}
