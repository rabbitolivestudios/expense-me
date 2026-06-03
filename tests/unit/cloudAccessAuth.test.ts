import { describe, expect, it } from "vitest";
import { normalizeAccessIssuer, requireAccessUser } from "../../src/cloudflare/accessAuth";
import type { CloudflareEnv } from "../../src/cloudflare/types";

const env = {
  ACCESS_ALLOWED_EMAIL: "thiago@example.com"
} as CloudflareEnv;

describe("Cloudflare Access auth", () => {
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

  it("allows explicit local test identity only in local mode", async () => {
    const request = new Request("http://localhost/api/bootstrap", {
      headers: { "x-expense-me-local-user": "thiago@example.com" }
    });

    await expect(requireAccessUser(request, { ...env, ENVIRONMENT: "local" } as CloudflareEnv)).resolves.toEqual({
      id: "local:thiago@example.com",
      email: "thiago@example.com"
    });

    await expect(requireAccessUser(request, { ...env, ENVIRONMENT: "production" } as CloudflareEnv)).rejects.toMatchObject({
      status: 401
    });
  });

  it("normalizes ACCESS_TEAM_DOMAIN by removing a trailing slash", () => {
    expect(normalizeAccessIssuer("https://expense.cloudflareaccess.com/")).toBe("https://expense.cloudflareaccess.com");
  });
});
