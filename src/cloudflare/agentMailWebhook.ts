import { errorResponse } from "./http";
import type { AccessUser, CloudflareEnv } from "./types";

export interface AgentMailWebhookPayload {
  event_type?: string;
  event_id?: string;
  message?: {
    inbox_id?: string;
    message_id?: string;
  };
}

const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

function webhookError() {
  return errorResponse(401, "Webhook verification failed.");
}

function headerValue(request: Request, name: string) {
  return request.headers.get(name) || request.headers.get(name.toLowerCase()) || "";
}

function normalizeBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return `${normalized}${padding}`;
}

function base64ToBytes(value: string) {
  const binary = atob(normalizeBase64(value));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer) {
  let binary = "";

  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function signingSecretBytes(secret: string) {
  return base64ToBytes(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret);
}

function svixV1Signatures(signatureHeader: string) {
  return signatureHeader
    .split(/\s+/)
    .map((signature) => signature.trim())
    .filter(Boolean)
    .map((signature) => signature.match(/^v1,(.+)$/)?.[1])
    .filter((signature): signature is string => Boolean(signature));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

async function signSvixPayload(secret: string, signedContent: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    signingSecretBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  return bytesToBase64(signature);
}

export function agentMailWebhookUser(env: CloudflareEnv): AccessUser {
  const email = env.ACCESS_ALLOWED_EMAIL?.trim();

  if (!email) {
    throw errorResponse(500, "Webhook user is not configured.");
  }

  return {
    id: `agentmail:${email}`,
    email
  };
}

export async function verifyAgentMailWebhook(
  request: Request,
  env: CloudflareEnv
): Promise<AgentMailWebhookPayload> {
  const webhookSigningSecret = env.AGENTMAIL_WEBHOOK_SECRET?.trim();

  if (!webhookSigningSecret) {
    throw webhookError();
  }

  const id = headerValue(request, "svix-id");
  const timestamp = headerValue(request, "svix-timestamp");
  const signatureHeader = headerValue(request, "svix-signature");
  const timestampSeconds = Number(timestamp);

  if (!id || !Number.isFinite(timestampSeconds) || !signatureHeader) {
    throw webhookError();
  }

  if (Math.abs(Date.now() - timestampSeconds * 1000) > WEBHOOK_TOLERANCE_MS) {
    throw webhookError();
  }

  const body = await request.text();
  const expectedSignature = await signSvixPayload(webhookSigningSecret, `${id}.${timestamp}.${body}`);
  const verified = svixV1Signatures(signatureHeader).some((signature) =>
    constantTimeEqual(signature, expectedSignature)
  );

  if (!verified) {
    throw webhookError();
  }

  return JSON.parse(body) as AgentMailWebhookPayload;
}
