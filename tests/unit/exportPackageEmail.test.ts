import { describe, expect, it, vi } from "vitest";
import {
  buildExportPackageEmailContent,
  sendExportPackageEmail
} from "../../src/cloudflare/exportPackageEmail";
import type { CloudflareEnv } from "../../src/cloudflare/types";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  }));
}

function requestBody(init?: RequestInit) {
  return JSON.parse(String(init?.body ?? "{}")) as {
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
    attachments?: Array<{ content: string; filename: string; content_type: string }>;
  };
}

describe("Export Package email delivery", () => {
  it("builds a clear work-email subject and body around the Expense Folder name", () => {
    const content = buildExportPackageEmailContent({
      folderName: "June Customer Visit",
      expenseCount: 3,
      generatedAt: "2026-06-04T12:00:00.000Z"
    });

    expect(content.subject).toBe("Expense Me Export Package - June Customer Visit");
    expect(content.text).toContain('Attached is the Expense Me Export Package for "June Customer Visit".');
    expect(content.text).toContain("3 expenses");
    expect(content.text).toContain("Generated on Jun 4, 2026");
    expect(content.html).toContain("June Customer Visit");
    expect(content.html).toContain("3 expenses");
  });

  it("sends the Export Package zip through AgentMail as a base64 attachment", async () => {
    const fetcher = vi.fn().mockResolvedValue(await jsonResponse({
      message_id: "agentmail-message-1",
      thread_id: "agentmail-thread-1"
    }));
    const env = {
      AGENTMAIL_API_KEY: "test-key",
      AGENTMAIL_INBOX_ID: "expense-me@agentmail.to",
      AGENTMAIL_BASE_URL: "https://agentmail.test",
      EXPORT_PACKAGE_EMAIL_TO: "thiago.oliveira@arcelormittal.com"
    } as CloudflareEnv;

    await expect(sendExportPackageEmail(env, {
      recipient: "thiago.oliveira@arcelormittal.com",
      folderName: "June Customer Visit",
      filename: "June Customer Visit.zip",
      zipBytes: new Uint8Array([80, 75]),
      expenseCount: 3,
      generatedAt: "2026-06-04T12:00:00.000Z"
    }, fetcher)).resolves.toEqual({
      messageId: "agentmail-message-1",
      threadId: "agentmail-thread-1",
      recipient: "thiago.oliveira@arcelormittal.com",
      subject: "Expense Me Export Package - June Customer Visit"
    });

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://agentmail.test/v0/inboxes/expense-me%40agentmail.to/messages/send");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json"
    });
    expect(requestBody(init)).toMatchObject({
      to: "thiago.oliveira@arcelormittal.com",
      subject: "Expense Me Export Package - June Customer Visit",
      attachments: [{
        content: "UEs=",
        filename: "June Customer Visit.zip",
        content_type: "application/zip"
      }]
    });
  });

  it("fails closed when no Export Package email recipient is configured", async () => {
    const fetcher = vi.fn();
    const env = {
      AGENTMAIL_API_KEY: "test-key",
      AGENTMAIL_INBOX_ID: "expense-me@agentmail.to",
      AGENTMAIL_BASE_URL: "https://agentmail.test"
    } as CloudflareEnv;

    await expect(sendExportPackageEmail(env, {
      folderName: "June Customer Visit",
      filename: "June Customer Visit.zip",
      zipBytes: new Uint8Array([80, 75])
    }, fetcher)).rejects.toThrow("Export Package email recipient is not configured.");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
