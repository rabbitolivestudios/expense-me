import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("app icon metadata", () => {
  it("declares standard browser icons and public Apple touch icons", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(html).toContain('<link rel="icon" type="image/png" sizes="192x192" href="/icons/expense-me-icon-192.png" />');
    expect(html).toContain('<link rel="icon" type="image/png" sizes="512x512" href="/icons/expense-me-icon-512.png" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Expense Me" />');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="https://expense-me-v15.pages.dev/apple-touch-icon-180x180.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="167x167" href="https://expense-me-v15.pages.dev/apple-touch-icon-167x167.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="152x152" href="https://expense-me-v15.pages.dev/apple-touch-icon-152x152.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="120x120" href="https://expense-me-v15.pages.dev/apple-touch-icon-120x120.png" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="https://expense-me-v15.pages.dev/apple-touch-icon.png" />');
  });

  it("keeps root Apple touch-icon fallback files available for iOS", () => {
    for (const filename of [
      "apple-touch-icon.png",
      "apple-touch-icon-180x180.png",
      "apple-touch-icon-167x167.png",
      "apple-touch-icon-152x152.png",
      "apple-touch-icon-120x120.png"
    ]) {
      expect(existsSync(resolve(process.cwd(), "public", filename))).toBe(true);
    }
  });
});
