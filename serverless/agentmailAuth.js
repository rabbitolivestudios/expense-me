export function isAgentMailRequestAuthorized(request) {
  const expectedToken = process.env.AGENTMAIL_SYNC_TOKEN;
  if (!expectedToken) return true;

  const authorization = request.headers?.authorization ?? request.headers?.Authorization ?? "";
  const bearerToken = String(authorization).match(/^Bearer\s+(.+)$/i)?.[1];
  const headerToken = request.headers?.["x-agentmail-sync-token"] ?? request.headers?.["X-AgentMail-Sync-Token"];

  return bearerToken === expectedToken || headerToken === expectedToken;
}

export function rejectUnauthorizedAgentMailRequest(response) {
  response.status(401).json({ error: "AgentMail sync authorization required" });
}
