import { readFileSync } from 'fs';
import { join } from 'path';
import { StoresService } from './stores.service';

/**
 * `purgeExpired` must empty every table that would stop `store.delete`, children first.
 *
 * It did not: debt_transactions, shifts, stock movements, stocktakes, marking codes and terminal
 * logs all reference the store (or one of its users/products) without onDelete: Cascade, so the
 * final delete failed on a foreign key and the whole purge rolled back — for any store that had
 * ever closed a shift. The list is checked against prisma/schema.prisma itself, so a table added
 * later with such a relation fails this test instead of the nightly purge.
 */

interface Relation {
  from: string;
  to: string;
  cascade: boolean;
}

function readSchema() {
  const text = readFileSync(join(__dirname, '../../../../prisma/schema.prisma'), 'utf8');
  const models = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const open = /^model (\w+) \{/.exec(line);
    if (open) {
      current = open[1];
      models.set(current, []);
    } else if (line.startsWith('}')) {
      current = null;
    } else if (current) {
      models.get(current)!.push(line);
    }
  }

  const relations: Relation[] = [];
  for (const [from, lines] of models) {
    for (const line of lines) {
      const rel = /^\s+\w+\s+(\w+)\??\s+@relation\(([^)]*)\)/.exec(line);
      if (rel && models.has(rel[1])) {
        relations.push({
          from,
          to: rel[1],
          cascade: /onDelete:\s*Cascade/.test(rel[2]),
        });
      }
    }
  }
  return relations;
}

const delegate = (model: string) => model[0].toLowerCase() + model.slice(1);

/** Runs the purge for one store and returns the delegates it emptied, in order. */
async function purgeOrder(): Promise<string[]> {
  const calls: string[] = [];
  const prisma = new Proxy(
    {
      store: {
        findMany: jest.fn(async () => [{ id: 'S1' }]),
        delete: jest.fn(() => calls.push('store')),
      },
      $transaction: jest.fn(async () => []),
    } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        return { deleteMany: jest.fn(() => calls.push(prop)) };
      },
    },
  );
  await new StoresService(prisma as never, {} as never, {} as never, {} as never).purgeExpired();
  return calls;
}

describe('StoresService.purgeExpired', () => {
  const relations = readSchema();

  it('empties every table that would block deleting the store', async () => {
    const order = await purgeOrder();
    const blocking = relations
      .filter((r) => r.to === 'Store' && !r.cascade)
      .map((r) => delegate(r.from));

    expect(blocking.filter((model) => !order.includes(model))).toEqual([]);
    expect(order[order.length - 1]).toBe('store');
  });

  it('deletes children before the rows they point at', async () => {
    const order = await purgeOrder();
    const position = (model: string) => order.indexOf(delegate(model));

    // A row that goes with its parent by cascade (SaleItem with Sale) must be gone, through that
    // parent, before whatever else it points at (Product).
    const removedBy = (model: string): string => {
      if (order.includes(delegate(model))) return model;
      const parent = relations.find((r) => r.from === model && r.cascade && r.to !== 'Store');
      return parent ? removedBy(parent.to) : model;
    };

    const late = relations
      .filter((r) => !r.cascade && r.to !== 'Store' && order.includes(delegate(r.to)))
      .filter((r) => position(removedBy(r.from)) > position(r.to))
      .map((r) => `${r.from} -> ${r.to}`);

    expect(late).toEqual([]);
  });
});
