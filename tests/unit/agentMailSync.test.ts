import { afterEach, describe, expect, it, vi } from "vitest";
import { getAgentMailMessage, listAgentMailMessages } from "../../server/agentmailClient";
import { fetchAgentMailMessages, normalizeAgentMailMessages } from "../../src/features/email/agentMailSync";

const originalEnv = {
  AGENTMAIL_API_KEY: process.env.AGENTMAIL_API_KEY,
  AGENTMAIL_INBOX_ID: process.env.AGENTMAIL_INBOX_ID,
  AGENTMAIL_BASE_URL: process.env.AGENTMAIL_BASE_URL
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("AgentMail sync", () => {
  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("dedupes messages by message_id", () => {
    const messages = [
      { message_id: "m1", subject: "Receipt", from: "hotel@example.com", timestamp: "2026-05-20T12:00:00Z" },
      { message_id: "m1", subject: "Receipt", from: "hotel@example.com", timestamp: "2026-05-20T12:00:00Z" },
      { message_id: "m2", subject: "Taxi", from: "driver@example.com", timestamp: "2026-05-21T08:30:00Z" }
    ];

    expect(normalizeAgentMailMessages(messages)).toEqual([messages[0], messages[2]]);
  });

  it("fetches messages through the protected local API and normalizes duplicates", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      messages: [
        { message_id: "m1", subject: "Receipt" },
        { message_id: "m1", subject: "Receipt copy" }
      ]
    }));

    await expect(fetchAgentMailMessages(fetcher)).resolves.toEqual([{ message_id: "m1", subject: "Receipt" }]);
    expect(fetcher).toHaveBeenCalledWith("/api/agentmail/messages");
  });

  it("fails clearly when the protected local API rejects sync", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: "upstream unavailable" }, 503));

    await expect(fetchAgentMailMessages(fetcher)).rejects.toThrow("AgentMail sync failed: 503");
  });
});

describe("AgentMail server client", () => {
  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requires the API key to come from the environment", async () => {
    delete process.env.AGENTMAIL_API_KEY;

    await expect(listAgentMailMessages()).rejects.toThrow("AGENTMAIL_API_KEY is not configured.");
  });

  it("lists messages with a bearer token and encoded inbox id", async () => {
    const apiKey = `test-${Date.now()}`;
    process.env.AGENTMAIL_API_KEY = apiKey;
    process.env.AGENTMAIL_INBOX_ID = "expense me/inbox@example.com";
    process.env.AGENTMAIL_BASE_URL = "https://agentmail.test";

    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ messages: [] }));
    vi.stubGlobal("fetch", fetcher);

    await expect(listAgentMailMessages()).resolves.toEqual({ messages: [] });

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://agentmail.test/v0/inboxes/expense%20me%2Finbox%40example.com/messages");
    expect(init.headers).toEqual({ Authorization: `Bearer ${apiKey}` });
  });

  it("fetches one message with an encoded message id", async () => {
    process.env.AGENTMAIL_API_KEY = `test-${Date.now()}`;
    process.env.AGENTMAIL_INBOX_ID = "expense-me@agentmail.to";
    process.env.AGENTMAIL_BASE_URL = "https://agentmail.test";

    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ message_id: "msg 1/2" }));
    vi.stubGlobal("fetch", fetcher);

    await expect(getAgentMailMessage("msg 1/2")).resolves.toEqual({ message_id: "msg 1/2" });

    const [url] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://agentmail.test/v0/inboxes/expense-me%40agentmail.to/messages/msg%201%2F2");
  });
});
