import { Router } from "express";
import { getAgentMailMessage, listAgentMailMessages } from "../agentmailClient";

export const agentMailRouter = Router();

agentMailRouter.get("/messages", async (request, response) => {
  const messageId = typeof request.query.messageId === "string" ? request.query.messageId : undefined;

  try {
    response.json(messageId ? await getAgentMailMessage(messageId) : await listAgentMailMessages());
  } catch (error) {
    console.error(messageId ? "AgentMail message fetch failed" : "AgentMail sync failed", error);
    response.status(500).json({ error: messageId ? "AgentMail message fetch failed" : "AgentMail sync failed" });
  }
});

agentMailRouter.get("/messages/:messageId", async (request, response) => {
  try {
    response.json(await getAgentMailMessage(request.params.messageId));
  } catch (error) {
    console.error("AgentMail message fetch failed", error);
    response.status(500).json({ error: "AgentMail message fetch failed" });
  }
});
