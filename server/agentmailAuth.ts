import type { Request, Response } from "express";

export function isAgentMailRequestAuthorized(request: Request) {
  const expectedToken = process.env.AGENTMAIL_SYNC_TOKEN;
  if (!expectedToken) return true;

  const authorization = request.headers.authorization ?? "";
  const bearerToken = String(authorization).match(/^Bearer\s+(.+)$/i)?.[1];
  const headerToken = request.headers["x-agentmail-sync-token"];

  return bearerToken === expectedToken || headerToken === expectedToken;
}

export function rejectUnauthorizedAgentMailRequest(response: Response) {
  response.status(401).json({ error: "AgentMail sync authorization required" });
}
