import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@shared/types';
import { auth as authApi, type StoreChoice } from '../api/client';

/** The store this browser last worked in — the one a login opens first, when it may. */
const LAST_STORE_KEY = 'last_store_id';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  sessionRestored: boolean;
  /** Every store this sign-in can switch to — one person has one account per store. */
  stores: StoreChoice[];
  login: (phone: string, password: string) => Promise<boolean>;
  /** Open another store. Reloads the page on success; throws on refusal. */
  switchStore: (storeId: string) => Promise<void>;
  loadStores: () => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      sessionRestored: false,
      stores: [],

      login: async (phone: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const result = await authApi.login(
            phone,
            password,
            localStorage.getItem(LAST_STORE_KEY) ?? undefined,
          );
          const { token, user } = result as { token: string; user: AuthUser };

          set({
            user,
            token,
            stores: result.stores ?? [],
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          if (user.storeId) localStorage.setItem(LAST_STORE_KEY, user.storeId);

          return true;
        } catch (err) {
          const raw = err instanceof Error ? err.message : '';
          // The API returns a bare code ("auth.errors.store_inactive"); older paths wrapped it as
          // "Error: auth.errors.…". Accept either, so a code is not lost to its packaging.
          const match = raw.match(/(auth\.errors\.[A-Za-z0-9_.]+)/);
          set({
            isLoading: false,
            error: match ? match[1] : 'auth.errors.login_failed',
          });
          return false;
        }
      },

      switchStore: async (storeId: string) => {
        const result = await authApi.switchStore(storeId);
        const { token, user } = result as { token: string; user: AuthUser };
        set({ user, token, stores: result.stores ?? get().stores });
        localStorage.setItem(LAST_STORE_KEY, storeId);
        // Every page keeps the old store's data in its own state; a reload is the one way to be
        // sure none of it is shown under the new store's name.
        window.location.reload();
      },

      loadStores: async () => {
        try {
          set({ stores: await authApi.getStores() });
        } catch {
          /* the switcher keeps what it had */
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch (err) {
          console.error('Logout error:', err);
        }

        set({
          user: null,
          token: null,
          stores: [],
          isAuthenticated: false,
        });
      },

      restoreSession: async () => {
        const { token, isAuthenticated, sessionRestored } = get();

        if (sessionRestored) return;

        set({ sessionRestored: true });

        if (token && isAuthenticated) {
          try {
            const user = await authApi.getProfile();
            if (user) {
              set({ user: user as AuthUser });
            } else {
              set({ user: null, token: null, isAuthenticated: false });
            }
          } catch (err) {
            console.error('Session restore error:', err);
            set({ user: null, token: null, isAuthenticated: false });
          }
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        stores: state.stores,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
