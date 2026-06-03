export interface AgentMailMessageSummary {
  message_id: string;
  subject?: string;
  from?: string;
  timestamp?: string;
  preview?: string;
  text?: string;
  plain?: string;
  body_text?: string;
  extracted_text?: string;
  html?: string;
  body_html?: string;
  extracted_html?: string;
  body?: unknown;
  content?: unknown;
}

export interface AgentMailMessageListResponse {
  messages?: AgentMailMessageSummary[];
}

export type AgentMailFetch = (input: string, init?: RequestInit) => Promise<Response>;

const syncTokenStorageKey = "expense-me-agentmail-sync-token";

export function normalizeAgentMailMessages(messages: AgentMailMessageSummary[]) {
  const seen = new Set<string>();

  return messages.filter((message) => {
    if (seen.has(message.message_id)) {
      return false;
    }

    seen.add(message.message_id);
    return true;
  });
}

function unwrapAgentMailMessage(body: unknown, messageId: string): AgentMailMessageSummary {
  if (body && typeof body === "object" && "message" in body) {
    const nested = (body as { message?: unknown }).message;
    if (nested && typeof nested === "object") {
      return { message_id: messageId, ...(nested as Partial<AgentMailMessageSummary>) };
    }
  }

  return { message_id: messageId, ...(body as Partial<AgentMailMessageSummary>) };
}

function readSyncToken() {
  try {
    return window.localStorage.getItem(syncTokenStorageKey)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function storeSyncToken(token: string) {
  try {
    window.localStorage.setItem(syncTokenStorageKey, token);
  } catch {
    // Token persistence is best-effort; the user can re-enter it on the next sync.
  }
}

function promptForSyncToken() {
  if (typeof window.prompt !== "function") return undefined;

  const token = window.prompt("Enter the email sync passcode")?.trim();
  if (!token) return undefined;

  storeSyncToken(token);
  return token;
}

function fetchInitForToken(token: string): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${token}`
    }
  };
}

async function fetchWithOptionalToken(input: string, fetcher: AgentMailFetch) {
  const token = readSyncToken();
  const response = token ? await fetcher(input, fetchInitForToken(token)) : await fetcher(input);

  if (response.status !== 401) return response;

  const promptedToken = promptForSyncToken();
  return promptedToken ? fetcher(input, fetchInitForToken(promptedToken)) : response;
}

export async function fetchAgentMailMessage(messageId: string, fetcher: AgentMailFetch = fetch) {
  const response = await fetchWithOptionalToken(`/api/agentmail/messages?messageId=${encodeURIComponent(messageId)}`, fetcher);

  if (!response.ok) {
    throw new Error(`AgentMail message fetch failed: ${response.status}`);
  }

  return unwrapAgentMailMessage(await response.json(), messageId);
}

export async function fetchAgentMailMessages(fetcher: AgentMailFetch = fetch) {
  const response = await fetchWithOptionalToken("/api/agentmail/messages", fetcher);

  if (!response.ok) {
    throw new Error(`AgentMail sync failed: ${response.status}`);
  }

  const body = await response.json() as AgentMailMessageListResponse | AgentMailMessageSummary[];
  const messages = Array.isArray(body) ? body : body.messages ?? [];

  const summaries = normalizeAgentMailMessages(messages);

  return Promise.all(
    summaries.map(async (summary) => {
      try {
        const detail = await fetchAgentMailMessage(summary.message_id, fetcher);
        return { ...summary, ...detail, message_id: summary.message_id };
      } catch {
        return summary;
      }
    })
  );
}
