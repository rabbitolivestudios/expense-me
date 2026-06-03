import { Router } from "express";
import { getAgentMailMessage, listAgentMailMessages } from "../agentmailClient";

export const agentMailRouter = Router();

agentMailRouter.get("/messages", async (request, response) => {
  const messageId = typeof request.query.messageId === "string" ? request.query.messageId : undefined;

  try {
    response.json(messageId ? await getAgentMailMessage(messageId) : await listAgentMailMessages());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "AgentMail sync failed" });
  }
});

agentMailRouter.get("/messages/:messageId", async (request, response) => {
  try {
    response.json(await getAgentMailMessage(request.params.messageId));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "AgentMail message fetch failed" });
  }
});
