import type { AppSnapshot, Expense, ExportPackage, ReceiptArtifact, Report, StatementCharge } from "../domain/types";
import { buildExportPackageZip } from "../features/export/exportPackage";
import { reconcileStatementCharges } from "../features/statements/reconciliation";
import { reportLabelForExpenseIds } from "../app/appState";
import { normalizeCloudSnapshot } from "./appSnapshot";
import { loadArtifactDataUrl, storeArtifactData } from "./artifactStore";
import { hasGotenbergRenderer, renderHtmlToPdfWithGotenberg } from "./gotenbergPdf";
import { decodePayload, encodePayload, stripArtifactDataUrl } from "./schema";
import type { AccessUser, CloudSnapshot, CloudflareEnv, WorkspaceContext } from "./types";

type PayloadEntity = Expense | Report | ReceiptArtifact | StatementCharge | ExportPackage;
type VersionedTable = "expenses" | "expense_folders" | "receipt_artifacts" | "statement_charges" | "export_packages";

interface PayloadRecords<T extends PayloadEntity> {
  items: T[];
  versions: Record<string, number>;
}

export interface WriteOptions {
  expectedVersion?: number;
  force?: boolean;
}

export interface MutationResult {
  snapshot: CloudSnapshot;
}

export interface ExportPackageResult {
  exportPackage: ExportPackage;
  objectKey: string;
}

export interface SyncRunInput {
  source: string;
  attemptedCount: number;
  importedCount: number;
  repairedCount: number;
  skippedCount: number;
  errorMessage?: string;
  startedAt: string;
  finishedAt: string;
}

export class VersionConflictError extends Error {
  constructor() {
    super("The cloud record changed. Refresh and try again.");
    this.name = "VersionConflictError";
  }
}

export class NonEmptyExpenseFolderError extends Error {
  constructor() {
    super("Expense Folder has expenses and cannot be deleted.");
    this.name = "NonEmptyExpenseFolderError";
  }
}

export class ExportPackageNotFoundError extends Error {
  constructor() {
    super("Export Package not found.");
    this.name = "ExportPackageNotFoundError";
  }
}

interface D1WriteResult {
  meta?: {
    changes?: number;
  };
}

function changedRows(result: D1WriteResult) {
  return typeof result.meta?.changes === "number" ? result.meta.changes : 1;
}

function assertWriteApplied(result: D1WriteResult) {
  if (changedRows(result) !== 1) {
    throw new VersionConflictError();
  }
}

function assertCanInsert(options: WriteOptions) {
  if (!options.force && options.expectedVersion !== undefined) {
    throw new VersionConflictError();
  }
}

export class D1ExpenseMeRepository {
  constructor(private readonly env: CloudflareEnv) {}

  async getOrCreateWorkspace(user: AccessUser): Promise<WorkspaceContext> {
    const now = new Date().toISOString();
    const userId = `user-${crypto.randomUUID()}`;
    const workspaceId = "workspace-personal";

    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(userId, user.email, user.name ?? null, now, now)
      .run();

    const row = await this.env.EXPENSE_ME_DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(user.email)
      .first<{ id: string }>();
    const resolvedUserId = row?.id ?? userId;

    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT OR IGNORE INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    )
      .bind(workspaceId, "Expense Me", now, now)
      .run();

    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)"
    )
      .bind(workspaceId, resolvedUserId, "owner", now)
      .run();

    return { user: { ...user, id: resolvedUserId }, workspaceId };
  }

  async getSnapshot(context: WorkspaceContext): Promise<CloudSnapshot> {
    const [expenseRecords, folderRecords, artifactRecords, chargeRecords, packageRecords] = await Promise.all([
      this.listRecords<Expense>("expenses", context.workspaceId, "expense_date DESC"),
      this.listRecords<Report>("expense_folders", context.workspaceId, "created_at DESC"),
      this.listRecords<ReceiptArtifact>("receipt_artifacts", context.workspaceId, "created_at DESC"),
      this.listRecords<StatementCharge>("statement_charges", context.workspaceId, "transaction_date DESC"),
      this.listRecords<ExportPackage>("export_packages", context.workspaceId, "generated_at DESC")
    ]);

    return normalizeCloudSnapshot({
      workspaceId: context.workspaceId,
      userEmail: context.user.email,
      expenses: expenseRecords.items,
      reports: folderRecords.items,
      receiptArtifacts: artifactRecords.items,
      statementCharges: chargeRecords.items,
      exportPackages: packageRecords.items,
      recordVersions: {
        expenses: expenseRecords.versions,
        reports: folderRecords.versions,
        receiptArtifacts: artifactRecords.versions,
        statementCharges: chargeRecords.versions,
        exportPackages: packageRecords.versions
      }
    });
  }

  private async listRecords<T extends PayloadEntity>(
    table: string,
    workspaceId: string,
    orderBy: string
  ): Promise<PayloadRecords<T>> {
    const result = await this.env.EXPENSE_ME_DB.prepare(
      `SELECT payload_json, version FROM ${table} WHERE workspace_id = ? ORDER BY ${orderBy}`
    )
      .bind(workspaceId)
      .all<{ payload_json: string; version: number }>();

    const items: T[] = [];
    const versions: Record<string, number> = {};

    for (const row of result.results ?? []) {
      const item = decodePayload<T>(row.payload_json);
      items.push(item);
      versions[item.id] = row.version;
    }

    return { items, versions };
  }

  private async readVersion(table: VersionedTable, context: WorkspaceContext, id: string) {
    const row = await this.env.EXPENSE_ME_DB.prepare(`SELECT version FROM ${table} WHERE workspace_id = ? AND id = ?`)
      .bind(context.workspaceId, id)
      .first<{ version: number }>();
    return row?.version;
  }

  private assertCanUpdate(currentVersion: number, options: WriteOptions) {
    if (!options.force && options.expectedVersion !== currentVersion) {
      throw new VersionConflictError();
    }
  }

  async upsertExpense(context: WorkspaceContext, expense: Expense, options: WriteOptions = {}): Promise<MutationResult> {
    const now = new Date().toISOString();
    const currentVersion = await this.readVersion("expenses", context, expense.id);

    if (currentVersion === undefined) {
      assertCanInsert(options);
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "INSERT OR IGNORE INTO expenses (id, workspace_id, expense_folder_id, payload_json, status, expense_date, source_type, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
      )
        .bind(
          expense.id,
          context.workspaceId,
          expense.reportId ?? null,
          encodePayload(expense),
          expense.status,
          expense.expenseDate,
          expense.sourceType,
          now,
          now
        )
        .run();
      assertWriteApplied(result);
    } else {
      this.assertCanUpdate(currentVersion, options);
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "UPDATE expenses SET expense_folder_id = ?, payload_json = ?, status = ?, expense_date = ?, source_type = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?"
      )
        .bind(
          expense.reportId ?? null,
          encodePayload(expense),
          expense.status,
          expense.expenseDate,
          expense.sourceType,
          now,
          context.workspaceId,
          expense.id,
          currentVersion
        )
        .run();
      assertWriteApplied(result);
    }

    return { snapshot: await this.getSnapshot(context) };
  }

  async deleteExpense(context: WorkspaceContext, expenseId: string, options: WriteOptions = {}): Promise<MutationResult> {
    const currentVersion = await this.readVersion("expenses", context, expenseId);

    if (currentVersion !== undefined) {
      this.assertCanUpdate(currentVersion, options);
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "DELETE FROM expenses WHERE workspace_id = ? AND id = ? AND version = ?"
      )
        .bind(context.workspaceId, expenseId, currentVersion)
        .run();
      assertWriteApplied(result);
    }

    return { snapshot: await this.getSnapshot(context) };
  }

  async upsertExpenseFolder(context: WorkspaceContext, report: Report, options: WriteOptions = {}): Promise<MutationResult> {
    const now = new Date().toISOString();
    const currentVersion = await this.readVersion("expense_folders", context, report.id);

    if (currentVersion === undefined) {
      assertCanInsert(options);
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "INSERT OR IGNORE INTO expense_folders (id, workspace_id, payload_json, status, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, 1)"
      )
        .bind(report.id, context.workspaceId, encodePayload(report), report.status, report.createdAt, now)
        .run();
      assertWriteApplied(result);
    } else {
      this.assertCanUpdate(currentVersion, options);
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "UPDATE expense_folders SET payload_json = ?, status = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?"
      )
        .bind(encodePayload(report), report.status, now, context.workspaceId, report.id, currentVersion)
        .run();
      assertWriteApplied(result);
    }

    return { snapshot: await this.getSnapshot(context) };
  }

  async deleteExpenseFolder(context: WorkspaceContext, reportId: string, options: WriteOptions = {}): Promise<MutationResult> {
    const assigned = await this.env.EXPENSE_ME_DB.prepare(
      "SELECT COUNT(*) AS count FROM expenses WHERE workspace_id = ? AND expense_folder_id = ?"
    )
      .bind(context.workspaceId, reportId)
      .first<{ count: number }>();

    if ((assigned?.count ?? 0) > 0) {
      throw new NonEmptyExpenseFolderError();
    }

    const currentVersion = await this.readVersion("expense_folders", context, reportId);

    if (currentVersion !== undefined) {
      this.assertCanUpdate(currentVersion, options);
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "DELETE FROM expense_folders WHERE workspace_id = ? AND id = ? AND version = ?"
      )
        .bind(context.workspaceId, reportId, currentVersion)
        .run();
      assertWriteApplied(result);
    }

    return { snapshot: await this.getSnapshot(context) };
  }

  async replaceFromMigration(context: WorkspaceContext, snapshot: AppSnapshot): Promise<MutationResult> {
    await this.env.EXPENSE_ME_DB.batch([
      this.env.EXPENSE_ME_DB.prepare("DELETE FROM expenses WHERE workspace_id = ?").bind(context.workspaceId),
      this.env.EXPENSE_ME_DB.prepare("DELETE FROM expense_folders WHERE workspace_id = ?").bind(context.workspaceId),
      this.env.EXPENSE_ME_DB.prepare("DELETE FROM receipt_artifacts WHERE workspace_id = ?").bind(context.workspaceId),
      this.env.EXPENSE_ME_DB.prepare("DELETE FROM statement_charges WHERE workspace_id = ?").bind(context.workspaceId)
    ]);

    for (const report of snapshot.reports) {
      await this.upsertExpenseFolder(context, report, { force: true });
    }

    for (const expense of snapshot.expenses) {
      await this.upsertExpense(context, expense, { force: true });
    }

    for (const artifact of snapshot.receiptArtifacts) {
      await this.upsertReceiptArtifact(context, artifact, { force: true });
    }

    for (const charge of snapshot.statementCharges) {
      await this.upsertStatementCharge(context, charge, { force: true });
    }

    return { snapshot: await this.getSnapshot(context) };
  }

  async upsertReceiptArtifact(
    context: WorkspaceContext,
    artifact: ReceiptArtifact,
    options: WriteOptions = {}
  ): Promise<MutationResult> {
    const now = new Date().toISOString();
    const currentVersion = await this.readVersion("receipt_artifacts", context, artifact.id);

    if (currentVersion === undefined) {
      assertCanInsert(options);
    } else {
      this.assertCanUpdate(currentVersion, options);
    }

    const storageKey = await storeArtifactData(this.env, context, artifact);
    const metadata = stripArtifactDataUrl({ ...artifact, storageKey });

    if (currentVersion === undefined) {
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "INSERT OR IGNORE INTO receipt_artifacts (id, workspace_id, payload_json, artifact_type, source_message_id, storage_key, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)"
      )
        .bind(
          metadata.id,
          context.workspaceId,
          encodePayload(metadata),
          metadata.artifactType,
          metadata.sourceMessageId ?? null,
          metadata.storageKey,
          metadata.createdAt,
          now
        )
        .run();
      assertWriteApplied(result);
    } else {
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "UPDATE receipt_artifacts SET payload_json = ?, artifact_type = ?, source_message_id = ?, storage_key = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?"
      )
        .bind(
          encodePayload(metadata),
          metadata.artifactType,
          metadata.sourceMessageId ?? null,
          metadata.storageKey,
          now,
          context.workspaceId,
          metadata.id,
          currentVersion
        )
        .run();
      assertWriteApplied(result);
    }

    return { snapshot: await this.getSnapshot(context) };
  }

  async upsertStatementCharge(
    context: WorkspaceContext,
    charge: StatementCharge,
    options: WriteOptions = {}
  ): Promise<MutationResult> {
    const now = new Date().toISOString();
    const currentVersion = await this.readVersion("statement_charges", context, charge.id);

    if (currentVersion === undefined) {
      assertCanInsert(options);
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "INSERT OR IGNORE INTO statement_charges (id, workspace_id, payload_json, statement_import_id, match_status, transaction_date, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)"
      )
        .bind(
          charge.id,
          context.workspaceId,
          encodePayload(charge),
          charge.statementImportId,
          charge.matchStatus,
          charge.transactionDate,
          now,
          now
        )
        .run();
      assertWriteApplied(result);
    } else {
      this.assertCanUpdate(currentVersion, options);
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "UPDATE statement_charges SET payload_json = ?, match_status = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?"
      )
        .bind(encodePayload(charge), charge.matchStatus, now, context.workspaceId, charge.id, currentVersion)
        .run();
      assertWriteApplied(result);
    }

    return { snapshot: await this.getSnapshot(context) };
  }

  async importStatementCharges(
    context: WorkspaceContext,
    charges: StatementCharge[],
    options: { expectedVersions?: Record<string, number>; targetReportId?: string } = {}
  ): Promise<MutationResult> {
    const snapshot = await this.getSnapshot(context);
    const reconciled = reconcileStatementCharges(snapshot.expenses, charges);
    const targetReportId = options.targetReportId && snapshot.reports.some((report) => report.id === options.targetReportId)
      ? options.targetReportId
      : snapshot.reports[0]?.id;
    const changedExpenseIds = new Set([...reconciled.matchedExpenseIds, ...reconciled.createdExpenseIds]);

    for (const expense of reconciled.expenses) {
      if (!changedExpenseIds.has(expense.id)) continue;

      const nextExpense = reconciled.createdExpenseIds.includes(expense.id) && targetReportId && !expense.reportId
        ? { ...expense, reportId: targetReportId }
        : expense;

      await this.upsertExpense(context, nextExpense, {
        expectedVersion: snapshot.recordVersions.expenses[expense.id]
      });
    }

    for (const charge of reconciled.charges) {
      await this.upsertStatementCharge(context, charge, {
        expectedVersion: options.expectedVersions?.[charge.id] ?? snapshot.recordVersions.statementCharges[charge.id]
      });
    }

    await this.addExpensesToFolder(context, snapshot, targetReportId, reconciled.createdExpenseIds);

    return { snapshot: await this.getSnapshot(context) };
  }

  async addExpensesToFolder(
    context: WorkspaceContext,
    snapshot: CloudSnapshot,
    reportId: string | undefined,
    expenseIds: string[]
  ) {
    if (!reportId || expenseIds.length === 0) return;

    const report = snapshot.reports.find((candidate) => candidate.id === reportId);
    if (!report) return;

    const nextExpenseIds = [...expenseIds.filter((id) => !report.expenseIds.includes(id)), ...report.expenseIds];
    await this.upsertExpenseFolder(context, {
      ...report,
      expenseIds: nextExpenseIds,
      dateRangeLabel: reportLabelForExpenseIds(report, nextExpenseIds)
    }, {
      expectedVersion: snapshot.recordVersions.reports[report.id]
    });
  }

  async recordSyncRun(context: WorkspaceContext, input: SyncRunInput) {
    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT INTO sync_runs (id, workspace_id, source, attempted_count, imported_count, repaired_count, skipped_count, error_message, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        `sync-run-${crypto.randomUUID()}`,
        context.workspaceId,
        input.source,
        input.attemptedCount,
        input.importedCount,
        input.repairedCount,
        input.skippedCount,
        input.errorMessage ?? null,
        input.startedAt,
        input.finishedAt
      )
      .run();
  }

  async createExportPackage(
    context: WorkspaceContext,
    options: { reportId: string; employeeName: string; reportReference: string }
  ): Promise<ExportPackageResult> {
    const snapshot = await this.getSnapshot(context);
    const report = snapshot.reports.find((candidate) => candidate.id === options.reportId);

    if (!report) {
      throw new ExportPackageNotFoundError();
    }

    const packageExpenses = snapshot.expenses.filter((expense) => report.expenseIds.includes(expense.id));
    const receiptArtifactIds = new Set(packageExpenses.flatMap((expense) => expense.receiptArtifactIds));
    const receiptArtifacts = await Promise.all(
      snapshot.receiptArtifacts
        .filter((artifact) => receiptArtifactIds.has(artifact.id))
        .map(async (artifact) => ({
          ...artifact,
          dataUrl: await loadArtifactDataUrl(this.env, artifact)
        }))
    );
    const archive = await buildExportPackageZip({
      report,
      expenses: snapshot.expenses,
      receiptArtifacts,
      employeeName: options.employeeName,
      reportReference: options.reportReference,
      renderHtmlToPdf: hasGotenbergRenderer(this.env)
        ? (html, renderContext) => renderHtmlToPdfWithGotenberg(this.env, html, renderContext)
        : undefined
    });
    const now = new Date().toISOString();
    const id = `export-package-${crypto.randomUUID()}`;
    const safeReportName = report.name.replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-").replace(/^-|-$/g, "") || "Expense Folder";
    const objectKey = `${context.workspaceId}/export-packages/${id}.zip`;
    const exportPackage: ExportPackage = {
      id,
      reportId: report.id,
      generatedAt: now,
      reviewPdfName: `${safeReportName}-expense-index.pdf`,
      spreadsheetName: `${safeReportName}-entry-spreadsheet.csv`,
      receiptsZipName: `${safeReportName}-receipts.zip`,
      declarationPdfNames: packageExpenses
        .map((expense) => expense.declarationId)
        .filter((declarationId): declarationId is string => Boolean(declarationId))
        .map((declarationId) => `${declarationId}.pdf`),
      reconciliationNotesName: `${safeReportName}-reconciliation-notes.pdf`
    };

    await this.env.EXPENSE_ME_ARTIFACTS.put(objectKey, archive, {
      httpMetadata: { contentType: "application/zip" }
    });
    await this.upsertExportPackageRecord(context, exportPackage, objectKey);

    return { exportPackage, objectKey };
  }

  private async upsertExportPackageRecord(
    context: WorkspaceContext,
    exportPackage: ExportPackage,
    objectKey: string,
    options: WriteOptions = {}
  ) {
    const now = new Date().toISOString();
    const currentVersion = await this.readVersion("export_packages", context, exportPackage.id);

    if (currentVersion === undefined) {
      assertCanInsert(options);
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "INSERT OR IGNORE INTO export_packages (id, workspace_id, expense_folder_id, payload_json, object_key, generated_at, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)"
      )
        .bind(
          exportPackage.id,
          context.workspaceId,
          exportPackage.reportId,
          encodePayload(exportPackage),
          objectKey,
          exportPackage.generatedAt,
          now,
          now
        )
        .run();
      assertWriteApplied(result);
    } else {
      this.assertCanUpdate(currentVersion, options);
      const result = await this.env.EXPENSE_ME_DB.prepare(
        "UPDATE export_packages SET payload_json = ?, object_key = ?, generated_at = ?, updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ? AND version = ?"
      )
        .bind(
          encodePayload(exportPackage),
          objectKey,
          exportPackage.generatedAt,
          now,
          context.workspaceId,
          exportPackage.id,
          currentVersion
        )
        .run();
      assertWriteApplied(result);
    }
  }

  async getExportPackageDownload(context: WorkspaceContext, exportPackageId: string) {
    const row = await this.env.EXPENSE_ME_DB.prepare(
      "SELECT payload_json, object_key FROM export_packages WHERE workspace_id = ? AND id = ?"
    )
      .bind(context.workspaceId, exportPackageId)
      .first<{ payload_json: string; object_key: string }>();

    if (!row) {
      throw new ExportPackageNotFoundError();
    }

    const object = await this.env.EXPENSE_ME_ARTIFACTS.get(row.object_key);

    if (!object) {
      throw new ExportPackageNotFoundError();
    }

    return {
      exportPackage: decodePayload<ExportPackage>(row.payload_json),
      object
    };
  }
}
