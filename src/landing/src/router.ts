import { useEffect, useState } from "react";

/**
 * Three routes do not justify react-router: `/`, `/news` and `/news/<slug>`. nginx already sends
 * every unknown path to index.html (nginx/sites/posgro.uz.conf, try_files), so deep links and
 * reloads land here and this hook picks the page from the pathname.
 */

const NAV_EVENT = "posgro-navigate";

export function navigate(to: string): void {
  if (to === window.location.pathname + window.location.hash) return;
  window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(NAV_EVENT));
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function usePathname(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    window.addEventListener(NAV_EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(NAV_EVENT, update);
    };
  }, []);
  return path;
}

/**
 * onClick for an internal <a href>: navigates without a reload, but leaves ctrl/cmd/middle-click
 * ("open in new tab") to the browser.
 */
export function linkTo(to: string) {
  return (e: React.MouseEvent) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    navigate(to);
  };
}

export type Route =
  | { page: "home" }
  | { page: "news" }
  | { page: "article"; slug: string };

export function matchRoute(path: string): Route {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/news") return { page: "news" };
  const m = /^\/news\/([a-z0-9-]+)$/.exec(clean);
  if (m) return { page: "article", slug: m[1] };
  return { page: "home" };
}
