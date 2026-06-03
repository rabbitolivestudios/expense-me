import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("brand tokens", () => {
  it("contains the approved Expense Me color tokens", () => {
    const css = fs.readFileSync("src/styles/tokens.css", "utf8");

    expect(css).toContain("--brand-purple: #460a78");
    expect(css).toContain("--brand-hot-orange: #ff3700");
    expect(css).toContain("--brand-sky-blue: #0072ce");
    expect(css).toContain("--font-ui: Gilroy");
  });
});
