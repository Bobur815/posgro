import { create } from "zustand";

/**
 * Cache-busting for posimg: URLs. The main process serves pictures with max-age, so a picture that
 * changes must change its URL: a fetched MXIK picture bumps that code only; an admin's own picture
 * (rare) bumps every URL once.
 */
interface PictureState {
  mxikVersions: Record<string, number>;
  ownVersion: number;
  mxikSaved: (mxik: string) => void;
  ownChanged: () => void;
}

export const usePictureStore = create<PictureState>()((set) => ({
  mxikVersions: {},
  ownVersion: 0,
  mxikSaved: (mxik) =>
    set((s) => ({ mxikVersions: { ...s.mxikVersions, [mxik]: (s.mxikVersions[mxik] ?? 0) + 1 } })),
  ownChanged: () => set((s) => ({ ownVersion: s.ownVersion + 1 })),
}));
