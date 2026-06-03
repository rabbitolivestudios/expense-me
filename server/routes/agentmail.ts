import { Router } from "express";
import { getAgentMailMessage, listAgentMailMessages } from "../agentmailClient";

export const agentMailRouter = Router();

agentMailRouter.get("/messages", async (_request, response) => {
  try {
    response.json(await listAgentMailMessages());
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
