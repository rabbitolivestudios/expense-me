import { getAgentMailMessage } from "../../../serverless/agentmailClient.js";
import { isAgentMailRequestAuthorized, rejectUnauthorizedAgentMailRequest } from "../../../serverless/agentmailAuth.js";

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

  const { messageId } = request.query;
  const resolvedMessageId = Array.isArray(messageId) ? messageId[0] : messageId;

  if (!resolvedMessageId) {
    response.status(400).json({ error: "Missing message id" });
    return;
  }

  try {
    response.status(200).json(await getAgentMailMessage(resolvedMessageId));
  } catch (error) {
    console.error("AgentMail message fetch failed", error);
    response.status(500).json({
      error: "AgentMail message fetch failed"
    });
  }
}
