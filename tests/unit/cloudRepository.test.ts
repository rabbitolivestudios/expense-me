import { describe, expect, it, vi } from "vitest";
import { artifactObjectKey, dataUrlToBytes, loadArtifactDataUrl, storeArtifactData } from "../../src/cloudflare/artifactStore";
import { D1ExpenseMeRepository, NonEmptyExpenseFolderError, VersionConflictError } from "../../src/cloudflare/d1Repository";
import type { CloudflareEnv, WorkspaceContext } from "../../src/cloudflare/types";
import type { ExportPackage, ReceiptArtifact } from "../../src/domain/types";
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

function encodedRow(value: unknown, version = 1) {
  return { payload_json: JSON.stringify(value), version };
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
    const exportPackage: ExportPackage = {
      id: "export-package-1",
      reportId: seedReports[0].id,
      generatedAt: "2026-06-03T18:00:00.000Z",
      reviewPdfName: "review-report.pdf",
      spreadsheetName: "expense-entry.csv",
      receiptsZipName: "receipts.zip",
      declarationPdfNames: ["missing-receipt-declaration.pdf"],
      reconciliationNotesName: "reconciliation-notes.txt"
    };
    const db = createDb((sql) => {
      if (sql.includes("FROM expenses")) return statement({ all: [encodedRow(seedExpenses[0], 2)] });
      if (sql.includes("FROM expense_folders")) return statement({ all: [encodedRow(seedReports[0], 3)] });
      if (sql.includes("FROM receipt_artifacts")) return statement({ all: [encodedRow(seedArtifacts[0], 4)] });
      if (sql.includes("FROM statement_charges")) return statement({ all: [encodedRow(seedStatementCharges[0], 5)] });
      if (sql.includes("FROM export_packages")) return statement({ all: [encodedRow(exportPackage, 6)] });
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
    expect(snapshot.exportPackages).toEqual([exportPackage]);
    expect(snapshot.recordVersions).toEqual({
      expenses: { [seedExpenses[0].id]: 2 },
      reports: { [seedReports[0].id]: 3 },
      receiptArtifacts: { [seedArtifacts[0].id]: 4 },
      statementCharges: { [seedStatementCharges[0].id]: 5 },
      exportPackages: { [exportPackage.id]: 6 }
    });
  });

  it("strips receipt artifact dataUrl before storing payload_json", async () => {
    let payloadJson = "";
    const db = createDb((sql) => {
      if (sql.includes("INSERT OR IGNORE INTO receipt_artifacts")) {
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
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });

  it("upserts expenses and returns a refreshed snapshot", async () => {
    let payloadJson = "";
    const db = createDb((sql) => {
      if (sql.includes("INSERT OR IGNORE INTO expenses")) {
        return statement({
          onBind: (_id, _workspaceId, _reportId, payload) => {
            payloadJson = String(payload);
          }
        });
      }
      if (sql.includes("FROM expenses")) return statement({ all: [encodedRow(seedExpenses[0])] });
      if (sql.includes("FROM expense_folders")) return statement({ all: [encodedRow(seedReports[0])] });
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    const result = await repo.upsertExpense(context(), seedExpenses[0]);

    expect(JSON.parse(payloadJson)).toMatchObject({ id: seedExpenses[0].id, sourceType: seedExpenses[0].sourceType });
    expect(result.snapshot.expenses).toHaveLength(1);
    expect(result.snapshot.expenses[0].id).toBe(seedExpenses[0].id);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR IGNORE INTO expenses"));
  });

  it("updates existing expenses only when the expected version matches", async () => {
    let updateBindValues: unknown[] = [];
    const db = createDb((sql) => {
      if (sql.includes("SELECT version FROM expenses")) return statement({ first: { version: 2 } });
      if (sql.includes("UPDATE expenses")) {
        return statement({
          run: { success: true, meta: { changes: 1 } },
          onBind: (...values) => {
            updateBindValues = values;
          }
        });
      }
      if (sql.includes("FROM expenses")) return statement({ all: [encodedRow(seedExpenses[0])] });
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    const result = await repo.upsertExpense(context(), seedExpenses[0], { expectedVersion: 2 });

    expect(updateBindValues.slice(-3)).toEqual(["workspace-personal", seedExpenses[0].id, 2]);
    expect(result.snapshot.expenses[0].id).toBe(seedExpenses[0].id);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE expenses"));
  });

  it("rejects stale expense updates before overwriting cloud data", async () => {
    const db = createDb((sql) => {
      if (sql.includes("SELECT version FROM expenses")) return statement({ first: { version: 2 } });
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    await expect(repo.upsertExpense(context(), seedExpenses[0], { expectedVersion: 1 })).rejects.toBeInstanceOf(
      VersionConflictError
    );
    expect(db.prepare).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE expenses"));
  });

  it("rejects stale expense saves when the cloud row was already deleted", async () => {
    const db = createDb((sql) => {
      if (sql.includes("SELECT version FROM expenses")) return statement({ first: null });
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    await expect(repo.upsertExpense(context(), seedExpenses[0], { expectedVersion: 2 })).rejects.toBeInstanceOf(
      VersionConflictError
    );
    expect(db.prepare).not.toHaveBeenCalledWith(expect.stringContaining("INSERT OR IGNORE INTO expenses"));
  });

  it("rejects concurrent expense updates when the guarded write applies no rows", async () => {
    const db = createDb((sql) => {
      if (sql.includes("SELECT version FROM expenses")) return statement({ first: { version: 2 } });
      if (sql.includes("UPDATE expenses")) return statement({ run: { success: true, meta: { changes: 0 } } });
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    await expect(repo.upsertExpense(context(), seedExpenses[0], { expectedVersion: 2 })).rejects.toBeInstanceOf(
      VersionConflictError
    );
  });

  it("deletes expenses inside the workspace and returns a refreshed snapshot", async () => {
    let deleteBindValues: unknown[] = [];
    const db = createDb((sql) => {
      if (sql.includes("SELECT version FROM expenses")) return statement({ first: { version: 4 } });
      if (sql.includes("DELETE FROM expenses")) {
        return statement({
          onBind: (...values) => {
            deleteBindValues = values;
          }
        });
      }
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    const result = await repo.deleteExpense(context(), "expense-1", { expectedVersion: 4 });

    expect(deleteBindValues).toEqual(["workspace-personal", "expense-1", 4]);
    expect(result.snapshot.workspaceId).toBe("workspace-personal");
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM expenses"));
  });

  it("upserts expense folders and returns a refreshed snapshot", async () => {
    let payloadJson = "";
    const db = createDb((sql) => {
      if (sql.includes("INSERT OR IGNORE INTO expense_folders")) {
        return statement({
          onBind: (_id, _workspaceId, payload) => {
            payloadJson = String(payload);
          }
        });
      }
      if (sql.includes("FROM expense_folders")) return statement({ all: [encodedRow(seedReports[0])] });
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    const result = await repo.upsertExpenseFolder(context(), seedReports[0]);

    expect(JSON.parse(payloadJson)).toMatchObject({ id: seedReports[0].id, name: seedReports[0].name });
    expect(result.snapshot.reports.some((report) => report.id === seedReports[0].id)).toBe(true);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR IGNORE INTO expense_folders"));
  });

  it("deletes expense folders inside the workspace and returns a refreshed snapshot", async () => {
    let deleteBindValues: unknown[] = [];
    const db = createDb((sql) => {
      if (sql.includes("SELECT COUNT(*) AS count")) return statement({ first: { count: 0 } });
      if (sql.includes("SELECT version FROM expense_folders")) return statement({ first: { version: 3 } });
      if (sql.includes("DELETE FROM expense_folders")) {
        return statement({
          onBind: (...values) => {
            deleteBindValues = values;
          }
        });
      }
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    const result = await repo.deleteExpenseFolder(context(), "report-1", { expectedVersion: 3 });

    expect(deleteBindValues).toEqual(["workspace-personal", "report-1", 3]);
    expect(result.snapshot.workspaceId).toBe("workspace-personal");
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM expense_folders"));
  });

  it("rejects deleting non-empty expense folders", async () => {
    const db = createDb((sql) => {
      if (sql.includes("SELECT COUNT(*) AS count")) return statement({ first: { count: 1 } });
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    await expect(repo.deleteExpenseFolder(context(), "report-with-expenses", { expectedVersion: 1 })).rejects.toBeInstanceOf(
      NonEmptyExpenseFolderError
    );
    expect(db.prepare).not.toHaveBeenCalledWith(expect.stringContaining("DELETE FROM expense_folders"));
  });

  it("upserts statement charges without refreshing the snapshot", async () => {
    let payloadJson = "";
    const db = createDb((sql) => {
      if (sql.includes("INSERT OR IGNORE INTO statement_charges")) {
        return statement({
          onBind: (_id, _workspaceId, payload) => {
            payloadJson = String(payload);
          }
        });
      }
      return statement();
    });
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    await expect(repo.upsertStatementCharge(context(), seedStatementCharges[0])).resolves.toBeUndefined();

    expect(JSON.parse(payloadJson)).toMatchObject({
      id: seedStatementCharges[0].id,
      matchStatus: seedStatementCharges[0].matchStatus
    });
    expect(db.prepare).toHaveBeenCalledTimes(2);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR IGNORE INTO statement_charges"));
  });

  it("replaces V1 snapshot tables with forced upserts during migration", async () => {
    const preparedSql: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        preparedSql.push(sql);
        return statement();
      }),
      batch: vi.fn().mockResolvedValue([])
    };
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);
    const cloudSnapshot = {
      workspaceId: "workspace-personal",
      userEmail: "thiago@example.com",
      expenses: [seedExpenses[0]],
      reports: [seedReports[0]],
      receiptArtifacts: [seedArtifacts[0]],
      statementCharges: [seedStatementCharges[0]],
      exportPackages: [],
      recordVersions: {
        expenses: { [seedExpenses[0].id]: 1 },
        reports: { [seedReports[0].id]: 1 },
        receiptArtifacts: { [seedArtifacts[0].id]: 1 },
        statementCharges: { [seedStatementCharges[0].id]: 1 },
        exportPackages: {}
      }
    };
    vi.spyOn(repo, "upsertExpenseFolder").mockResolvedValue({ snapshot: cloudSnapshot });
    vi.spyOn(repo, "upsertExpense").mockResolvedValue({ snapshot: cloudSnapshot });
    vi.spyOn(repo, "upsertReceiptArtifact").mockResolvedValue(undefined);
    vi.spyOn(repo, "upsertStatementCharge").mockResolvedValue(undefined);
    vi.spyOn(repo, "getSnapshot").mockResolvedValue(cloudSnapshot);

    const result = await repo.replaceFromMigration(context(), {
      expenses: [seedExpenses[0]],
      reports: [seedReports[0]],
      receiptArtifacts: [seedArtifacts[0]],
      statementCharges: [seedStatementCharges[0]]
    });

    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(preparedSql).toEqual([
      "DELETE FROM expenses WHERE workspace_id = ?",
      "DELETE FROM expense_folders WHERE workspace_id = ?",
      "DELETE FROM receipt_artifacts WHERE workspace_id = ?",
      "DELETE FROM statement_charges WHERE workspace_id = ?"
    ]);
    expect(preparedSql.some((sql) => sql.includes("export_packages"))).toBe(false);
    expect(repo.upsertExpenseFolder).toHaveBeenCalledWith(context(), seedReports[0], { force: true });
    expect(repo.upsertExpense).toHaveBeenCalledWith(context(), seedExpenses[0], { force: true });
    expect(repo.upsertReceiptArtifact).toHaveBeenCalledWith(context(), seedArtifacts[0], { force: true });
    expect(repo.upsertStatementCharge).toHaveBeenCalledWith(context(), seedStatementCharges[0], { force: true });
    expect(result).toEqual({ snapshot: cloudSnapshot });
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
