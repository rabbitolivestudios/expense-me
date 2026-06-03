import { describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "../../src/cloudflare/apiRouter";
import { VersionConflictError } from "../../src/cloudflare/d1Repository";
import type { CloudSnapshot, CloudflareEnv, WorkspaceContext } from "../../src/cloudflare/types";
import { seedExpenses } from "../fixtures";

const env = {
  ENVIRONMENT: "local",
  ACCESS_ALLOWED_EMAIL: "thiago@example.com"
} as CloudflareEnv;

const context: WorkspaceContext = {
  workspaceId: "workspace-personal",
  user: { id: "local:thiago@example.com", email: "thiago@example.com" }
};

const snapshot: CloudSnapshot = {
  workspaceId: "workspace-personal",
  userEmail: "thiago@example.com",
  expenses: [seedExpenses[0]],
  reports: [],
  receiptArtifacts: [],
  statementCharges: [],
  exportPackages: [],
  recordVersions: {
    expenses: { [seedExpenses[0].id]: 3 },
    reports: {},
    receiptArtifacts: {},
    statementCharges: {},
    exportPackages: {}
  }
};

function repositoryStub() {
  return {
    getOrCreateWorkspace: vi.fn().mockResolvedValue(context),
    getSnapshot: vi.fn().mockResolvedValue(snapshot),
    upsertExpense: vi.fn().mockResolvedValue({ snapshot }),
    deleteExpense: vi.fn().mockResolvedValue({ snapshot })
  };
}

function localRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-expense-me-local-user", "thiago@example.com");
  return new Request(`http://localhost${path}`, { ...init, headers });
}

async function jsonBody(response: Response) {
  return (await response.json()) as unknown;
}

describe("cloud API router", () => {
  it("returns 401 for unauthenticated bootstrap requests", async () => {
    const response = await handleApiRequest(new Request("https://expense.mac-tbo.com/api/bootstrap"), env);

    expect(response.status).toBe(401);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Unauthorized." });
  });

  it("returns the bootstrap snapshot for an authenticated local user", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(localRequest("/api/bootstrap"), env, { repository: repository as never });

    expect(response.status).toBe(200);
    await expect(jsonBody(response)).resolves.toEqual({ snapshot });
    expect(repository.getOrCreateWorkspace).toHaveBeenCalledWith({
      id: "local:thiago@example.com",
      email: "thiago@example.com"
    });
    expect(repository.getSnapshot).toHaveBeenCalledWith(context);
  });

  it("rejects local auth on a non-loopback host", async () => {
    const response = await handleApiRequest(
      new Request("https://expense.mac-tbo.com/api/bootstrap", {
        headers: { "x-expense-me-local-user": "thiago@example.com" }
      }),
      env
    );

    expect(response.status).toBe(401);
  });

  it("passes expectedVersion to expense upserts and returns the mutation snapshot", async () => {
    const repository = repositoryStub();
    const body = { expense: seedExpenses[0], expectedVersion: 3 };

    const response = await handleApiRequest(
      localRequest("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    await expect(jsonBody(response)).resolves.toEqual({ snapshot });
    expect(repository.upsertExpense).toHaveBeenCalledWith(context, seedExpenses[0], { expectedVersion: 3 });
  });

  it("decodes expense IDs and passes expectedVersion to expense deletes", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      localRequest(`/api/expenses/${encodeURIComponent("expense/with space")}?expectedVersion=7`, { method: "DELETE" }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    await expect(jsonBody(response)).resolves.toEqual({ snapshot });
    expect(repository.deleteExpense).toHaveBeenCalledWith(context, "expense/with space", { expectedVersion: 7 });
  });

  it("maps version conflicts to 409 with the public message", async () => {
    const repository = repositoryStub();
    repository.upsertExpense.mockRejectedValue(new VersionConflictError());

    const response = await handleApiRequest(
      localRequest("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expense: seedExpenses[0], expectedVersion: 1 })
      }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(409);
    await expect(jsonBody(response)).resolves.toEqual({ error: "The cloud record changed. Refresh and try again." });
  });

  it("returns 404 for unknown authenticated API routes", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(localRequest("/api/unknown"), env, { repository: repository as never });

    expect(response.status).toBe(404);
    await expect(jsonBody(response)).resolves.toEqual({ error: "API route not found." });
  });
});
