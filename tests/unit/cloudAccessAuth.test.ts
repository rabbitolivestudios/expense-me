import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { normalizeAccessIssuer, requireAccessUser, verifyAccessJwt } from "../../src/cloudflare/accessAuth";
import type { CloudflareEnv } from "../../src/cloudflare/types";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => async () => undefined),
  jwtVerify: vi.fn()
}));

const env = {
  ACCESS_ALLOWED_EMAIL: "thiago@example.com"
} as CloudflareEnv;

describe("Cloudflare Access auth", () => {
  beforeEach(() => {
    vi.mocked(createRemoteJWKSet).mockClear();
    vi.mocked(jwtVerify).mockReset();
  });

  it("rejects requests without an Access JWT", async () => {
    await expect(
      requireAccessUser(
        new Request("https://expense.mac-tbo.com/api/bootstrap"),
        env,
        async () => ({ sub: "user-1", email: "thiago@example.com" })
      )
    ).rejects.toMatchObject({ status: 401 });
  });

  it("accepts the allowed user from a verified JWT", async () => {
    const request = new Request("https://expense.mac-tbo.com/api/bootstrap", {
      headers: { "CF-Access-Jwt-Assertion": "jwt" }
    });

    await expect(
      requireAccessUser(request, env, async () => ({
        sub: "user-1",
        email: "thiago@example.com",
        name: "Thiago"
      }))
    ).resolves.toEqual({
      id: "user-1",
      email: "thiago@example.com",
      name: "Thiago"
    });
  });

  it("rejects a different verified email", async () => {
    const request = new Request("https://expense.mac-tbo.com/api/bootstrap", {
      headers: { "CF-Access-Jwt-Assertion": "jwt" }
    });

    await expect(
      requireAccessUser(request, env, async () => ({ sub: "user-2", email: "other@example.com" }))
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects verified Access users when ACCESS_ALLOWED_EMAIL is unset", async () => {
    const request = new Request("https://expense.mac-tbo.com/api/bootstrap", {
      headers: { "CF-Access-Jwt-Assertion": "jwt" }
    });

    await expect(
      requireAccessUser(request, {} as CloudflareEnv, async () => ({ sub: "user-1", email: "thiago@example.com" }))
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows explicit local test identity only in local mode", async () => {
    const request = new Request("http://localhost/api/bootstrap", {
      headers: { "x-expense-me-local-user": " thiago@example.com " }
    });

    await expect(requireAccessUser(request, { ...env, ENVIRONMENT: "local" } as CloudflareEnv)).resolves.toEqual({
      id: "local:thiago@example.com",
      email: "thiago@example.com"
    });

    await expect(requireAccessUser(request, { ...env, ENVIRONMENT: "production" } as CloudflareEnv)).rejects.toMatchObject({
      status: 401
    });
  });

  it("does not allow local test identity on non-loopback hosts", async () => {
    const request = new Request("https://expense.mac-tbo.com/api/bootstrap", {
      headers: { "x-expense-me-local-user": "thiago@example.com" }
    });

    await expect(requireAccessUser(request, { ...env, ENVIRONMENT: "local" } as CloudflareEnv)).rejects.toMatchObject({
      status: 401
    });
  });

  it("does not allow local test identity for a disallowed email", async () => {
    const request = new Request("http://127.0.0.1/api/bootstrap", {
      headers: { "x-expense-me-local-user": "other@example.com" }
    });

    await expect(requireAccessUser(request, { ...env, ENVIRONMENT: "local" } as CloudflareEnv)).rejects.toMatchObject({
      status: 401
    });
  });

  it("does not allow local test identity when ACCESS_ALLOWED_EMAIL is unset", async () => {
    const request = new Request("http://localhost/api/bootstrap", {
      headers: { "x-expense-me-local-user": "thiago@example.com" }
    });

    await expect(requireAccessUser(request, { ENVIRONMENT: "local" } as CloudflareEnv)).rejects.toMatchObject({
      status: 401
    });
  });

  it("maps verifier rejection to unauthorized", async () => {
    const request = new Request("https://expense.mac-tbo.com/api/bootstrap", {
      headers: { "CF-Access-Jwt-Assertion": "jwt" }
    });

    await expect(requireAccessUser(request, env, async () => {
      throw new Error("expired JWT");
    })).rejects.toMatchObject({ status: 401 });
  });

  it("uses the normalized issuer certs URL and JWT verification options", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: "user-1", email: "thiago@example.com" },
      protectedHeader: { alg: "RS256" },
      key: new Uint8Array()
    });

    const accessEnv = {
      ACCESS_TEAM_DOMAIN: "https://expense.cloudflareaccess.com/",
      ACCESS_AUD: "audience-1"
    } as CloudflareEnv;

    await expect(verifyAccessJwt("jwt", accessEnv)).resolves.toEqual({
      sub: "user-1",
      email: "thiago@example.com"
    });
    await verifyAccessJwt("jwt-2", accessEnv);

    expect(vi.mocked(createRemoteJWKSet)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createRemoteJWKSet).mock.calls[0][0].toString()).toBe(
      "https://expense.cloudflareaccess.com/cdn-cgi/access/certs"
    );
    expect(vi.mocked(jwtVerify).mock.calls[0][2]).toEqual({
      issuer: "https://expense.cloudflareaccess.com",
      audience: "audience-1"
    });
  });

  it("normalizes ACCESS_TEAM_DOMAIN by removing a trailing slash", () => {
    expect(normalizeAccessIssuer("https://expense.cloudflareaccess.com/")).toBe("https://expense.cloudflareaccess.com");
  });
});
