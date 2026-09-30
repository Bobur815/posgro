import { useCallback, useEffect, useState } from "react";
import { news } from "../../api/client";

const SEEN_KEY = "posgro-news-seen";
const SEEN_EVENT = "posgro-news-seen";

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Whether a post newer than the last one this browser opened the news list at exists. Per browser,
 * no table: a missed dot on a second device costs nothing.
 */
export function useNewsUnread(): boolean {
  const [newest, setNewest] = useState<string | null>(null);
  const [seen, setSeen] = useState(readSeen);

  useEffect(() => {
    news
      .feed(1, 1)
      .then((page) => setNewest(page.items[0]?.publishedAt ?? null))
      .catch(() => setNewest(null)); // off (NEWS_ENABLED) or offline: no dot
    const onSeen = () => setSeen(readSeen());
    window.addEventListener(SEEN_EVENT, onSeen);
    return () => window.removeEventListener(SEEN_EVENT, onSeen);
  }, []);

  return Boolean(newest && newest > seen);
}

/** Called by the news list once it has shown the newest post. ISO strings compare in order. */
export function useMarkNewsSeen() {
  return useCallback((newestPublishedAt: string | null | undefined) => {
    if (!newestPublishedAt || newestPublishedAt <= readSeen()) return;
    try {
      localStorage.setItem(SEEN_KEY, newestPublishedAt);
    } catch {
      /* private mode: the dot just stays */
    }
    window.dispatchEvent(new Event(SEEN_EVENT));
  }, []);
}
