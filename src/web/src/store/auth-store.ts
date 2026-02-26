import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@shared/types';
import { auth as authApi } from '../api/client';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  sessionRestored: boolean;
  login: (phone: string, password: string, storeId?: string) => Promise<boolean>;
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

      login: async (phone: string, password: string, storeId?: string) => {
        set({ isLoading: true, error: null });

        try {
          const result = await authApi.login(phone, password, storeId);
          const { token, user } = result as { token: string; user: AuthUser };

          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          return true;
        } catch (err) {
          const raw = err instanceof Error ? err.message : '';
          const match = raw.match(/Error:\s*(auth\.errors\.\S+)/);
          set({
            isLoading: false,
            error: match ? match[1] : 'auth.errors.login_failed',
          });
          return false;
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
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
