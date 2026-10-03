import { clearSentDueDates, markDueDateChanged, readDirtyDueDates } from './debt-due-dates';

function fakeDb() {
  const rows = new Map<string, string>();
  return {
    systemSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        rows.has(where.key) ? { value: rows.get(where.key)! } : null,
      upsert: async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        rows.set(where.key, update.value);
        return null;
      },
    },
    rows,
  };
}

describe('debt due-date queue', () => {
  it('keeps a change made while its upload was in flight', async () => {
    const db = fakeDb();
    await markDueDateChanged(db, 'a');
    await markDueDateChanged(db, 'b');
    const sent = await readDirtyDueDates(db);

    // 'b' is changed again after the upload read the queue.
    await new Promise((r) => setTimeout(r, 5));
    await markDueDateChanged(db, 'b');

    await clearSentDueDates(db, sent);
    expect(Object.keys(await readDirtyDueDates(db))).toEqual(['b']);
  });

  it('reads a corrupt value as an empty queue', async () => {
    const db = fakeDb();
    db.rows.set('debt_due_dates_dirty', '{not json');
    expect(await readDirtyDueDates(db)).toEqual({});
  });
});
