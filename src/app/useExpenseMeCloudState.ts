import { useEffect, useMemo, useState } from "react";
import { CloudRepository, type CloudExportPackageResult } from "../client/cloudRepository";
import { hasMigrationMarker, markMigrationComplete, readV1LocalSnapshot } from "../client/localSnapshot";
import { normalizeCloudSnapshot } from "../cloudflare/appSnapshot";
import type { CloudSnapshot } from "../cloudflare/types";
import type { AppSnapshot, Expense, ReceiptArtifact, Report, StatementCharge } from "../domain/types";
import { createDefaultReport } from "./appState";

function emptyRecordVersions(): CloudSnapshot["recordVersions"] {
  return {
    expenses: {},
    reports: {},
    receiptArtifacts: {},
    statementCharges: {},
    exportPackages: {}
  };
}

export function emptyCloudSnapshot(): CloudSnapshot {
  const report = createDefaultReport();

  return normalizeCloudSnapshot({
    workspaceId: "",
    userEmail: "",
    expenses: [],
    receiptArtifacts: [],
    reports: [report],
    statementCharges: [],
    exportPackages: [],
    recordVersions: emptyRecordVersions()
  });
}

function cloudHasImportedData(snapshot: CloudSnapshot) {
  return snapshot.expenses.length > 0 ||
    snapshot.receiptArtifacts.length > 0 ||
    snapshot.statementCharges.length > 0 ||
    snapshot.reports.some((report) => report.expenseIds.length > 0 || report.id !== "report-current");
}

export interface ExpenseMeCloudState {
  loading: boolean;
  error: string | null;
  snapshot: CloudSnapshot;
  localSnapshotForMigration?: AppSnapshot;
  setSnapshot: (snapshot: CloudSnapshot) => void;
  migrateLocalSnapshot: () => Promise<CloudSnapshot | undefined>;
  saveExpense: (expense: Expense, artifacts?: ReceiptArtifact[]) => Promise<CloudSnapshot>;
  deleteExpense: (expenseId: string) => Promise<CloudSnapshot>;
  saveExpenseFolder: (report: Report) => Promise<CloudSnapshot>;
  deleteExpenseFolder: (reportId: string) => Promise<CloudSnapshot>;
  importStatementCharges: (charges: StatementCharge[], reportId?: string) => Promise<CloudSnapshot>;
  syncEmail: (reportId?: string) => Promise<CloudSnapshot>;
  createExportPackage: (reportId: string) => Promise<CloudExportPackageResult>;
}

export function useExpenseMeCloudState(repository?: CloudRepository): ExpenseMeCloudState {
  const cloudRepository = useMemo(() => repository ?? new CloudRepository(), [repository]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CloudSnapshot>(() => emptyCloudSnapshot());
  const [localSnapshotForMigration, setLocalSnapshotForMigration] = useState<AppSnapshot | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const nextSnapshot = await cloudRepository.bootstrap();
        if (cancelled) return;

        setSnapshot(nextSnapshot);

        const localSnapshot = readV1LocalSnapshot();
        if (!cloudHasImportedData(nextSnapshot) && localSnapshot && !hasMigrationMarker()) {
          setLocalSnapshotForMigration(localSnapshot);
        } else {
          setLocalSnapshotForMigration(undefined);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Cloud data failed to load.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [cloudRepository]);

  async function mutate(operation: () => Promise<CloudSnapshot>) {
    setError(null);
    try {
      const nextSnapshot = await operation();
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Cloud data update failed.";
      setError(message);
      throw nextError;
    }
  }

  return useMemo(() => ({
    loading,
    error,
    snapshot,
    localSnapshotForMigration,
    setSnapshot,
    migrateLocalSnapshot: async () => {
      if (!localSnapshotForMigration) return undefined;

      const nextSnapshot = await mutate(() => cloudRepository.migrateLocalSnapshot(localSnapshotForMigration));
      markMigrationComplete();
      setLocalSnapshotForMigration(undefined);
      return nextSnapshot;
    },
    saveExpense: (expense: Expense, artifacts: ReceiptArtifact[] = []) =>
      mutate(() => cloudRepository.saveExpense(expense, artifacts, snapshot.recordVersions.expenses[expense.id])),
    deleteExpense: (expenseId: string) =>
      mutate(() => cloudRepository.deleteExpense(expenseId, snapshot.recordVersions.expenses[expenseId])),
    saveExpenseFolder: (report: Report) =>
      mutate(() => cloudRepository.saveExpenseFolder(report, snapshot.recordVersions.reports[report.id])),
    deleteExpenseFolder: (reportId: string) =>
      mutate(() => cloudRepository.deleteExpenseFolder(reportId, snapshot.recordVersions.reports[reportId])),
    importStatementCharges: (charges: StatementCharge[], reportId?: string) =>
      mutate(() => cloudRepository.importStatementCharges(charges, reportId)),
    syncEmail: (reportId?: string) =>
      mutate(() => cloudRepository.syncEmail(reportId)),
    createExportPackage: (reportId: string) =>
      cloudRepository.createExportPackage(reportId, {
        employeeName: "Thiago Oliveira",
        reportReference: reportId
      })
  }), [cloudRepository, error, loading, localSnapshotForMigration, snapshot]);
}
