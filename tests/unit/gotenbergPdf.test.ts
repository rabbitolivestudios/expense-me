import { describe, expect, it, vi } from "vitest";
import type { CloudflareEnv } from "../../src/cloudflare/types";
import { renderHtmlToPdfWithGotenberg } from "../../src/cloudflare/gotenbergPdf";

describe("Gotenberg PDF renderer", () => {
  it("posts email HTML to the Chromium HTML conversion endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("%PDF-gotenberg", {
      status: 200,
      headers: { "Content-Type": "application/pdf" }
    }));
    const env = {
      GOTENBERG_URL: "https://gotenberg.mac-tbo.com/",
      GOTENBERG_ACCESS_CLIENT_ID: "client-id",
      GOTENBERG_ACCESS_CLIENT_SECRET: "client-secret"
    } as CloudflareEnv;

    const bytes = await renderHtmlToPdfWithGotenberg(
      env,
      "<html><body>Uber formatted receipt</body></html>",
      { filename: "receipt-001-email-receipt.pdf", artifactId: "art-email-1", sourceMessageId: "m1" },
      fetcher
    );

    expect(new TextDecoder().decode(bytes)).toBe("%PDF-gotenberg");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gotenberg.mac-tbo.com/forms/chromium/convert/html");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "CF-Access-Client-Id": "client-id",
      "CF-Access-Client-Secret": "client-secret",
      "Gotenberg-Output-Filename": "receipt-001-email-receipt"
    });
    const body = init.body as FormData;
    expect(body.get("printBackground")).toBe("true");
    expect(body.get("preferCssPageSize")).toBe("true");
    expect(body.get("files")).toBeInstanceOf(File);
  });
});
