import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("app icon metadata", () => {
  it("declares standard browser icons and the Apple touch icon", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(html).toContain('<link rel="icon" type="image/png" sizes="192x192" href="/icons/expense-me-icon-192.png" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="512x512" href="/icons/expense-me-icon-512.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/expense-me-icon-192.png" />');
  });
});
