import { readChoices } from "./useColumnVisibility";

/** The jest environment is node: a minimal localStorage is enough for the reader. */
function withStorage(value: string | null, read: () => unknown) {
  const store = new Map<string, string>();
  if (value !== null) store.set("k", value);
  (globalThis as { localStorage?: Pick<Storage, "getItem"> }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
  };
  try {
    return read();
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

const keys = new Set(["name", "cost", "unit"] as const);

describe("readChoices", () => {
  it("keeps the stored choices for columns that exist", () => {
    expect(withStorage('{"cost":true,"unit":false}', () => readChoices("k", keys))).toEqual({
      cost: true,
      unit: false,
    });
  });

  it("drops a column that no longer exists and a value that is not a boolean", () => {
    expect(
      withStorage('{"cost":true,"removed":true,"unit":"yes"}', () => readChoices("k", keys)),
    ).toEqual({ cost: true });
  });

  it.each([
    ["nothing stored", null],
    ["broken JSON", '{"cost":'],
    ["an array", '["cost"]'],
    ["a primitive", "42"],
    ["null", "null"],
  ])("falls back to the defaults on %s", (_, stored) => {
    expect(withStorage(stored, () => readChoices("k", keys))).toEqual({});
  });

  it("falls back to the defaults when storage throws", () => {
    (globalThis as { localStorage?: Pick<Storage, "getItem"> }).localStorage = {
      getItem: () => {
        throw new Error("denied");
      },
    };
    try {
      expect(readChoices("k", keys)).toEqual({});
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
