import { describe, expect, it, vi } from "vitest";
import { artifactObjectKey, dataUrlToBytes, loadArtifactDataUrl, storeArtifactData } from "../../src/cloudflare/artifactStore";
import { D1ExpenseMeRepository } from "../../src/cloudflare/d1Repository";
import type { CloudflareEnv, WorkspaceContext } from "../../src/cloudflare/types";
import type { ReceiptArtifact } from "../../src/domain/types";
import { seedArtifacts, seedExpenses, seedReports, seedStatementCharges } from "../fixtures";

function statement(options: {
  first?: unknown;
  all?: unknown[];
  run?: unknown;
  onBind?: (...values: unknown[]) => void;
} = {}) {
  return {
    bind: vi.fn(function bind(this: unknown, ...values: unknown[]) {
      options.onBind?.(...values);
      return this;
    }),
    run: vi.fn().mockResolvedValue(options.run ?? { success: true }),
    first: vi.fn().mockResolvedValue(options.first ?? null),
    all: vi.fn().mockResolvedValue({ results: options.all ?? [] })
  };
}

function createDb(prepare: (sql: string) => ReturnType<typeof statement>) {
  return { prepare: vi.fn(prepare) };
}

function context(): WorkspaceContext {
  return {
    workspaceId: "workspace-personal",
    user: { id: "user-1", email: "thiago@example.com" }
  };
}

function encodedRow(value: unknown) {
  return { payload_json: JSON.stringify(value) };
}

describe("D1 Expense Me repository", () => {
  it("creates or returns the personal workspace and prepares the expected user insert SQL", async () => {
    const db = createDb((sql) => statement({ first: sql.includes("SELECT id FROM users") ? { id: "user-1" } : null }));
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    const workspace = await repo.getOrCreateWorkspace({ id: "access-user", email: "thiago@example.com", name: "Thiago" });

    expect(workspace).toEqual({
      workspaceId: "workspace-personal",
      user: { id: "user-1", email: "thiago@example.com", name: "Thiago" }
    });
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR IGNORE INTO users"));
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR IGNORE INTO workspaces"));
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR IGNORE INTO workspace_members"));
  });

  it("decodes listed payload rows into a normalized cloud snapshot", async () => {
    const db = createDb((sql) => {
      if (sql.includes("FROM expenses")) return statement({ all: [encodedRow(seedExpenses[0])] });
      if (sql.includes("FROM expense_folders")) return statement({ all: [encodedRow(seedReports[0])] });
      if (sql.includes("FROM receipt_artifacts")) return statement({ all: [encodedRow(seedArtifacts[0])] });
      if (sql.includes("FROM statement_charges")) return statement({ all: [encodedRow(seedStatementCharges[0])] });
      if (sql.includes("FROM export_packages")) return statement({ all: [] });
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    const snapshot = await repo.getSnapshot(context());

    expect(snapshot.workspaceId).toBe("workspace-personal");
    expect(snapshot.userEmail).toBe("thiago@example.com");
    expect(snapshot.expenses).toHaveLength(1);
    expect(snapshot.expenses[0]).toMatchObject({ id: seedExpenses[0].id, reportId: seedReports[0].id });
    expect(snapshot.reports[0]).toMatchObject({ id: seedReports[0].id, expenseIds: [seedExpenses[0].id] });
    expect(snapshot.receiptArtifacts).toEqual([seedArtifacts[0]]);
    expect(snapshot.statementCharges).toEqual([seedStatementCharges[0]]);
    expect(snapshot.exportPackages).toEqual([]);
  });

  it("strips receipt artifact dataUrl before storing payload_json", async () => {
    let payloadJson = "";
    const db = createDb((sql) => {
      if (sql.includes("INSERT INTO receipt_artifacts")) {
        return statement({
          onBind: (_id, _workspaceId, payload) => {
            payloadJson = String(payload);
          }
        });
      }
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);
    const artifact: ReceiptArtifact = {
      ...seedArtifacts[0],
      dataUrl: "data:image/png;base64,SGVsbG8="
    };

    await repo.upsertReceiptArtifact(context(), artifact);

    expect(JSON.parse(payloadJson)).toEqual(expect.objectContaining({ id: artifact.id, storageKey: artifact.storageKey }));
    expect(JSON.parse(payloadJson)).not.toHaveProperty("dataUrl");
  });
});

describe("artifact store", () => {
  it("extracts bytes and MIME type from a data URL", () => {
    const { bytes, mimeType } = dataUrlToBytes("data:text/plain;base64,SGVsbG8=");

    expect(mimeType).toBe("text/plain");
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });

  it("writes artifact data to R2 using the workspace artifact key and returns the key", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const env = { EXPENSE_ME_ARTIFACTS: { put } } as unknown as CloudflareEnv;
    const artifact: ReceiptArtifact = {
      ...seedArtifacts[0],
      storageKey: "",
      dataUrl: "data:text/plain;base64,SGVsbG8=",
      mimeType: "text/plain"
    };

    const key = await storeArtifactData(env, context(), artifact);

    expect(key).toBe(artifactObjectKey(context(), artifact));
    expect(put).toHaveBeenCalledWith(key, expect.any(Uint8Array), {
      httpMetadata: { contentType: "text/plain" }
    });
    expect(Array.from(put.mock.calls[0][1] as Uint8Array)).toEqual([72, 101, 108, 108, 111]);
  });

  it("rebuilds a data URL from an R2 object", async () => {
    const get = vi.fn().mockResolvedValue({
      arrayBuffer: async () => new Uint8Array([72, 101, 108, 108, 111]).buffer
    });
    const env = { EXPENSE_ME_ARTIFACTS: { get } } as unknown as CloudflareEnv;
    const artifact: ReceiptArtifact = {
      ...seedArtifacts[0],
      mimeType: "text/plain",
      storageKey: "workspace-personal/artifacts/artifact-1"
    };

    await expect(loadArtifactDataUrl(env, artifact)).resolves.toBe("data:text/plain;base64,SGVsbG8=");
    expect(get).toHaveBeenCalledWith("workspace-personal/artifacts/artifact-1");
  });
});
