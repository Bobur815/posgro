/**
 * Small, pure pieces of the login screen's terminal dialogs, kept apart so they can be tested
 * without rendering anything.
 */

/**
 * The `settings.*` translation key inside an IPC failure, or null.
 *
 * The main process throws a key; Electron wraps it as
 * `Error invoking remote method '...': Error: settings.foo`, so the key is dug back out. Without
 * this the dialog showed that whole string to whoever was standing at the terminal.
 */
export function settingsErrorKey(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return raw.match(/(settings\.[A-Za-z0-9_.]+)/)?.[1] ?? null;
}

/** "9:05" for the time left on a pairing code; "0:00" once it has run out. */
export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** When a satellite last reported in, as a short local date and time — or null if it never has. */
export function formatLastSeen(iso: string | null, language: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(language === "uz" ? "uz-UZ" : "ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
