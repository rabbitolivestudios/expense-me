import { describe, expect, it, vi } from "vitest";
import { CloudRepository } from "../../src/client/cloudRepository";
import type { AppSnapshot } from "../../src/domain/types";
import type { CloudSnapshot } from "../../src/cloudflare/types";
import { seedArtifacts, seedExpenses, seedReports, seedStatementCharges } from "../fixtures";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const snapshot: CloudSnapshot = {
  workspaceId: "workspace-personal",
  userEmail: "thiago@example.com",
  expenses: [seedExpenses[0]],
  receiptArtifacts: [seedArtifacts[0]],
  reports: [seedReports[0]],
  statementCharges: [seedStatementCharges[0]],
  exportPackages: [],
  recordVersions: {
    expenses: { [seedExpenses[0].id]: 4 },
    reports: { [seedReports[0].id]: 2 },
    receiptArtifacts: { [seedArtifacts[0].id]: 3 },
    statementCharges: { [seedStatementCharges[0].id]: 1 },
    exportPackages: {}
  }
};

const localSnapshot: AppSnapshot = {
  expenses: [seedExpenses[0]],
  receiptArtifacts: [seedArtifacts[0]],
  reports: [seedReports[0]],
  statementCharges: [seedStatementCharges[0]]
};

function mutationFetcher() {
  return vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ snapshot })));
}

function requestBody(init?: RequestInit) {
  return JSON.parse(String(init?.body)) as unknown;
}

describe("client CloudRepository", () => {
  it("uses the default browser fetch without rebinding it to the repository instance", async () => {
    const fetcher = vi.fn(function (this: unknown) {
      if (this instanceof CloudRepository) {
        throw new Error("fetch was called with the repository as this");
      }

      return Promise.resolve(jsonResponse({ snapshot }));
    });
    vi.stubGlobal("fetch", fetcher);
    const repository = new CloudRepository();

    await expect(repository.bootstrap()).resolves.toEqual(snapshot);

    expect(fetcher).toHaveBeenCalledWith("/api/bootstrap", undefined);
  });

  it("bootstrap calls /api/bootstrap and returns the cloud snapshot", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ snapshot }));
    const repository = new CloudRepository(fetcher);

    await expect(repository.bootstrap()).resolves.toEqual(snapshot);

    expect(fetcher).toHaveBeenCalledWith("/api/bootstrap");
  });

  it("throws the server error text from failed JSON responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: "The cloud record changed. Refresh and try again." }, 409));
    const repository = new CloudRepository(fetcher);

    await expect(repository.bootstrap()).rejects.toThrow("The cloud record changed. Refresh and try again.");
  });

  it("throws a generic status error when a failed response has no error text", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("not json", { status: 503 }));
    const repository = new CloudRepository(fetcher);

    await expect(repository.syncEmail()).rejects.toThrow("Request failed: 503");
  });

  it("migrateLocalSnapshot posts the local snapshot to the migration endpoint", async () => {
    const fetcher = mutationFetcher();
    const repository = new CloudRepository(fetcher);

    await expect(repository.migrateLocalSnapshot(localSnapshot)).resolves.toEqual(snapshot);

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/migrate-local-snapshot");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(requestBody(init)).toEqual({ snapshot: localSnapshot });
  });

  it("saveExpense sends expense, artifacts, and expectedVersion", async () => {
    const fetcher = mutationFetcher();
    const repository = new CloudRepository(fetcher);

    await expect(repository.saveExpense(seedExpenses[0], [seedArtifacts[0]], 4)).resolves.toEqual(snapshot);

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/expenses");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(requestBody(init)).toEqual({
      expense: seedExpenses[0],
      artifacts: [seedArtifacts[0]],
      expectedVersion: 4
    });
  });

  it("deleteExpense URL-encodes the id and expectedVersion", async () => {
    const fetcher = mutationFetcher();
    const repository = new CloudRepository(fetcher);

    await expect(repository.deleteExpense("expense/with space", 7)).resolves.toEqual(snapshot);

    expect(fetcher).toHaveBeenCalledWith("/api/expenses/expense%2Fwith%20space?expectedVersion=7", { method: "DELETE" });
  });

  it("saveExpenseFolder and deleteExpenseFolder use the expense folder routes", async () => {
    const fetcher = mutationFetcher();
    const repository = new CloudRepository(fetcher);

    await expect(repository.saveExpenseFolder(seedReports[0], 2)).resolves.toEqual(snapshot);
    await expect(repository.deleteExpenseFolder("folder/with space", 5)).resolves.toEqual(snapshot);

    const [saveUrl, saveInit] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(saveUrl).toBe("/api/expense-folders");
    expect(saveInit.method).toBe("POST");
    expect(saveInit.headers).toEqual({ "Content-Type": "application/json" });
    expect(requestBody(saveInit)).toEqual({ report: seedReports[0], expectedVersion: 2 });
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/expense-folders/folder%2Fwith%20space?expectedVersion=5",
      { method: "DELETE" }
    );
  });

  it("importStatementCharges posts charges to the statement import route", async () => {
    const fetcher = mutationFetcher();
    const repository = new CloudRepository(fetcher);

    await expect(repository.importStatementCharges([seedStatementCharges[0]])).resolves.toEqual(snapshot);

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/statements/import");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(requestBody(init)).toEqual({ charges: [seedStatementCharges[0]] });
  });

  it("importStatementCharges includes the target Expense Folder when provided", async () => {
    const fetcher = mutationFetcher();
    const repository = new CloudRepository(fetcher);

    await expect(repository.importStatementCharges([seedStatementCharges[0]], "report-active")).resolves.toEqual(snapshot);

    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(requestBody(init)).toEqual({ charges: [seedStatementCharges[0]], reportId: "report-active" });
  });

  it("createExportPackage returns the cloud Export Package download contract", async () => {
    const result = {
      exportPackage: {
        id: "export-package-1",
        reportId: seedReports[0].id,
        generatedAt: "2026-06-03T18:00:00.000Z",
        reviewPdfName: "review.txt",
        spreadsheetName: "entry.csv",
        receiptsZipName: "receipts.zip",
        declarationPdfNames: [],
        reconciliationNotesName: "reconciliation.txt"
      },
      downloadUrl: "/api/export-packages/export-package-1/download"
    };
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(result));
    const repository = new CloudRepository(fetcher);

    await expect(repository.createExportPackage(seedReports[0].id, {
      employeeName: "Thiago Oliveira",
      reportReference: "EXP-1"
    })).resolves.toEqual(result);

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/export-packages");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(requestBody(init)).toEqual({
      reportId: seedReports[0].id,
      employeeName: "Thiago Oliveira",
      reportReference: "EXP-1"
    });
  });

  it("syncEmail calls the POST email sync route", async () => {
    const fetcher = mutationFetcher();
    const repository = new CloudRepository(fetcher);

    await expect(repository.syncEmail()).resolves.toEqual(snapshot);

    expect(fetcher).toHaveBeenCalledWith("/api/email/sync", { method: "POST" });
  });

  it("syncEmail includes the target Expense Folder when provided", async () => {
    const fetcher = mutationFetcher();
    const repository = new CloudRepository(fetcher);

    await expect(repository.syncEmail("report-active")).resolves.toEqual(snapshot);

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/email/sync");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(requestBody(init)).toEqual({ reportId: "report-active" });
  });
});
