import { parseDiscountInput, resolveDiscount } from "./discount";

describe("resolveDiscount", () => {
  it("takes a sum as typed", () => {
    expect(resolveDiscount(5000, "sum", 100000)).toBe(5000);
  });

  it("takes a percent of the receipt, in whole so'm", () => {
    expect(resolveDiscount(10, "percent", 100000)).toBe(10000);
    expect(resolveDiscount(7, "percent", 12345)).toBe(864); // 864.15
  });

  // The total may reach zero but never go below it.
  it("never exceeds the receipt", () => {
    expect(resolveDiscount(250000, "sum", 100000)).toBe(100000);
    expect(resolveDiscount(150, "percent", 100000)).toBe(100000);
  });

  it("is zero for nothing, a negative, or an empty cart", () => {
    expect(resolveDiscount(0, "sum", 100000)).toBe(0);
    expect(resolveDiscount(-5, "percent", 100000)).toBe(0);
    expect(resolveDiscount(NaN, "sum", 100000)).toBe(0);
    expect(resolveDiscount(5000, "sum", 0)).toBe(0);
  });
});

describe("parseDiscountInput", () => {
  it("reads spaces and a decimal comma", () => {
    expect(parseDiscountInput("12 500")).toBe(12500);
    expect(parseDiscountInput("7,5")).toBe(7.5);
  });

  it("is zero for text that is not a number", () => {
    expect(parseDiscountInput("")).toBe(0);
    expect(parseDiscountInput("abc")).toBe(0);
  });
});
