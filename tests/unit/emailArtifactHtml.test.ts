import { describe, expect, it, vi } from "vitest";
import { hydrateEmailArtifactHtmlForExport } from "../../src/cloudflare/emailArtifactHtml";
import type { CloudflareEnv } from "../../src/cloudflare/types";
import type { ReceiptArtifact } from "../../src/domain/types";

describe("email artifact HTML hydration", () => {
  it("fetches AgentMail detail to upgrade old text-only email artifacts for export rendering", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message_id: "message-1",
      subject: "Your trip with Uber",
      html: "<html><body><table><tr><td>Uber formatted receipt</td></tr></table></body></html>"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    const env = {
      AGENTMAIL_API_KEY: "test-key",
      AGENTMAIL_BASE_URL: "https://agentmail.test",
      AGENTMAIL_INBOX_ID: "expense-me@agentmail.to"
    } as CloudflareEnv;
    const artifact: ReceiptArtifact = {
      id: "art-email-message-1",
      artifactType: "EmailBody",
      sourceMessageId: "message-1",
      mimeType: "text/plain",
      storageKey: "workspace-personal/artifacts/art-email-message-1",
      createdAt: "2026-06-03T14:00:00.000Z",
      extractedText: "Subject: Your trip with Uber\nTotal $18.42",
      dataUrl: "data:text/plain;base64,U3ViamVjdDogWW91ciB0cmlwIHdpdGggVWJlcg=="
    };

    const hydrated = await hydrateEmailArtifactHtmlForExport(env, artifact, fetcher);

    expect(hydrated.mimeType).toBe("text/html");
    expect(hydrated.dataUrl).toMatch(/^data:text\/html;base64,/);
    expect(atob(hydrated.dataUrl!.split(",")[1])).toContain("<table>");
    expect(fetcher).toHaveBeenCalledWith(
      "https://agentmail.test/v0/inboxes/expense-me%40agentmail.to/messages/message-1",
      { headers: { Authorization: "Bearer test-key" } }
    );
  });

  it("keeps the existing artifact when AgentMail has no HTML", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message_id: "message-1",
      text: "Uber\nTotal $18.42"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    const artifact: ReceiptArtifact = {
      id: "art-email-message-1",
      artifactType: "EmailBody",
      sourceMessageId: "message-1",
      mimeType: "text/plain",
      storageKey: "workspace-personal/artifacts/art-email-message-1",
      createdAt: "2026-06-03T14:00:00.000Z",
      extractedText: "Uber\nTotal $18.42"
    };

    const hydrated = await hydrateEmailArtifactHtmlForExport({
      AGENTMAIL_API_KEY: "test-key",
      AGENTMAIL_BASE_URL: "https://agentmail.test"
    } as CloudflareEnv, artifact, fetcher);

    expect(hydrated).toBe(artifact);
  });
});
