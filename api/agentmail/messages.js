import { getAgentMailMessage, listAgentMailMessages } from "../../serverless/agentmailClient.js";
import { isAgentMailRequestAuthorized, rejectUnauthorizedAgentMailRequest } from "../../serverless/agentmailAuth.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isAgentMailRequestAuthorized(request)) {
    rejectUnauthorizedAgentMailRequest(response);
    return;
  }

  const { messageId, message_id: messageIdAlias } = request.query;
  const resolvedMessageId = Array.isArray(messageId)
    ? messageId[0]
    : messageId || (Array.isArray(messageIdAlias) ? messageIdAlias[0] : messageIdAlias);

  try {
    response.status(200).json(resolvedMessageId ? await getAgentMailMessage(resolvedMessageId) : await listAgentMailMessages());
  } catch (error) {
    console.error(resolvedMessageId ? "AgentMail message fetch failed" : "AgentMail sync failed", error);
    response.status(500).json({
      error: resolvedMessageId ? "AgentMail message fetch failed" : "AgentMail sync failed"
    });
  }
}
