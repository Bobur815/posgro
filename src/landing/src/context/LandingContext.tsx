import React, { createContext, useContext, useEffect, useState } from "react";
import {
  translate,
  initialLang,
  saveLang,
  type Lang,
  type StringKey,
} from "../i18n";

interface LandingContextValue {
  lang: Lang;
  ru: boolean;
  toggleLang: () => void;
  t: (key: StringKey) => string;
}

const LandingContext = createContext<LandingContextValue | null>(null);

/** The viewer's language — the one preference every section reads. The page is light-only. */
export function LandingProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    saveLang(lang);
  }, [lang]);

  const value: LandingContextValue = {
    lang,
    ru: lang === "ru",
    toggleLang: () => setLang((l) => (l === "ru" ? "uz" : "ru")),
    t: (key) => translate(lang, key),
  };

  return (
    <LandingContext.Provider value={value}>{children}</LandingContext.Provider>
  );
}

export function useLanding(): LandingContextValue {
  const ctx = useContext(LandingContext);
  if (!ctx) throw new Error("useLanding must be used inside <LandingProvider>");
  return ctx;
}
