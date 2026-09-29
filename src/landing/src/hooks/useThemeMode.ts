import { useEffect, useState } from "react";
import { THEME_KEY } from "../config";

function initialDark(): boolean {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark") return true;
    if (saved === "light") return false;
  } catch {
    /* ignore */
  }
  return (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Saved choice, else the OS preference. Remembered across visits when storage allows. */
export function useThemeMode() {
  const [dark, setDark] = useState<boolean>(initialDark);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      /* the page works fine without remembering */
    }
  }, [dark]);

  return { dark, toggleDark: () => setDark((d) => !d) };
}
