import { useEffect } from "react";

/** "Yangiliklar — POSGRO"; the home page's own <title> comes back on the way out. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — POSGRO`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
