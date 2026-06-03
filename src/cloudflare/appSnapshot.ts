import { cloneReports, createDefaultReport, normalizeExpensesWithReports, syncReportsWithExpenses } from "../app/appState";
import type { AppSnapshot, ExportPackage } from "../domain/types";
import type { CloudRecordVersions, CloudSnapshot } from "./types";

const emptyRecordVersions = (): CloudRecordVersions => ({
  expenses: {},
  reports: {},
  receiptArtifacts: {},
  statementCharges: {},
  exportPackages: {}
});

function normalizeRecordVersions(input?: Partial<CloudRecordVersions>): CloudRecordVersions {
  const defaults = emptyRecordVersions();
  return {
    expenses: { ...defaults.expenses, ...input?.expenses },
    reports: { ...defaults.reports, ...input?.reports },
    receiptArtifacts: { ...defaults.receiptArtifacts, ...input?.receiptArtifacts },
    statementCharges: { ...defaults.statementCharges, ...input?.statementCharges },
    exportPackages: { ...defaults.exportPackages, ...input?.exportPackages }
  };
}

export function normalizeCloudSnapshot(
  input: Partial<AppSnapshot> & {
    exportPackages?: ExportPackage[];
    recordVersions?: Partial<CloudRecordVersions>;
    workspaceId: string;
    userEmail: string;
  }
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
    exportPackages: input.exportPackages ?? [],
    recordVersions: normalizeRecordVersions(input.recordVersions)
  };
}
