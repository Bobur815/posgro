import { markingBlockCodes } from "./marking-block";
import { describeMarkingBlock } from "../../main/fiscal/marking-gate";

describe("markingBlockCodes", () => {
  // The renderer reads what the main process writes; this pins the two together.
  it("reads back what the fiscal gate writes", () => {
    const text = describeMarkingBlock([
      { barcode: "4780047860466", label: "x", status: "WITHDRAWN" },
      { barcode: "4780047861784", label: "y", status: "NOT_FOUND" },
    ]);
    expect(markingBlockCodes(text)).toBe("4780047860466 (WITHDRAWN), 4780047861784 (NOT_FOUND)");
  });

  it("is null for any other fiscal error", () => {
    expect(markingBlockCodes("Ошибка проверки МХИК (ИКПУ) товара")).toBeNull();
    expect(markingBlockCodes(null)).toBeNull();
  });
});
