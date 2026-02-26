import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  language: string;
  theme: 'light' | 'dark';
  setLanguage: (language: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'ru',
      theme: 'light',

      setLanguage: (language) => {
        set({ language });
        localStorage.setItem('language', language);
      },

      setTheme: (theme) => {
        set({ theme });
        localStorage.setItem('theme', theme);
      },
    }),
    {
      name: 'settings-storage',
    }
  )
);
