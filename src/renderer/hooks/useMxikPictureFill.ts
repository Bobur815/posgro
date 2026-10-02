import { useEffect } from "react";
import { images } from "../api/ipc-client";
import { usePictureStore } from "../store/picture-store";
import { encodeTallest } from "../utils/pictures";

/** Codes asked about this session — offline, a failed code is not retried until the next start. */
const tried = new Set<string>();

/** Enough for what is on screen; the rest of a long list fills in when it is shown. */
const MAX_CODES_PER_LIST = 60;

/**
 * Same rule as wantsMxikPicture (main/images/image-bytes.ts): a full code, not a generic `…000000`
 * one. The main process checks again — this only saves the IPC round-trip.
 */
const wantsPicture = (mxik: string | null | undefined): mxik is string =>
  typeof mxik === "string" && /^\d{17}$/.test(mxik) && !mxik.endsWith("000000");

/**
 * Ask tasnif, one code at a time, for the pictures this till does not have yet for the products in
 * view — then shrink each on a canvas and store it. Does nothing while pictures are switched off or
 * the till is offline; never blocks anything (a failure just leaves the tile without a picture).
 */
export function useMxikPictureFill(
  mxiks: Array<string | null | undefined>,
  enabled: boolean,
): void {
  const mxikSaved = usePictureStore((s) => s.mxikSaved);
  const key = enabled
    ? [...new Set(mxiks.filter(wantsPicture))].slice(0, MAX_CODES_PER_LIST).join(",")
    : "";

  useEffect(() => {
    if (!key || !navigator.onLine) return;
    let cancelled = false;
    void (async () => {
      for (const mxik of key.split(",")) {
        if (cancelled) return;
        if (tried.has(mxik)) continue;
        tried.add(mxik);
        try {
          const result = await images.fetchMxik(mxik);
          if (result?.status !== "found") continue;
          const picked = await encodeTallest(result.candidates);
          if (!picked) continue;
          if (await images.saveMxik(mxik, picked.bytes, picked.sourceName)) mxikSaved(mxik);
        } catch (error) {
          console.warn(`[pictures] ${mxik}:`, error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, mxikSaved]);
}
