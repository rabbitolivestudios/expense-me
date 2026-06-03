import { getAgentMailMessage } from "../../../serverless/agentmailClient.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { messageId } = request.query;
  const resolvedMessageId = Array.isArray(messageId) ? messageId[0] : messageId;

  if (!resolvedMessageId) {
    response.status(400).json({ error: "Missing message id" });
    return;
  }

  try {
    response.status(200).json(await getAgentMailMessage(resolvedMessageId));
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "AgentMail message fetch failed"
    });
  }
}
