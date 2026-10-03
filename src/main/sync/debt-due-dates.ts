/**
 * Which customers' due dates were changed on THIS till and not yet sent.
 *
 * A due date used to travel with every customer on every cycle, so each till overwrote the
 * server's with its own copy — the last till to sync won, and a date agreed on another till was
 * lost. Now a till sends a due date only when it changed it (or the customer is new here), and
 * takes the server's for everyone else on the user pull.
 *
 * Kept in system_settings rather than a new column: the set is tiny and short-lived (cleared on
 * the next successful upload), and a SQLite schema change is not worth it for that.
 *
 * Value: { [userId]: ISO time of the change }. The time is what lets an upload clear exactly what
 * it sent — a change made while the request was in flight has a newer time and stays queued.
 */

const KEY = 'debt_due_dates_dirty';

/** The Prisma client or a transaction client: both have systemSetting. */
interface SettingsDb {
  systemSetting: {
    findUnique(args: { where: { key: string } }): Promise<{ value: string } | null>;
    upsert(args: {
      where: { key: string };
      update: { value: string };
      create: { key: string; value: string };
    }): Promise<unknown>;
  };
}

export type DirtyDueDates = Record<string, string>;

export async function readDirtyDueDates(db: SettingsDb): Promise<DirtyDueDates> {
  const row = await db.systemSetting.findUnique({ where: { key: KEY } });
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as DirtyDueDates) : {};
  } catch {
    return {};
  }
}

async function write(db: SettingsDb, value: DirtyDueDates): Promise<void> {
  const json = JSON.stringify(value);
  await db.systemSetting.upsert({
    where: { key: KEY },
    update: { value: json },
    create: { key: KEY, value: json },
  });
}

/** Call wherever this till sets a customer's due date. */
export async function markDueDateChanged(db: SettingsDb, userId: string): Promise<void> {
  const dirty = await readDirtyDueDates(db);
  dirty[userId] = new Date().toISOString();
  await write(db, dirty);
}

/** After a successful upload: forget what was sent, keep anything changed since. */
export async function clearSentDueDates(db: SettingsDb, sent: DirtyDueDates): Promise<void> {
  const ids = Object.keys(sent);
  if (ids.length === 0) return;
  const dirty = await readDirtyDueDates(db);
  for (const id of ids) {
    if (dirty[id] === sent[id]) delete dirty[id];
  }
  await write(db, dirty);
}
