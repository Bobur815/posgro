import { formatQuantity } from "./formatters";

describe("formatQuantity", () => {
  it.each([
    [12, "шт", "ru", "12 шт"],
    [12, "шт", "uz", "12 dona"],
    [2.5, "кг", "ru", "2.5 кг"],
    [0.457, "кг", "uz", "0.457 kg"],
    [1.25, "л", "ru", "1.25 л"],
    [3, "кг", "ru", "3 кг"],
    // Float noise from arithmetic on quantities never reaches the screen.
    [0.1 + 0.2, "кг", "ru", "0.3 кг"],
    [1.0004, "кг", "ru", "1 кг"],
    // An unknown unit (a box line's localised "кор.") passes through verbatim.
    [2, "кор.", "ru", "2 кор."],
  ] as const)("%p %s (%s) → %s", (qty, unit, locale, expected) => {
    expect(formatQuantity(qty, unit, locale)).toBe(expected);
  });
});
