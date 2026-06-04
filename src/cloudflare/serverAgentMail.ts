import { createDefaultReport, defaultFolderId } from "../app/appState";
import type { Expense, ReceiptArtifact, Report } from "../domain/types";
import {
  createExpenseFromEmailMessage,
  mergeEmailExpenseRepair,
  shouldRepairEmailExpense
} from "../features/email/emailExpense";
import {
  normalizeAgentMailMessages,
  type AgentMailMessageSummary
} from "../features/email/agentMailSync";
import type { MutationResult } from "./d1Repository";
import type { CloudSnapshot, CloudflareEnv, WorkspaceContext } from "./types";

interface AgentMailConfig {
  apiKey: string;
  inboxId: string;
  baseUrl: string;
}

interface AgentMailSyncRepository {
  getSnapshot(context: WorkspaceContext): Promise<CloudSnapshot>;
  upsertExpense(
    context: WorkspaceContext,
    expense: Expense,
    options: { expectedVersion?: number }
  ): Promise<MutationResult>;
  upsertReceiptArtifact(
    context: WorkspaceContext,
    artifact: ReceiptArtifact,
    options: { expectedVersion?: number }
  ): Promise<MutationResult>;
  addExpensesToFolder?(
    context: WorkspaceContext,
    snapshot: CloudSnapshot,
    reportId: string | undefined,
    expenseIds: string[]
  ): Promise<void>;
  upsertExpenseFolder?(
    context: WorkspaceContext,
    report: Report,
    options: { expectedVersion?: number }
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
}

export interface ServerAgentMailSyncOptions {
  targetReportId?: string;
  fetcher?: typeof fetch;
}

function requireAgentMailConfig(env: CloudflareEnv): AgentMailConfig {
  if (!env.AGENTMAIL_API_KEY) {
    throw new Error("AgentMail is not configured.");
  }

  return {
    apiKey: env.AGENTMAIL_API_KEY,
    inboxId: env.AGENTMAIL_INBOX_ID || "expense-me@agentmail.to",
    baseUrl: (env.AGENTMAIL_BASE_URL || "https://api.agentmail.to").replace(/\/+$/, "")
  };
}

async function agentMailRequest<T>(
  env: CloudflareEnv,
  path: string,
  fetcher: typeof fetch = fetch
): Promise<T> {
  const config = requireAgentMailConfig(env);
  const response = await fetcher(`${config.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` }
  });

  if (!response.ok) {
    throw new Error(`AgentMail request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function unwrapAgentMailMessage(body: unknown, messageId: string): AgentMailMessageSummary {
  if (body && typeof body === "object" && "message" in body) {
    const nested = (body as { message?: unknown }).message;
    if (nested && typeof nested === "object") {
      return { message_id: messageId, ...(nested as Partial<AgentMailMessageSummary>) };
    }
  }

  return { message_id: messageId, ...(body as Partial<AgentMailMessageSummary>) };
}

export async function listServerAgentMailMessages(
  env: CloudflareEnv,
  fetcher: typeof fetch = fetch
): Promise<AgentMailMessageSummary[]> {
  const config = requireAgentMailConfig(env);
  const inbox = encodeURIComponent(config.inboxId);
  const body = await agentMailRequest<{ messages?: AgentMailMessageSummary[] } | AgentMailMessageSummary[]>(
    env,
    `/v0/inboxes/${inbox}/messages`,
    fetcher
  );

  return normalizeAgentMailMessages(Array.isArray(body) ? body : body.messages ?? []);
}

export async function getServerAgentMailMessage(
  env: CloudflareEnv,
  messageId: string,
  fetcher: typeof fetch = fetch
): Promise<AgentMailMessageSummary> {
  const config = requireAgentMailConfig(env);
  const inbox = encodeURIComponent(config.inboxId);
  const message = encodeURIComponent(messageId);
  const body = await agentMailRequest<AgentMailMessageSummary | { message?: AgentMailMessageSummary }>(
    env,
    `/v0/inboxes/${inbox}/messages/${message}`,
    fetcher
  );

  return unwrapAgentMailMessage(body, messageId);
}

function targetReportId(snapshot: CloudSnapshot, requestedReportId?: string) {
  if (requestedReportId && snapshot.reports.some((report) => report.id === requestedReportId)) {
    return requestedReportId;
  }

  return snapshot.reports[0]?.id ?? createDefaultReport().id ?? defaultFolderId;
}

function hasValidFolder(snapshot: CloudSnapshot, expense: Expense) {
  return Boolean(
    expense.reportId &&
    snapshot.reports.some((report) => report.id === expense.reportId && report.expenseIds.includes(expense.id))
  );
}

function textDataUrl(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:text/plain;base64,${btoa(binary)}`;
}

function artifactWithBodyData(artifact: ReceiptArtifact) {
  return artifact.dataUrl ? artifact : { ...artifact, dataUrl: textDataUrl(artifact.extractedText ?? "") };
}

function shouldUpgradeEmailArtifact(existing: ReceiptArtifact | undefined, next: ReceiptArtifact) {
  return next.artifactType === "EmailBody" &&
    next.mimeType === "text/html" &&
    Boolean(next.dataUrl) &&
    (!existing || existing.mimeType !== "text/html");
}

async function recordSyncFailure(
  repository: AgentMailSyncRepository,
  context: WorkspaceContext,
  input: {
    startedAt: string;
    attemptedCount: number;
    importedCount: number;
    repairedCount: number;
    skippedCount: number;
    errorMessage: string;
  }
) {
  try {
    await repository.recordSyncRun?.(context, {
      source: "AgentMail",
      attemptedCount: input.attemptedCount,
      importedCount: input.importedCount,
      repairedCount: input.repairedCount,
      skippedCount: input.skippedCount,
      errorMessage: input.errorMessage,
      startedAt: input.startedAt,
      finishedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Email sync run failure could not be recorded.", error);
  }
}

export async function syncServerAgentMail(
  env: CloudflareEnv,
  context: WorkspaceContext,
  repository: AgentMailSyncRepository,
  options: ServerAgentMailSyncOptions = {}
): Promise<MutationResult> {
  const startedAt = new Date().toISOString();
  let attemptedCount = 0;
  let importedCount = 0;
  let repairedCount = 0;
  let skippedCount = 0;

  try {
    const summaries = await listServerAgentMailMessages(env, options.fetcher);
    const messages = await Promise.all(
      summaries.map(async (summary) => {
        try {
          const detail = await getServerAgentMailMessage(env, summary.message_id, options.fetcher);
          return { ...summary, ...detail, message_id: summary.message_id };
        } catch {
          return summary;
        }
      })
    );
    const snapshot = await repository.getSnapshot(context);
    const reportId = targetReportId(snapshot, options.targetReportId);
    const existingExpensesById = new Map(snapshot.expenses.map((expense) => [expense.id, expense]));
    const bundles = messages.map(createExpenseFromEmailMessage);
    const newBundles = bundles.filter((bundle) => !existingExpensesById.has(bundle.expense.id));
    const repairBundles = bundles
      .map((bundle) => ({ bundle, existing: existingExpensesById.get(bundle.expense.id) }))
      .filter((item): item is { bundle: (typeof bundles)[number]; existing: Expense } =>
        item.existing !== undefined && shouldRepairEmailExpense(item.existing, item.bundle.expense)
      );
    const repairExpenseIds = new Set(repairBundles.map(({ existing }) => existing.id));
    const artifactsById = new Map(snapshot.receiptArtifacts.map((artifact) => [artifact.id, artifact]));
    const artifactUpgradeBundles = bundles
      .map((bundle) => ({ bundle, existing: existingExpensesById.get(bundle.expense.id) }))
      .filter((item): item is { bundle: (typeof bundles)[number]; existing: Expense } => item.existing !== undefined)
      .filter(({ bundle, existing }) => {
        if (repairExpenseIds.has(existing.id)) return false;
        const artifactId = existing.receiptArtifactIds[0] ?? bundle.artifact.id;
        return shouldUpgradeEmailArtifact(artifactsById.get(artifactId), bundle.artifact);
      });
    const expenseIdsForFolder: string[] = [];

    attemptedCount = messages.length;

    for (const bundle of newBundles) {
      const expense = { ...bundle.expense, reportId };
      await repository.upsertReceiptArtifact(context, artifactWithBodyData(bundle.artifact), {});
      await repository.upsertExpense(context, expense, {});
      expenseIdsForFolder.push(expense.id);
      importedCount += 1;
    }

    for (const { bundle, existing } of repairBundles) {
      const receiptArtifactIds = existing.receiptArtifactIds.length > 0 ? existing.receiptArtifactIds : bundle.expense.receiptArtifactIds;
      const artifactId = receiptArtifactIds[0] ?? bundle.artifact.id;
      const repairedExpense = mergeEmailExpenseRepair(existing, bundle.expense, receiptArtifactIds);
      const needsFolderAssignment = !hasValidFolder(snapshot, existing);
      const expense = needsFolderAssignment ? { ...repairedExpense, reportId } : repairedExpense;
      const artifact = artifactWithBodyData({ ...bundle.artifact, id: artifactId });

      await repository.upsertReceiptArtifact(context, artifact, {
        expectedVersion: snapshot.recordVersions.receiptArtifacts[artifact.id]
      });
      await repository.upsertExpense(context, expense, {
        expectedVersion: snapshot.recordVersions.expenses[existing.id]
      });
      if (needsFolderAssignment) {
        expenseIdsForFolder.push(expense.id);
      }
      repairedCount += 1;
    }

    for (const { bundle, existing } of artifactUpgradeBundles) {
      const artifactId = existing.receiptArtifactIds[0] ?? bundle.artifact.id;
      const artifact = artifactWithBodyData({ ...bundle.artifact, id: artifactId });

      await repository.upsertReceiptArtifact(context, artifact, {
        expectedVersion: snapshot.recordVersions.receiptArtifacts[artifact.id]
      });
      repairedCount += 1;
    }

    skippedCount = messages.length - importedCount - repairedCount;
    await repository.addExpensesToFolder?.(context, snapshot, reportId, expenseIdsForFolder);

    const finishedAt = new Date().toISOString();
    await repository.recordSyncRun?.(context, {
      source: "AgentMail",
      attemptedCount,
      importedCount,
      repairedCount,
      skippedCount,
      startedAt,
      finishedAt
    });

    return { snapshot: await repository.getSnapshot(context) };
  } catch (error) {
    await recordSyncFailure(repository, context, {
      startedAt,
      attemptedCount,
      importedCount,
      repairedCount,
      skippedCount,
      errorMessage: error instanceof Error ? error.message : "Email sync failed."
    });
    throw error;
  }
}
