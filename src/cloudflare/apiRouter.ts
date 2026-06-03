import type { AppSnapshot, Expense, ExportPackage, ReceiptArtifact, Report, StatementCharge } from "../domain/types";
import { agentMailWebhookUser, verifyAgentMailWebhook } from "./agentMailWebhook";
import { requireAccessUser } from "./accessAuth";
import {
  D1ExpenseMeRepository,
  ExportPackageNotFoundError,
  NonEmptyExpenseFolderError,
  type ExportPackageResult,
  type MutationResult,
  VersionConflictError
} from "./d1Repository";
import { errorResponse, jsonResponse, readJson, readOptionalJson } from "./http";
import { syncServerAgentMail } from "./serverAgentMail";
import type { AccessUser, ApiSnapshotBody, CloudflareEnv, WorkspaceContext } from "./types";

interface ExportPackageDownload {
  exportPackage: ExportPackage;
  object: {
    arrayBuffer(): Promise<ArrayBuffer>;
    httpMetadata?: {
      contentType?: string;
    };
  };
}

interface CloudApiRepository {
  getOrCreateWorkspace(user: AccessUser): Promise<WorkspaceContext>;
  getSnapshot(context: WorkspaceContext): Promise<ApiSnapshotBody["snapshot"]>;
  upsertExpense(
    context: WorkspaceContext,
    expense: Expense,
    options: { expectedVersion?: number }
  ): Promise<MutationResult>;
  deleteExpense(
    context: WorkspaceContext,
    expenseId: string,
    options: { expectedVersion?: number }
  ): Promise<MutationResult>;
  upsertExpenseFolder(
    context: WorkspaceContext,
    report: Report,
    options: { expectedVersion?: number }
  ): Promise<MutationResult>;
  deleteExpenseFolder(
    context: WorkspaceContext,
    reportId: string,
    options: { expectedVersion?: number }
  ): Promise<MutationResult>;
  upsertReceiptArtifact(
    context: WorkspaceContext,
    artifact: ReceiptArtifact,
    options: { expectedVersion?: number }
  ): Promise<MutationResult>;
  importStatementCharges(
    context: WorkspaceContext,
    charges: StatementCharge[],
    options?: { expectedVersions?: Record<string, number>; targetReportId?: string }
  ): Promise<MutationResult>;
  recordSyncRun?(
    context: WorkspaceContext,
    input: {
      source: string;
      attemptedCount: number;
      importedCount: number;
      repairedCount: number;
      skippedCount: number;
      errorMessage?: string;
      startedAt: string;
      finishedAt: string;
    }
  ): Promise<void>;
  replaceFromMigration(context: WorkspaceContext, snapshot: AppSnapshot): Promise<MutationResult>;
  createExportPackage(
    context: WorkspaceContext,
    options: { reportId: string; employeeName: string; reportReference: string }
  ): Promise<ExportPackageResult>;
  getExportPackageDownload(context: WorkspaceContext, exportPackageId: string): Promise<ExportPackageDownload>;
}

interface RouteDeps {
  repository?: CloudApiRepository;
}

function expectedVersionFromSearch(url: URL) {
  const value = url.searchParams.get("expectedVersion");
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function authErrorResponse(error: Response) {
  return errorResponse(error.status, error.status === 403 ? "Forbidden." : "Unauthorized.");
}

function downloadFilename(value: string) {
  return `${value.replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-").replace(/^-|-$/g, "") || "Export Package"}.zip`;
}

export async function handleApiRequest(request: Request, env: CloudflareEnv, deps: RouteDeps = {}) {
  try {
    const url = new URL(request.url);
    const repository = deps.repository ?? new D1ExpenseMeRepository(env);

    if (request.method === "POST" && url.pathname === "/api/agentmail/webhook") {
      try {
        const payload = await verifyAgentMailWebhook(request, env);

        if (payload.event_type !== "message.received") {
          return jsonResponse({ ok: true, ignored: true });
        }

        const context = await repository.getOrCreateWorkspace(agentMailWebhookUser(env));
        await syncServerAgentMail(env, context, repository);
        return jsonResponse({ ok: true });
      } catch (error) {
        if (error instanceof Response) {
          return error;
        }

        console.error("AgentMail webhook sync failed.", error);
        return errorResponse(502, "Email sync failed.");
      }
    }

    const user = await requireAccessUser(request, env);
    const context = await repository.getOrCreateWorkspace(user);

    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      const snapshot = await repository.getSnapshot(context);
      return jsonResponse({ snapshot } satisfies ApiSnapshotBody);
    }

    if (request.method === "POST" && url.pathname === "/api/expenses") {
      const body = await readJson<{ expense: Expense; artifacts?: ReceiptArtifact[]; expectedVersion?: number }>(request);
      for (const artifact of body.artifacts ?? []) {
        await repository.upsertReceiptArtifact(context, artifact, {});
      }
      const result = await repository.upsertExpense(context, body.expense, { expectedVersion: body.expectedVersion });
      return jsonResponse(result);
    }

    const expensePatch = url.pathname.match(/^\/api\/expenses\/([^/]+)$/);
    if (request.method === "PATCH" && expensePatch) {
      const expenseId = decodeURIComponent(expensePatch[1]);
      const body = await readJson<{ expense: Expense; expectedVersion?: number }>(request);
      if (body.expense.id !== expenseId) {
        return errorResponse(400, "Expense id mismatch.");
      }
      const result = await repository.upsertExpense(context, body.expense, { expectedVersion: body.expectedVersion });
      return jsonResponse(result);
    }

    const expenseDelete = url.pathname.match(/^\/api\/expenses\/([^/]+)$/);
    if (request.method === "DELETE" && expenseDelete) {
      const result = await repository.deleteExpense(context, decodeURIComponent(expenseDelete[1]), {
        expectedVersion: expectedVersionFromSearch(url)
      });
      return jsonResponse(result);
    }

    if (request.method === "POST" && url.pathname === "/api/expense-folders") {
      const body = await readJson<{ expenseFolder?: Report; report?: Report; expectedVersion?: number }>(request);
      const expenseFolder = body.expenseFolder ?? body.report;
      if (!expenseFolder) {
        return errorResponse(400, "Expense Folder is required.");
      }
      const result = await repository.upsertExpenseFolder(context, expenseFolder, {
        expectedVersion: body.expectedVersion
      });
      return jsonResponse(result);
    }

    const folderPatch = url.pathname.match(/^\/api\/expense-folders\/([^/]+)$/);
    if (request.method === "PATCH" && folderPatch) {
      const reportId = decodeURIComponent(folderPatch[1]);
      const body = await readJson<{ expenseFolder?: Report; report?: Report; expectedVersion?: number }>(request);
      const expenseFolder = body.expenseFolder ?? body.report;
      if (!expenseFolder) {
        return errorResponse(400, "Expense Folder is required.");
      }
      if (expenseFolder.id !== reportId) {
        return errorResponse(400, "Expense Folder id mismatch.");
      }
      const result = await repository.upsertExpenseFolder(context, expenseFolder, {
        expectedVersion: body.expectedVersion
      });
      return jsonResponse(result);
    }

    const folderDelete = url.pathname.match(/^\/api\/expense-folders\/([^/]+)$/);
    if (request.method === "DELETE" && folderDelete) {
      const result = await repository.deleteExpenseFolder(context, decodeURIComponent(folderDelete[1]), {
        expectedVersion: expectedVersionFromSearch(url)
      });
      return jsonResponse(result);
    }

    if (request.method === "POST" && url.pathname === "/api/receipts/upload") {
      const body = await readJson<{ artifact: ReceiptArtifact; expectedVersion?: number }>(request);
      const result = await repository.upsertReceiptArtifact(context, body.artifact, {
        expectedVersion: body.expectedVersion
      });
      return jsonResponse(result);
    }

    if (request.method === "POST" && url.pathname === "/api/statements/import") {
      const body = await readJson<{
        statementCharges?: StatementCharge[];
        charges?: StatementCharge[];
        expectedVersions?: Record<string, number>;
        reportId?: string;
      }>(
        request
      );
      const charges = body.statementCharges ?? body.charges ?? [];
      const result = await repository.importStatementCharges(context, charges, {
        expectedVersions: body.expectedVersions,
        targetReportId: body.reportId
      });
      return jsonResponse(result);
    }

    if (request.method === "POST" && url.pathname === "/api/email/sync") {
      try {
        const body = await readOptionalJson<{ reportId?: string }>(request);
        const result = await syncServerAgentMail(env, context, repository, { targetReportId: body?.reportId });
        return jsonResponse(result);
      } catch (error) {
        console.error("Email sync failed.", error);
        return errorResponse(502, "Email sync failed.");
      }
    }

    if (request.method === "POST" && url.pathname === "/api/export-packages") {
      const body = await readJson<{ reportId: string; employeeName?: string; reportReference?: string }>(request);
      const result = await repository.createExportPackage(context, {
        reportId: body.reportId,
        employeeName: body.employeeName ?? "Thiago Oliveira",
        reportReference: body.reportReference ?? body.reportId
      });
      return jsonResponse({
        exportPackage: result.exportPackage,
        downloadUrl: `/api/export-packages/${encodeURIComponent(result.exportPackage.id)}/download`
      });
    }

    const exportDownload = url.pathname.match(/^\/api\/export-packages\/([^/]+)\/download$/);
    if (request.method === "GET" && exportDownload) {
      const { exportPackage, object } = await repository.getExportPackageDownload(
        context,
        decodeURIComponent(exportDownload[1])
      );
      const headers = new Headers();
      headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/zip");
      headers.set("Content-Disposition", `attachment; filename="${downloadFilename(exportPackage.id)}"`);
      return new Response(await object.arrayBuffer(), { headers });
    }

    if (request.method === "POST" && url.pathname === "/api/migrate-local-snapshot") {
      const body = await readJson<{ snapshot: AppSnapshot }>(request);
      const result = await repository.replaceFromMigration(context, body.snapshot);
      return jsonResponse(result);
    }

    return errorResponse(404, "API route not found.");
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return errorResponse(409, error.message);
    }

    if (error instanceof NonEmptyExpenseFolderError) {
      return errorResponse(409, error.message);
    }

    if (error instanceof ExportPackageNotFoundError) {
      return errorResponse(404, error.message);
    }

    if (error instanceof Response) {
      return authErrorResponse(error);
    }

    console.error("Expense Me API failed.", error);
    return errorResponse(500, "Expense Me API failed.");
  }
}
