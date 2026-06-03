import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AccessUser, CloudflareEnv } from "./types";

export interface AccessJwtPayload {
  sub?: string;
  email?: string;
  name?: string;
}

export type AccessJwtVerifier = (jwt: string, env: CloudflareEnv) => Promise<AccessJwtPayload>;

const remoteJwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function accessJwtFromRequest(request: Request) {
  return request.headers.get("CF-Access-Jwt-Assertion") || request.headers.get("cf-access-jwt-assertion") || "";
}

export function normalizeAccessIssuer(teamDomain: string) {
  return teamDomain.replace(/\/$/, "");
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function isAllowedEmail(email: string, env: CloudflareEnv) {
  return !env.ACCESS_ALLOWED_EMAIL || email.toLowerCase() === env.ACCESS_ALLOWED_EMAIL.toLowerCase();
}

function remoteJwksForIssuer(issuer: string) {
  const existing = remoteJwksByIssuer.get(issuer);
  if (existing) {
    return existing;
  }

  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  remoteJwksByIssuer.set(issuer, jwks);
  return jwks;
}

export async function verifyAccessJwt(jwt: string, env: CloudflareEnv): Promise<AccessJwtPayload> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new Error("Cloudflare Access is not configured.");
  }

  const issuer = normalizeAccessIssuer(env.ACCESS_TEAM_DOMAIN);
  const jwks = remoteJwksForIssuer(issuer);
  const result = await jwtVerify(jwt, jwks, {
    issuer,
    audience: env.ACCESS_AUD
  });

  return result.payload as AccessJwtPayload;
}

export async function requireAccessUser(
  request: Request,
  env: CloudflareEnv,
  verifier: AccessJwtVerifier = verifyAccessJwt
): Promise<AccessUser> {
  if (env.ENVIRONMENT === "local") {
    const localEmail = request.headers.get("x-expense-me-local-user")?.trim();
    if (localEmail && isLoopbackHostname(new URL(request.url).hostname) && isAllowedEmail(localEmail, env)) {
      return { id: `local:${localEmail}`, email: localEmail };
    }
  }

  const jwt = accessJwtFromRequest(request);
  if (!jwt) {
    throw new Response("Unauthorized", { status: 401 });
  }

  let payload: AccessJwtPayload;
  try {
    payload = await verifier(jwt, env);
  } catch {
    throw new Response("Unauthorized", { status: 401 });
  }

  if (!payload.email || !payload.sub) {
    throw new Response("Unauthorized", { status: 401 });
  }

  if (!isAllowedEmail(payload.email, env)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name
  };
}
