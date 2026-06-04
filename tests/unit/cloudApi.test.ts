import { afterEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "../../src/cloudflare/apiRouter";
import { ExportPackageNotFoundError, VersionConflictError } from "../../src/cloudflare/d1Repository";
import type { CloudSnapshot, CloudflareEnv, WorkspaceContext } from "../../src/cloudflare/types";
import { seedExpenses, seedReports, seedStatementCharges } from "../fixtures";

const env = {
  ENVIRONMENT: "local",
  ACCESS_ALLOWED_EMAIL: "thiago@example.com"
} as CloudflareEnv;

const context: WorkspaceContext = {
  workspaceId: "workspace-personal",
  user: { id: "local:thiago@example.com", email: "thiago@example.com" }
};
const testWebhookSecret = ["whsec", btoa("test-secret")].join("_");

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
    deleteExpense: vi.fn().mockResolvedValue({ snapshot }),
    upsertExpenseFolder: vi.fn().mockResolvedValue({ snapshot }),
    deleteExpenseFolder: vi.fn().mockResolvedValue({ snapshot }),
    upsertReceiptArtifact: vi.fn().mockResolvedValue({ snapshot }),
    addExpensesToFolder: vi.fn().mockResolvedValue(undefined),
    importStatementCharges: vi.fn().mockResolvedValue({ snapshot }),
    createExportPackage: vi.fn().mockResolvedValue({
      exportPackage: {
        id: "export-package-1",
        reportId: "report-1",
        generatedAt: "2026-06-03T18:00:00.000Z",
        reviewPdfName: "Chicago Training - May 2026-expense-index.pdf",
        spreadsheetName: "Chicago Training - May 2026-entry-spreadsheet.csv",
        receiptsZipName: "receipts.zip",
        declarationPdfNames: [],
        reconciliationNotesName: "reconciliation.txt"
      },
      objectKey: "workspace-personal/export-packages/export-package-1.zip"
    }),
    getExportPackageDownload: vi.fn().mockResolvedValue({
      exportPackage: {
        id: "export-package-1",
        reportId: "report-1",
        generatedAt: "2026-06-03T18:00:00.000Z",
        reviewPdfName: "Chicago Training - May 2026-expense-index.pdf",
        spreadsheetName: "Chicago Training - May 2026-entry-spreadsheet.csv",
        receiptsZipName: "receipts.zip",
        declarationPdfNames: [],
        reconciliationNotesName: "reconciliation.txt"
      },
      object: {
        httpMetadata: { contentType: "application/zip" },
        arrayBuffer: async () => new Uint8Array([80, 75]).buffer
      }
    }),
    recordSyncRun: vi.fn().mockResolvedValue(undefined)
  };
}

function localRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-expense-me-local-user", "thiago@example.com");
  return new Request(`http://localhost${path}`, { ...init, headers });
}

function mockJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function jsonBody(response: Response) {
  return (await response.json()) as unknown;
}

function base64ToBytes(value: string) {
  const binary = atob(value);
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

async function svixSignature(secret: string, id: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return `v1,${bytesToBase64(signature)}`;
}

async function agentMailWebhookRequest(payload: unknown, options: { signature?: string; timestamp?: string } = {}) {
  const body = JSON.stringify(payload);
  const id = "msg_webhook_1";
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const signature = options.signature ?? await svixSignature(testWebhookSecret, id, timestamp, body);

  return new Request("https://expense.mac-tbo.com/api/agentmail/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature
    },
    body
  });
}

describe("cloud API router", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it("stores receipt artifacts before saving an expense", async () => {
    const repository = repositoryStub();
    const body = { expense: seedExpenses[0], artifacts: [{ id: "artifact-1", mimeType: "text/plain" }], expectedVersion: 3 };

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
    expect(repository.upsertReceiptArtifact).toHaveBeenCalledWith(context, body.artifacts[0], {});
    expect(repository.upsertExpense).toHaveBeenCalledWith(context, seedExpenses[0], { expectedVersion: 3 });
  });

  it("returns 400 for malformed JSON request bodies", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      localRequest("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
      }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(400);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Request body must be valid JSON." });
    expect(repository.upsertExpense).not.toHaveBeenCalled();
  });

  it("returns 400 when an expense mutation is missing the Expense payload", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      localRequest("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(400);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Expense is required." });
    expect(repository.upsertExpense).not.toHaveBeenCalled();
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

  it("saves and deletes Expense Folders through product-term routes", async () => {
    const repository = repositoryStub();

    const saveResponse = await handleApiRequest(
      localRequest("/api/expense-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: seedReports[0], expectedVersion: 2 })
      }),
      env,
      { repository: repository as never }
    );
    const deleteResponse = await handleApiRequest(
      localRequest("/api/expense-folders/report%2F1?expectedVersion=2", { method: "DELETE" }),
      env,
      { repository: repository as never }
    );

    expect(saveResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(repository.upsertExpenseFolder).toHaveBeenCalledWith(
      context,
      seedReports[0],
      { expectedVersion: 2 }
    );
    expect(repository.deleteExpenseFolder).toHaveBeenCalledWith(context, "report/1", { expectedVersion: 2 });
  });

  it("imports statement charges through the cloud route", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      localRequest("/api/statements/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charges: [seedStatementCharges[0]], reportId: "report-active" })
      }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    expect(repository.importStatementCharges).toHaveBeenCalledWith(
      context,
      [seedStatementCharges[0]],
      { expectedVersions: undefined, targetReportId: "report-active" }
    );
  });

  it("creates an Export Package and returns its download URL", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      localRequest("/api/export-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: "report-1", employeeName: "Thiago Oliveira", reportReference: "EXP-1" })
      }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    await expect(jsonBody(response)).resolves.toEqual({
      exportPackage: expect.objectContaining({ id: "export-package-1", reportId: "report-1" }),
      downloadUrl: "/api/export-packages/export-package-1/download"
    });
    expect(repository.createExportPackage).toHaveBeenCalledWith(context, {
      reportId: "report-1",
      employeeName: "Thiago Oliveira",
      reportReference: "EXP-1"
    });
  });

  it("returns 400 when Export Package creation is missing the Expense Folder id", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      localRequest("/api/export-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(400);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Expense Folder is required." });
    expect(repository.createExportPackage).not.toHaveBeenCalled();
  });

  it("creates and emails an Export Package to the configured work address", async () => {
    const repository = repositoryStub();
    const sendExportPackageEmail = vi.fn().mockResolvedValue({
      messageId: "agentmail-message-1",
      threadId: "agentmail-thread-1",
      recipient: "thiago.oliveira@arcelormittal.com",
      subject: "Expense Me Export Package - Chicago Training - May 2026"
    });

    const response = await handleApiRequest(
      localRequest("/api/export-packages/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: "report-1", employeeName: "Thiago Oliveira", reportReference: "EXP-1" })
      }),
      {
        ...env,
        AGENTMAIL_API_KEY: "test-key",
        AGENTMAIL_BASE_URL: "https://agentmail.test",
        EXPORT_PACKAGE_EMAIL_TO: "thiago.oliveira@arcelormittal.com"
      },
      { repository: repository as never, sendExportPackageEmail } as never
    );

    expect(response.status).toBe(200);
    await expect(jsonBody(response)).resolves.toEqual({
      exportPackage: expect.objectContaining({ id: "export-package-1", reportId: "report-1" }),
      downloadUrl: "/api/export-packages/export-package-1/download",
      email: {
        messageId: "agentmail-message-1",
        threadId: "agentmail-thread-1",
        recipient: "thiago.oliveira@arcelormittal.com",
        subject: "Expense Me Export Package - Chicago Training - May 2026"
      }
    });
    expect(repository.createExportPackage).toHaveBeenCalledWith(context, {
      reportId: "report-1",
      employeeName: "Thiago Oliveira",
      reportReference: "EXP-1"
    });
    expect(repository.getExportPackageDownload).toHaveBeenCalledWith(context, "export-package-1");
    expect(sendExportPackageEmail).toHaveBeenCalledWith(
      expect.objectContaining({ AGENTMAIL_API_KEY: "test-key" }),
      expect.objectContaining({
        recipient: "thiago.oliveira@arcelormittal.com",
        folderName: "Chicago Training - May 2026",
        filename: "Chicago Training - May 2026.zip",
        zipBytes: expect.any(Uint8Array)
      })
    );
  });

  it("keeps unknown Expense Folder email exports as 404 instead of email failures", async () => {
    const repository = repositoryStub();
    repository.createExportPackage.mockRejectedValueOnce(new ExportPackageNotFoundError());
    const sendExportPackageEmail = vi.fn();

    const response = await handleApiRequest(
      localRequest("/api/export-packages/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: "missing-folder" })
      }),
      { ...env, AGENTMAIL_API_KEY: "test-key", EXPORT_PACKAGE_EMAIL_TO: "thiago.oliveira@arcelormittal.com" },
      { repository: repository as never, sendExportPackageEmail } as never
    );

    expect(response.status).toBe(404);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Export Package not found." });
    expect(sendExportPackageEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when Export Package email is missing the Expense Folder id", async () => {
    const repository = repositoryStub();
    const sendExportPackageEmail = vi.fn();

    const response = await handleApiRequest(
      localRequest("/api/export-packages/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }),
      { ...env, AGENTMAIL_API_KEY: "test-key" },
      { repository: repository as never, sendExportPackageEmail } as never
    );

    expect(response.status).toBe(400);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Expense Folder is required." });
    expect(repository.createExportPackage).not.toHaveBeenCalled();
    expect(sendExportPackageEmail).not.toHaveBeenCalled();
  });

  it("requires an explicit configured recipient before emailing an Export Package", async () => {
    const repository = repositoryStub();
    const sendExportPackageEmail = vi.fn();

    const response = await handleApiRequest(
      localRequest("/api/export-packages/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: "report-1" })
      }),
      { ...env, AGENTMAIL_API_KEY: "test-key", EXPORT_PACKAGE_EMAIL_TO: "" },
      { repository: repository as never, sendExportPackageEmail } as never
    );

    expect(response.status).toBe(500);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Export Package email is not configured." });
    expect(repository.createExportPackage).not.toHaveBeenCalled();
    expect(sendExportPackageEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when receipt upload is missing the artifact payload", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      localRequest("/api/receipts/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(400);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Receipt artifact is required." });
    expect(repository.upsertReceiptArtifact).not.toHaveBeenCalled();
  });

  it("downloads Export Package zip bytes with an Expense Folder filename", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      localRequest("/api/export-packages/export-package-1/download"),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="Chicago Training - May 2026.zip"');
    await expect(response.arrayBuffer()).resolves.toEqual(new Uint8Array([80, 75]).buffer);
    expect(repository.getExportPackageDownload).toHaveBeenCalledWith(context, "export-package-1");
  });

  it("syncs AgentMail server-side and writes imported email expenses", async () => {
    const repository = repositoryStub();
    repository.getSnapshot.mockResolvedValue({
      ...snapshot,
      expenses: [],
      receiptArtifacts: [],
      reports: [{ id: "report-active", name: "Active", expenseIds: [], status: "Draft", dateRangeLabel: "", createdAt: "" }],
      recordVersions: {
        expenses: {},
        reports: {},
        receiptArtifacts: {},
        statementCharges: {},
        exportPackages: {}
      }
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ messages: [{ message_id: "m1", subject: "Uber receipt", timestamp: "2026-06-03T14:00:00.000Z" }] }))
      .mockResolvedValueOnce(mockJsonResponse({ message_id: "m1", text: "Uber\nJun 3, 2026\nTotal $18.42", timestamp: "2026-06-03T14:00:00.000Z" }));
    vi.stubGlobal("fetch", fetcher);

    const response = await handleApiRequest(
      localRequest("/api/email/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: "report-active" })
      }),
      { ...env, AGENTMAIL_API_KEY: "test-key", AGENTMAIL_BASE_URL: "https://agentmail.test" },
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith("https://agentmail.test/v0/inboxes/expense-me%40agentmail.to/messages", {
      headers: { Authorization: "Bearer test-key" }
    });
    expect(repository.upsertReceiptArtifact).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ id: "art-email-m1", sourceMessageId: "m1" }),
      {}
    );
    expect(repository.upsertExpense).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ id: "exp-email-m1", reportId: "report-active", sourceType: "Email" }),
      {}
    );
    expect(repository.recordSyncRun).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ source: "AgentMail", attemptedCount: 1, importedCount: 1, repairedCount: 0, skippedCount: 0 })
    );
  });

  it("recovers when a previous sync left an email artifact without its expense", async () => {
    const repository = repositoryStub();
    repository.getSnapshot.mockResolvedValue({
      ...snapshot,
      expenses: [],
      receiptArtifacts: [{
        id: "art-email-m1",
        artifactType: "EmailBody",
        sourceMessageId: "m1",
        mimeType: "text/plain",
        storageKey: "agentmail/m1",
        createdAt: "2026-06-03T14:00:00.000Z",
        extractedText: "old partial artifact"
      }],
      reports: [{ id: "report-active", name: "Active", expenseIds: [], status: "Draft", dateRangeLabel: "", createdAt: "" }],
      recordVersions: {
        expenses: {},
        reports: { "report-active": 3 },
        receiptArtifacts: { "art-email-m1": 7 },
        statementCharges: {},
        exportPackages: {}
      }
    });
    repository.upsertReceiptArtifact.mockImplementation(async (_context, artifact, options) => {
      if (artifact.id === "art-email-m1" && options.expectedVersion !== 7) {
        throw new VersionConflictError();
      }

      return { snapshot };
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ messages: [{ message_id: "m1", subject: "Uber receipt", timestamp: "2026-06-03T14:00:00.000Z" }] }))
      .mockResolvedValueOnce(mockJsonResponse({ message_id: "m1", text: "Uber\nJun 3, 2026\nTotal $18.42", timestamp: "2026-06-03T14:00:00.000Z" }));
    vi.stubGlobal("fetch", fetcher);

    const response = await handleApiRequest(
      localRequest("/api/email/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: "report-active" })
      }),
      { ...env, AGENTMAIL_API_KEY: "test-key", AGENTMAIL_BASE_URL: "https://agentmail.test" },
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    expect(repository.upsertReceiptArtifact).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ id: "art-email-m1", sourceMessageId: "m1" }),
      { expectedVersion: 7 }
    );
    expect(repository.upsertExpense).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ id: "exp-email-m1", reportId: "report-active", sourceType: "Email" }),
      {}
    );
    expect(repository.addExpensesToFolder).toHaveBeenCalledWith(
      context,
      expect.any(Object),
      "report-active",
      ["exp-email-m1"]
    );
  });

  it("treats sync run logging failures as best-effort after imports were applied", async () => {
    const repository = repositoryStub();
    repository.getSnapshot.mockResolvedValue({
      ...snapshot,
      expenses: [],
      receiptArtifacts: [],
      reports: [{ id: "report-active", name: "Active", expenseIds: [], status: "Draft", dateRangeLabel: "", createdAt: "" }],
      recordVersions: {
        expenses: {},
        reports: {},
        receiptArtifacts: {},
        statementCharges: {},
        exportPackages: {}
      }
    });
    repository.recordSyncRun.mockRejectedValue(new Error("log write failed"));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ messages: [{ message_id: "m1", subject: "Uber receipt", timestamp: "2026-06-03T14:00:00.000Z" }] }))
      .mockResolvedValueOnce(mockJsonResponse({ message_id: "m1", text: "Uber\nJun 3, 2026\nTotal $18.42", timestamp: "2026-06-03T14:00:00.000Z" }));
    vi.stubGlobal("fetch", fetcher);

    const response = await handleApiRequest(
      localRequest("/api/email/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: "report-active" })
      }),
      { ...env, AGENTMAIL_API_KEY: "test-key", AGENTMAIL_BASE_URL: "https://agentmail.test" },
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    expect(repository.upsertExpense).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ id: "exp-email-m1", reportId: "report-active" }),
      {}
    );
  });

  it("returns 400 for malformed email sync JSON instead of reporting an upstream sync failure", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      localRequest("/api/email/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
      }),
      { ...env, AGENTMAIL_API_KEY: "test-key" },
      { repository: repository as never }
    );

    expect(response.status).toBe(400);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Request body must be valid JSON." });
    expect(repository.recordSyncRun).not.toHaveBeenCalled();
  });

  it("does not duplicate an AgentMail message that already has an Expense", async () => {
    const repository = repositoryStub();
    repository.getSnapshot.mockResolvedValue({
      ...snapshot,
      expenses: [{ ...seedExpenses[0], id: "exp-email-m1", sourceType: "Email" }],
      receiptArtifacts: [],
      reports: [{ id: "report-active", name: "Active", expenseIds: ["exp-email-m1"], status: "Draft", dateRangeLabel: "", createdAt: "" }],
      recordVersions: {
        expenses: { "exp-email-m1": 2 },
        reports: {},
        receiptArtifacts: {},
        statementCharges: {},
        exportPackages: {}
      }
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ messages: [{ message_id: "m1", subject: "Uber receipt", timestamp: "2026-06-03T14:00:00.000Z" }] }))
      .mockResolvedValueOnce(mockJsonResponse({ message_id: "m1", text: "Uber\nJun 3, 2026\nTotal $18.42", timestamp: "2026-06-03T14:00:00.000Z" }));
    vi.stubGlobal("fetch", fetcher);

    const response = await handleApiRequest(
      localRequest("/api/email/sync", { method: "POST" }),
      { ...env, AGENTMAIL_API_KEY: "test-key", AGENTMAIL_BASE_URL: "https://agentmail.test" },
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    expect(repository.upsertReceiptArtifact).not.toHaveBeenCalled();
    expect(repository.upsertExpense).not.toHaveBeenCalled();
    expect(repository.recordSyncRun).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ source: "AgentMail", attemptedCount: 1, importedCount: 0, repairedCount: 0, skippedCount: 1 })
    );
  });

  it("upgrades existing AgentMail artifacts with stored HTML on re-sync", async () => {
    const repository = repositoryStub();
    repository.getSnapshot.mockResolvedValue({
      ...snapshot,
      expenses: [{ ...seedExpenses[0], id: "exp-email-m1", sourceType: "Email", receiptArtifactIds: ["art-email-m1"] }],
      receiptArtifacts: [{
        id: "art-email-m1",
        artifactType: "EmailBody",
        sourceMessageId: "m1",
        mimeType: "text/plain",
        storageKey: "agentmail/m1",
        createdAt: "2026-06-03T14:00:00.000Z",
        extractedText: "Uber\nTotal $18.42"
      }],
      reports: [{ id: "report-active", name: "Active", expenseIds: ["exp-email-m1"], status: "Draft", dateRangeLabel: "", createdAt: "" }],
      recordVersions: {
        expenses: { "exp-email-m1": 2 },
        reports: {},
        receiptArtifacts: { "art-email-m1": 4 },
        statementCharges: {},
        exportPackages: {}
      }
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ messages: [{ message_id: "m1", subject: "Uber receipt", timestamp: "2026-06-03T14:00:00.000Z" }] }))
      .mockResolvedValueOnce(mockJsonResponse({
        message_id: "m1",
        html: "<html><body><table><tr><td>Uber formatted receipt</td></tr></table><p>Total $18.42</p></body></html>",
        timestamp: "2026-06-03T14:00:00.000Z"
      }));
    vi.stubGlobal("fetch", fetcher);

    const response = await handleApiRequest(
      localRequest("/api/email/sync", { method: "POST" }),
      { ...env, AGENTMAIL_API_KEY: "test-key", AGENTMAIL_BASE_URL: "https://agentmail.test" },
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    expect(repository.upsertReceiptArtifact).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        id: "art-email-m1",
        mimeType: "text/html",
        dataUrl: expect.stringMatching(/^data:text\/html;base64,/)
      }),
      { expectedVersion: 4 }
    );
    expect(repository.upsertExpense).not.toHaveBeenCalled();
    expect(repository.recordSyncRun).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ source: "AgentMail", attemptedCount: 1, importedCount: 0, repairedCount: 1, skippedCount: 0 })
    );
  });

  it("returns stable public text when server-side AgentMail sync fails", async () => {
    const repository = repositoryStub();
    const fetcher = vi.fn().mockResolvedValue(mockJsonResponse({ error: "upstream failed" }, 503));
    vi.stubGlobal("fetch", fetcher);

    const response = await handleApiRequest(
      localRequest("/api/email/sync", { method: "POST" }),
      { ...env, AGENTMAIL_API_KEY: "test-key", AGENTMAIL_BASE_URL: "https://agentmail.test" },
      { repository: repository as never }
    );

    expect(response.status).toBe(502);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Email sync failed." });
  });

  it("accepts a verified AgentMail webhook without an Access JWT and syncs server-side", async () => {
    const repository = repositoryStub();
    repository.getSnapshot.mockResolvedValue({
      ...snapshot,
      expenses: [],
      receiptArtifacts: [],
      reports: [{ id: "report-active", name: "Active", expenseIds: [], status: "Draft", dateRangeLabel: "", createdAt: "" }],
      recordVersions: {
        expenses: {},
        reports: {},
        receiptArtifacts: {},
        statementCharges: {},
        exportPackages: {}
      }
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ messages: [{ message_id: "m1", subject: "Uber receipt", timestamp: "2026-06-03T14:00:00.000Z" }] }))
      .mockResolvedValueOnce(mockJsonResponse({ message_id: "m1", text: "Uber\nJun 3, 2026\nTotal $18.42", timestamp: "2026-06-03T14:00:00.000Z" }));
    vi.stubGlobal("fetch", fetcher);

    const response = await handleApiRequest(
      await agentMailWebhookRequest({
        type: "event",
        event_type: "message.received",
        event_id: "event-1",
        message: { inbox_id: "expense-me@agentmail.to", message_id: "m1" }
      }),
      {
        ...env,
        AGENTMAIL_API_KEY: "test-key",
        AGENTMAIL_BASE_URL: "https://agentmail.test",
        AGENTMAIL_WEBHOOK_SECRET: testWebhookSecret
      },
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    await expect(jsonBody(response)).resolves.toEqual({ ok: true });
    expect(repository.getOrCreateWorkspace).toHaveBeenCalledWith({
      id: "agentmail:thiago@example.com",
      email: "thiago@example.com"
    });
    expect(repository.upsertExpense).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ id: "exp-email-m1", reportId: "report-active", sourceType: "Email" }),
      {}
    );
  });

  it("accepts comma-delimited AgentMail webhook signatures", async () => {
    const repository = repositoryStub();
    repository.getSnapshot.mockResolvedValue({
      ...snapshot,
      expenses: [],
      receiptArtifacts: [],
      reports: [{ id: "report-active", name: "Active", expenseIds: [], status: "Draft", dateRangeLabel: "", createdAt: "" }],
      recordVersions: {
        expenses: {},
        reports: {},
        receiptArtifacts: {},
        statementCharges: {},
        exportPackages: {}
      }
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ messages: [{ message_id: "m1", subject: "Uber receipt", timestamp: "2026-06-03T14:00:00.000Z" }] }))
      .mockResolvedValueOnce(mockJsonResponse({ message_id: "m1", text: "Uber\nJun 3, 2026\nTotal $18.42", timestamp: "2026-06-03T14:00:00.000Z" }));
    vi.stubGlobal("fetch", fetcher);

    const payload = {
      type: "event",
      event_type: "message.received",
      event_id: "event-1",
      message: { inbox_id: "expense-me@agentmail.to", message_id: "m1" }
    };
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await svixSignature(testWebhookSecret, "msg_webhook_1", timestamp, body);

    const response = await handleApiRequest(
      await agentMailWebhookRequest(payload, { signature: `v1,older-signature,${signature}`, timestamp }),
      {
        ...env,
        AGENTMAIL_API_KEY: "test-key",
        AGENTMAIL_BASE_URL: "https://agentmail.test",
        AGENTMAIL_WEBHOOK_SECRET: testWebhookSecret
      },
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    await expect(jsonBody(response)).resolves.toEqual({ ok: true });
    expect(repository.upsertExpense).toHaveBeenCalled();
  });

  it("rejects an AgentMail webhook with a bad signature", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      await agentMailWebhookRequest(
        { type: "event", event_type: "message.received", event_id: "event-1" },
        { signature: "v1,bad-signature" }
      ),
      { ...env, AGENTMAIL_WEBHOOK_SECRET: testWebhookSecret },
      { repository: repository as never }
    );

    expect(response.status).toBe(401);
    await expect(jsonBody(response)).resolves.toEqual({ error: "Webhook verification failed." });
    expect(repository.getOrCreateWorkspace).not.toHaveBeenCalled();
  });

  it("ignores verified AgentMail webhook events that are not new received messages", async () => {
    const repository = repositoryStub();

    const response = await handleApiRequest(
      await agentMailWebhookRequest({
        type: "event",
        event_type: "message.delivered",
        event_id: "event-1"
      }),
      { ...env, AGENTMAIL_WEBHOOK_SECRET: testWebhookSecret },
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    await expect(jsonBody(response)).resolves.toEqual({ ok: true, ignored: true });
    expect(repository.getOrCreateWorkspace).not.toHaveBeenCalled();
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
