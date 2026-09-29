import React, { createContext, useContext, useEffect, useState } from "react";
import { translate, initialLang, saveLang, type Lang, type StringKey } from "../i18n";
import { useThemeMode } from "../hooks/useThemeMode";

interface LandingContextValue {
  lang: Lang;
  ru: boolean;
  toggleLang: () => void;
  t: (key: StringKey) => string;
  dark: boolean;
  toggleDark: () => void;
}

const LandingContext = createContext<LandingContextValue | null>(null);

/** Language and colour mode — the two viewer preferences every section reads. */
export function LandingProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const { dark, toggleDark } = useThemeMode();

  useEffect(() => {
    document.documentElement.lang = lang;
    saveLang(lang);
  }, [lang]);

  const value: LandingContextValue = {
    lang,
    ru: lang === "ru",
    toggleLang: () => setLang((l) => (l === "ru" ? "uz" : "ru")),
    t: (key) => translate(lang, key),
    dark,
    toggleDark,
  };

  return <LandingContext.Provider value={value}>{children}</LandingContext.Provider>;
}

export function useLanding(): LandingContextValue {
  const ctx = useContext(LandingContext);
  if (!ctx) throw new Error("useLanding must be used inside <LandingProvider>");
  return ctx;
}
