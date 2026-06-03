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

export async function fetchAgentMailMessage(messageId: string, fetcher: AgentMailFetch = fetch) {
  const response = await fetcher(`/api/agentmail/messages?messageId=${encodeURIComponent(messageId)}`);

  if (!response.ok) {
    throw new Error(`AgentMail message fetch failed: ${response.status}`);
  }

  return unwrapAgentMailMessage(await response.json(), messageId);
}

export async function fetchAgentMailMessages(fetcher: AgentMailFetch = fetch) {
  const response = await fetcher("/api/agentmail/messages");

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
