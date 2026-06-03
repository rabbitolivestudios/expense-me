import { cloneReports, createDefaultReport, normalizeExpensesWithReports, syncReportsWithExpenses } from "../app/appState";
import type { AppSnapshot, ExportPackage } from "../domain/types";
import type { CloudSnapshot } from "./types";

export function normalizeCloudSnapshot(
  input: Partial<AppSnapshot> & { exportPackages?: ExportPackage[]; workspaceId: string; userEmail: string }
): CloudSnapshot {
  const reports = input.reports?.length ? cloneReports(input.reports) : [createDefaultReport()];
  const expenses = normalizeExpensesWithReports(input.expenses ?? [], reports);

  return {
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    expenses,
    receiptArtifacts: input.receiptArtifacts ?? [],
    reports: syncReportsWithExpenses(reports, expenses),
    statementCharges: input.statementCharges ?? [],
    exportPackages: input.exportPackages ?? []
  };
}
