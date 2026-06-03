import { describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "../../src/cloudflare/apiRouter";
import type { CloudSnapshot, CloudflareEnv, WorkspaceContext } from "../../src/cloudflare/types";
import type { AppSnapshot } from "../../src/domain/types";
import { seedArtifacts, seedExpenses, seedReports, seedStatementCharges } from "../fixtures";

const env = {
  ENVIRONMENT: "local",
  ACCESS_ALLOWED_EMAIL: "thiago@example.com"
} as CloudflareEnv;

const context: WorkspaceContext = {
  workspaceId: "workspace-personal",
  user: { id: "local:thiago@example.com", email: "thiago@example.com" }
};

const localSnapshot: AppSnapshot = {
  expenses: [seedExpenses[0]],
  receiptArtifacts: [seedArtifacts[0]],
  reports: [seedReports[0]],
  statementCharges: [seedStatementCharges[0]]
};

const cloudSnapshot: CloudSnapshot = {
  workspaceId: "workspace-personal",
  userEmail: "thiago@example.com",
  ...localSnapshot,
  exportPackages: [],
  recordVersions: {
    expenses: { [seedExpenses[0].id]: 1 },
    reports: { [seedReports[0].id]: 1 },
    receiptArtifacts: { [seedArtifacts[0].id]: 1 },
    statementCharges: { [seedStatementCharges[0].id]: 1 },
    exportPackages: {}
  }
};

function repositoryStub() {
  return {
    getOrCreateWorkspace: vi.fn().mockResolvedValue(context),
    getSnapshot: vi.fn().mockResolvedValue(cloudSnapshot),
    upsertExpense: vi.fn().mockResolvedValue({ snapshot: cloudSnapshot }),
    deleteExpense: vi.fn().mockResolvedValue({ snapshot: cloudSnapshot }),
    replaceFromMigration: vi.fn().mockResolvedValue({ snapshot: cloudSnapshot })
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

describe("cloud local snapshot migration route", () => {
  it("authenticates and replaces the workspace from the posted local snapshot", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      localRequest("/api/migrate-local-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: localSnapshot })
      }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    await expect(jsonBody(response)).resolves.toEqual({ snapshot: cloudSnapshot });
    expect(repository.replaceFromMigration).toHaveBeenCalledWith(context, localSnapshot);
  });

  it("returns 401 for unauthenticated migration requests", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      new Request("https://expense.mac-tbo.com/api/migrate-local-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: localSnapshot })
      }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(401);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Unauthorized." });
    expect(repository.replaceFromMigration).not.toHaveBeenCalled();
  });
});
