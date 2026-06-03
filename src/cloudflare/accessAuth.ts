import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AccessUser, CloudflareEnv } from "./types";

export interface AccessJwtPayload {
  sub?: string;
  email?: string;
  name?: string;
}

export type AccessJwtVerifier = (jwt: string, env: CloudflareEnv) => Promise<AccessJwtPayload>;

function accessJwtFromRequest(request: Request) {
  return request.headers.get("CF-Access-Jwt-Assertion") || request.headers.get("cf-access-jwt-assertion") || "";
}

export function normalizeAccessIssuer(teamDomain: string) {
  return teamDomain.replace(/\/$/, "");
}

export async function verifyAccessJwt(jwt: string, env: CloudflareEnv): Promise<AccessJwtPayload> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new Error("Cloudflare Access is not configured.");
  }

  const issuer = normalizeAccessIssuer(env.ACCESS_TEAM_DOMAIN);
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
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
    const localEmail = request.headers.get("x-expense-me-local-user");
    if (localEmail) {
      return { id: `local:${localEmail}`, email: localEmail };
    }
  }

  const jwt = accessJwtFromRequest(request);
  if (!jwt) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const payload = await verifier(jwt, env);
  if (!payload.email || !payload.sub) {
    throw new Response("Unauthorized", { status: 401 });
  }

  if (env.ACCESS_ALLOWED_EMAIL && payload.email.toLowerCase() !== env.ACCESS_ALLOWED_EMAIL.toLowerCase()) {
    throw new Response("Forbidden", { status: 403 });
  }

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name
  };
}
