function requireConfig() {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  const inboxId = process.env.AGENTMAIL_INBOX_ID || "expense-me@agentmail.to";
  const baseUrl = process.env.AGENTMAIL_BASE_URL || "https://api.agentmail.to";

  if (!apiKey) {
    throw new Error("AGENTMAIL_API_KEY is not configured.");
  }

  return {
    apiKey,
    inboxId,
    baseUrl: baseUrl.replace(/\/+$/, "")
  };
}

async function requestAgentMail(config, path, failureMessage) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`${failureMessage}: ${response.status}`);
  }

  return response.json();
}

export async function listAgentMailMessages() {
  const config = requireConfig();
  const inbox = encodeURIComponent(config.inboxId);

  return requestAgentMail(config, `/v0/inboxes/${inbox}/messages`, "AgentMail list failed");
}

export async function getAgentMailMessage(messageId) {
  const config = requireConfig();
  const inbox = encodeURIComponent(config.inboxId);
  const message = encodeURIComponent(messageId);

  return requestAgentMail(config, `/v0/inboxes/${inbox}/messages/${message}`, "AgentMail message fetch failed");
}
