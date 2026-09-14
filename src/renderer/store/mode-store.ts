import { create } from 'zustand';

export type StoreMode = 'OFFLINE_ONLY' | 'ONLINE';

interface ModeState {
  /** null until hydrated, or when the terminal has never been activated against a server. */
  mode: StoreMode | null;
  /** When true, the Electron app is restricted to cashier operation and admin lives on the web. */
  posAdminLocked: boolean;
  /**
   * True on a satellite of a main terminal (tasks/LAN_MAIN_TERMINAL_PLAN.md). Its catalog,
   * suppliers, users and store settings are its main's, and it has no VCR of its own — the main
   * process refuses those writes; this is what keeps the buttons for them off the screen.
   */
  isSatellite: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  applyUpdate: (update: { mode?: StoreMode; posAdminLocked?: boolean }) => void;
}

/**
 * The terminal's cached operating mode, read once from LocalConfig at startup and refreshed when
 * a sync cycle pulls a change.
 *
 * Every default here is the permissive one on purpose. A terminal that cannot read its config —
 * IPC not ready, a failed query, a never-activated install — must behave exactly as it always
 * has rather than silently lock a shop out of its own stock management.
 *
 * The role cannot change under a running renderer: a role change restarts the app (§11), so
 * `isSatellite` is read once, at hydration.
 */
export const useModeStore = create<ModeState>()((set) => ({
  mode: null,
  posAdminLocked: false,
  isSatellite: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const config = await window.electronAPI.config.getLocalConfig();
      set({
        mode: config?.mode ?? null,
        posAdminLocked: config?.posAdminLocked === true,
        isSatellite: config?.isMain === false,
        hydrated: true,
      });
    } catch {
      // Stay unrestricted — see note above.
      set({ hydrated: true });
    }
  },

  applyUpdate: (update) =>
    set((state) => ({
      mode: update.mode ?? state.mode,
      posAdminLocked:
        update.posAdminLocked !== undefined ? update.posAdminLocked : state.posAdminLocked,
    })),
}));

/**
 * Whether master data — products, categories, stock, suppliers, users — is edited somewhere other
 * than this terminal. True for a cashier-only store (on the web) and for a satellite (on its
 * main); the screens do not care which, only that the edit buttons are not theirs to show.
 */
export function isAdminLocked(state: Pick<ModeState, 'posAdminLocked' | 'isSatellite'>): boolean {
  return state.posAdminLocked || state.isSatellite;
}

export const useAdminLocked = (): boolean => useModeStore(isAdminLocked);
