import { afterEach, describe, expect, it, vi } from "vitest";
import { getAgentMailMessage, listAgentMailMessages } from "../../server/agentmailClient";
import { fetchAgentMailMessage, fetchAgentMailMessages, normalizeAgentMailMessages } from "../../src/features/email/agentMailSync";

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
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        messages: [
          { message_id: "m1", subject: "Receipt" },
          { message_id: "m1", subject: "Receipt copy" }
        ]
      }))
      .mockResolvedValueOnce(jsonResponse({ message_id: "m1", text: "Uber\nJun 3, 2026\nTotal $18.42" }));

    await expect(fetchAgentMailMessages(fetcher)).resolves.toEqual([
      { message_id: "m1", subject: "Receipt", text: "Uber\nJun 3, 2026\nTotal $18.42" }
    ]);
    expect(fetcher).toHaveBeenCalledWith("/api/agentmail/messages");
    expect(fetcher).toHaveBeenCalledWith("/api/agentmail/messages?messageId=m1");
  });

  it("fetches one message through the stable query endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ message_id: "msg 1/2", text: "Receipt body" }));

    await expect(fetchAgentMailMessage("msg 1/2", fetcher)).resolves.toEqual({ message_id: "msg 1/2", text: "Receipt body" });
    expect(fetcher).toHaveBeenCalledWith("/api/agentmail/messages?messageId=msg%201%2F2");
  });

  it("sends the stored AgentMail sync passcode when present", async () => {
    window.localStorage.setItem("expense-me-agentmail-sync-token", "sync-passcode");
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ messages: [] }));

    await expect(fetchAgentMailMessages(fetcher)).resolves.toEqual([]);

    expect(fetcher).toHaveBeenCalledWith("/api/agentmail/messages", {
      headers: {
        Authorization: "Bearer sync-passcode"
      }
    });
  });

  it("prompts once and retries when AgentMail sync requires authorization", async () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("new-passcode");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "AgentMail sync authorization required" }, 401))
      .mockResolvedValueOnce(jsonResponse({ messages: [] }));

    await expect(fetchAgentMailMessages(fetcher)).resolves.toEqual([]);

    expect(prompt).toHaveBeenCalledWith("Enter the email sync passcode");
    expect(fetcher).toHaveBeenLastCalledWith("/api/agentmail/messages", {
      headers: {
        Authorization: "Bearer new-passcode"
      }
    });
    expect(window.localStorage.getItem("expense-me-agentmail-sync-token")).toBe("new-passcode");
  });

  it("falls back to list summaries when detail fetch fails", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ messages: [{ message_id: "m1", subject: "Receipt" }] }))
      .mockResolvedValueOnce(jsonResponse({ error: "missing" }, 404));

    await expect(fetchAgentMailMessages(fetcher)).resolves.toEqual([{ message_id: "m1", subject: "Receipt" }]);
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
