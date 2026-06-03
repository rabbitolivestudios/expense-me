export interface AgentMailMessageSummary {
  message_id: string;
  subject?: string;
  from?: string;
  timestamp?: string;
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

export async function fetchAgentMailMessages(fetcher: AgentMailFetch = fetch) {
  const response = await fetcher("/api/agentmail/messages");

  if (!response.ok) {
    throw new Error(`AgentMail sync failed: ${response.status}`);
  }

  const body = await response.json() as AgentMailMessageListResponse | AgentMailMessageSummary[];
  const messages = Array.isArray(body) ? body : body.messages ?? [];

  return normalizeAgentMailMessages(messages);
}
