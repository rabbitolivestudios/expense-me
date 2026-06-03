import { describe, expect, it } from "vitest";
import { seedExpenses } from "../fixtures";
import { createDeclarationText } from "../../src/features/declarations/declaration";

describe("missing receipt declaration", () => {
  it("generates declaration text from an expense", () => {
    const expense = seedExpenses.find((item) => item.status === "Declare")!;
    const text = createDeclarationText(expense, "CASTRO Laurent", "EXP-1229");

    expect(text).toContain("CASTRO Laurent");
    expect(text).toContain("EXP-1229");
    expect(text).toContain("Gas roundtrip Schererville / Training");
    expect(text).toContain("12.82 USD");
  });
});
