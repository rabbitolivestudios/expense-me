import type { Expense, ExportPackage, ReceiptArtifact, Report, StatementCharge } from "../domain/types";
import { normalizeCloudSnapshot } from "./appSnapshot";
import { decodePayload, encodePayload, stripArtifactDataUrl } from "./schema";
import type { AccessUser, CloudSnapshot, CloudflareEnv, WorkspaceContext } from "./types";

type PayloadEntity = Expense | Report | ReceiptArtifact | StatementCharge | ExportPackage;

export interface MutationResult {
  snapshot: CloudSnapshot;
}

export class VersionConflictError extends Error {
  constructor() {
    super("The cloud record changed. Refresh and try again.");
    this.name = "VersionConflictError";
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
    const [expenses, folders, artifacts, charges, packages] = await Promise.all([
      this.listPayloads<Expense>("expenses", context.workspaceId, "expense_date DESC"),
      this.listPayloads<Report>("expense_folders", context.workspaceId, "created_at DESC"),
      this.listPayloads<ReceiptArtifact>("receipt_artifacts", context.workspaceId, "created_at DESC"),
      this.listPayloads<StatementCharge>("statement_charges", context.workspaceId, "transaction_date DESC"),
      this.listPayloads<ExportPackage>("export_packages", context.workspaceId, "generated_at DESC")
    ]);

    return normalizeCloudSnapshot({
      workspaceId: context.workspaceId,
      userEmail: context.user.email,
      expenses,
      reports: folders,
      receiptArtifacts: artifacts,
      statementCharges: charges,
      exportPackages: packages
    });
  }

  async listPayloads<T extends PayloadEntity>(table: string, workspaceId: string, orderBy: string): Promise<T[]> {
    const result = await this.env.EXPENSE_ME_DB.prepare(
      `SELECT payload_json FROM ${table} WHERE workspace_id = ? ORDER BY ${orderBy}`
    )
      .bind(workspaceId)
      .all<{ payload_json: string }>();

    return (result.results ?? []).map((row) => decodePayload<T>(row.payload_json));
  }

  async upsertExpense(context: WorkspaceContext, expense: Expense): Promise<MutationResult> {
    const now = new Date().toISOString();
    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT INTO expenses (id, workspace_id, expense_folder_id, payload_json, status, expense_date, source_type, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET expense_folder_id = excluded.expense_folder_id, payload_json = excluded.payload_json, status = excluded.status, expense_date = excluded.expense_date, source_type = excluded.source_type, updated_at = excluded.updated_at, version = expenses.version + 1"
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

    return { snapshot: await this.getSnapshot(context) };
  }

  async deleteExpense(context: WorkspaceContext, expenseId: string): Promise<MutationResult> {
    await this.env.EXPENSE_ME_DB.prepare("DELETE FROM expenses WHERE workspace_id = ? AND id = ?")
      .bind(context.workspaceId, expenseId)
      .run();

    return { snapshot: await this.getSnapshot(context) };
  }

  async upsertExpenseFolder(context: WorkspaceContext, report: Report): Promise<MutationResult> {
    const now = new Date().toISOString();
    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT INTO expense_folders (id, workspace_id, payload_json, status, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, status = excluded.status, updated_at = excluded.updated_at, version = expense_folders.version + 1"
    )
      .bind(report.id, context.workspaceId, encodePayload(report), report.status, report.createdAt, now)
      .run();

    return { snapshot: await this.getSnapshot(context) };
  }

  async deleteExpenseFolder(context: WorkspaceContext, reportId: string): Promise<MutationResult> {
    await this.env.EXPENSE_ME_DB.prepare("DELETE FROM expense_folders WHERE workspace_id = ? AND id = ?")
      .bind(context.workspaceId, reportId)
      .run();

    return { snapshot: await this.getSnapshot(context) };
  }

  async upsertReceiptArtifact(context: WorkspaceContext, artifact: ReceiptArtifact) {
    const now = new Date().toISOString();
    const metadata = stripArtifactDataUrl(artifact);
    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT INTO receipt_artifacts (id, workspace_id, payload_json, artifact_type, source_message_id, storage_key, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, artifact_type = excluded.artifact_type, source_message_id = excluded.source_message_id, storage_key = excluded.storage_key, updated_at = excluded.updated_at, version = receipt_artifacts.version + 1"
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

  }

  async upsertStatementCharge(context: WorkspaceContext, charge: StatementCharge) {
    const now = new Date().toISOString();
    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT INTO statement_charges (id, workspace_id, payload_json, statement_import_id, match_status, transaction_date, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, match_status = excluded.match_status, updated_at = excluded.updated_at, version = statement_charges.version + 1"
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

  }
}
