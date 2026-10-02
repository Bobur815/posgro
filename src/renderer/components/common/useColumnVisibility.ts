import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * A table column the user can show or hide (ColumnPicker). Shared by the POS and the web
 * dashboard — this folder is compiled by both — so it stays free of anything Electron-only.
 */
export interface ColumnDef<T, K extends string = string> {
  key: K;
  /** Header text, already translated; also the picker label. */
  label: string;
  render: (item: T, index: number) => ReactNode;
  defaultVisible: boolean;
  /** Listed in the picker, but checked and disabled — the table can never be left empty. */
  alwaysVisible?: boolean;
  /** Not listed in the picker at all and always shown (row number, row actions). */
  fixed?: boolean;
  /** Shown only to admins; the page drops it for everyone else. */
  adminOnly?: boolean;
}

export interface ColumnVisibility<K extends string> {
  visible: Set<K>;
  isVisible: (key: K) => boolean;
  toggle: (key: K) => void;
  reset: () => void;
}

/** Only the user's explicit choices are stored, so a column added later still gets its default. */
type Choices<K extends string> = Partial<Record<K, boolean>>;

export function readChoices<K extends string>(storageKey: string, keys: ReadonlySet<K>): Choices<K> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const choices: Choices<K> = {};
    for (const [key, value] of Object.entries(parsed)) {
      // A column that no longer exists (or a hand-edited value) is ignored, never an error.
      if (keys.has(key as K) && typeof value === "boolean") choices[key as K] = value;
    }
    return choices;
  } catch {
    return {};
  }
}

function writeChoices<K extends string>(storageKey: string, choices: Choices<K>): void {
  try {
    if (Object.keys(choices).length === 0) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify(choices));
  } catch {
    // Storage full or unavailable: the choice still holds for this session.
  }
}

/**
 * Which columns of a table are shown, remembered per app in localStorage under `storageKey`.
 * Pass every column the page can have (before role filtering), so one user's choices for an
 * admin-only column survive a cashier using the same machine.
 */
export function useColumnVisibility<T, K extends string>(
  storageKey: string,
  columns: ReadonlyArray<ColumnDef<T, K>>,
): ColumnVisibility<K> {
  // Columns are rebuilt every render; only their keys and defaults matter here.
  const signature = columns
    .map((c) => `${c.key}:${c.defaultVisible ? 1 : 0}:${c.fixed || c.alwaysVisible ? 1 : 0}`)
    .join(",");
  // `signature` stands in for `columns` as the dependency (react-hooks lint covers .tsx only).
  const defs = useMemo(() => columns, [signature]);
  const keys = useMemo(() => new Set(defs.map((c) => c.key)), [defs]);

  const [choices, setChoices] = useState<Choices<K>>(() => readChoices(storageKey, keys));

  const visible = useMemo(() => {
    const set = new Set<K>();
    for (const c of defs) {
      const shown = c.fixed || c.alwaysVisible || (choices[c.key] ?? c.defaultVisible);
      if (shown) set.add(c.key);
    }
    return set;
  }, [defs, choices]);

  const isVisible = useCallback((key: K) => visible.has(key), [visible]);

  const toggle = useCallback(
    (key: K) => {
      const def = defs.find((c) => c.key === key);
      if (!def || def.fixed || def.alwaysVisible) return;
      setChoices((prev) => {
        const next: Choices<K> = { ...prev, [key]: !(prev[key] ?? def.defaultVisible) };
        writeChoices(storageKey, next);
        return next;
      });
    },
    [defs, storageKey],
  );

  const reset = useCallback(() => {
    writeChoices(storageKey, {});
    setChoices({});
  }, [storageKey]);

  return { visible, isVisible, toggle, reset };
}
