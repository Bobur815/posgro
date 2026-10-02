import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  language: string;
  theme: 'light' | 'dark';
  /**
   * Product/category pictures on the POS catalog. Per till, off by default: off is the catalog as
   * it was before pictures existed, and a slow till keeps it that way.
   */
  showProductImages: boolean;
  setLanguage: (language: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setShowProductImages: (show: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'ru',
      theme: 'light',
      showProductImages: false,

      setLanguage: (language) => {
        set({ language });
        localStorage.setItem('language', language);
      },

      setTheme: (theme) => {
        set({ theme });
        localStorage.setItem('theme', theme);
      },

      setShowProductImages: (showProductImages) => set({ showProductImages }),
    }),
    {
      name: 'settings-storage',
    }
  )
);
