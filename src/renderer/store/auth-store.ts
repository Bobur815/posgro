import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  phone: string;
  role: 'ADMIN' | 'USER';
  nameUz: string;
  nameRu: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isPinLogin: boolean;
  isLoading: boolean;
  error: string | null;
  sessionRestored: boolean;
  login: (phone: string, password: string) => Promise<boolean>;
  loginWithPin: (pin: string) => Promise<boolean>;
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
      isPinLogin: false,
      isLoading: false,
      error: null,
      sessionRestored: false,

      login: async (phone: string, password: string) => {
        
        set({ isLoading: true, error: null });
        
        try {
          console.log(`Attempting login with phone: ${phone}, password: ${password}`);
          
          const result = await window.electronAPI.auth.login(phone, password);          
          const { token, user } = result as { token: string; user: User };

          set({
            user,
            token,
            isAuthenticated: true,
            isPinLogin: false,
            isLoading: false,
            error: null,
          });

          return true;
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Login failed',
          });
          return false;
        }
      },

      loginWithPin: async (pin: string) => {
        set({ isLoading: true, error: null });

        try {
          const result = await window.electronAPI.auth.loginWithPin(pin);
          const { token, user } = result as { token: string; user: User };

          set({
            user,
            token,
            isAuthenticated: true,
            isPinLogin: true,
            isLoading: false,
            error: null,
          });

          return true;
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Invalid PIN',
          });
          return false;
        }
      },

      logout: async () => {
        try {
          await window.electronAPI.auth.logout();
        } catch (err) {
          console.error('Logout error:', err);
        }

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isPinLogin: false,
        });
      },

      restoreSession: async () => {
        const { token, isAuthenticated, sessionRestored } = get();

        // Only restore once
        if (sessionRestored) return;

        set({ sessionRestored: true });

        // If we have a stored token and think we're authenticated, restore the session
        if (token && isAuthenticated) {
          try {
            const user = await window.electronAPI.auth.restoreSession(token);
            if (user) {
              set({ user: user as User });
            } else {
              // Token invalid, clear auth state
              set({
                user: null,
                token: null,
                isAuthenticated: false,
                isPinLogin: false,
              });
            }
          } catch (err) {
            console.error('Session restore error:', err);
            // Clear auth state on error
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              isPinLogin: false,
            });
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
        isPinLogin: state.isPinLogin,
      }),
    }
  )
);
