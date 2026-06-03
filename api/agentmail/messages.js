import { listAgentMailMessages } from "../../serverless/agentmailClient.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    response.status(200).json(await listAgentMailMessages());
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "AgentMail sync failed"
    });
  }
}
