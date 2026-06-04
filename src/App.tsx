import { useEffect, useRef, useState } from "react";
import {
  cloneReports,
  createDefaultReport,
  createExpenseFolderRecord,
  defaultFolderId,
  reportLabelForExpenseIds
} from "./app/appState";
import type { ExpenseFolderDates } from "./app/appState";
import { useExpenseMeCloudState } from "./app/useExpenseMeCloudState";
import { normalizeCloudSnapshot } from "./cloudflare/appSnapshot";
import type { CloudSnapshot } from "./cloudflare/types";
import type { Expense, ReceiptArtifact, Report, StatementCharge } from "./domain/types";
import { CaptureSheet } from "./features/capture/CaptureSheet";
import { ExpenseDetailScreen } from "./features/expense/ExpenseDetailScreen";
import { ExportScreen } from "./features/export/ExportScreen";
import { shareOrDownloadZip } from "./features/export/shareExportPackage";
import { InboxScreen } from "./features/inbox/InboxScreen";
import { ReportsScreen } from "./features/reports/ReportsScreen";
import { CardsScreen } from "./features/statements/CardsScreen";
import { reconcileStatementCharges } from "./features/statements/reconciliation";
import { AppShell } from "./features/shell/AppShell";
import { useTheme } from "./features/shell/useTheme";
import type { ScreenName } from "./features/shell/BottomNav";
import "./styles/app.css";

const activeReportPreferenceKey = "expense-me-v15-active-report";

function normalizeSnapshotParts(current: CloudSnapshot, parts: Partial<CloudSnapshot>) {
  return normalizeCloudSnapshot({
    ...current,
    ...parts,
    workspaceId: current.workspaceId,
    userEmail: current.userEmail,
    exportPackages: parts.exportPackages ?? current.exportPackages,
    recordVersions: current.recordVersions
  });
}

function cloudUpdateError(_error: unknown) {
  return undefined;
}

function readActiveReportPreference() {
  try {
    return window.localStorage.getItem(activeReportPreferenceKey) ?? defaultFolderId;
  } catch {
    return defaultFolderId;
  }
}

function writeActiveReportPreference(reportId: string) {
  try {
    window.localStorage.setItem(activeReportPreferenceKey, reportId);
  } catch {
    // The active folder preference is transient UI state; cloud data remains authoritative.
  }
}

function safeDownloadName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "Expense-Folder";
}

export default function App() {
  const cloudState = useExpenseMeCloudState();
  const [screen, setScreen] = useState<ScreenName>("Inbox");
  const [activeReportId, setActiveReportId] = useState(readActiveReportPreference);
  const activeReportIdRef = useRef(activeReportId);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const snapshotRef = useRef(cloudState.snapshot);
  const expenses = cloudState.snapshot.expenses;
  const receiptArtifacts = cloudState.snapshot.receiptArtifacts;
  const reports = cloudState.snapshot.reports;
  const statementCharges = cloudState.snapshot.statementCharges;
  const expensesRef = useRef(expenses);
  const reportsRef = useRef(reports);
  const selectedExpense = expenses.find((expense) => expense.id === selectedExpenseId);
  const activeReport = reports.find((report) => report.id === activeReportId) ?? reports[0];
  const currentActiveReportId = activeReport?.id ?? defaultFolderId;
  const { theme, toggleTheme } = useTheme();
  const emailSyncPromiseRef = useRef<Promise<number> | null>(null);

  useEffect(() => {
    snapshotRef.current = cloudState.snapshot;
    expensesRef.current = cloudState.snapshot.expenses;
    reportsRef.current = cloudState.snapshot.reports;
  }, [cloudState.snapshot]);

  useEffect(() => {
    activeReportIdRef.current = currentActiveReportId;
  }, [currentActiveReportId]);

  useEffect(() => {
    if (!cloudState.loading && reports.length > 0 && !reports.some((report) => report.id === activeReportId)) {
      changeActiveReport(reports[0].id);
    }
  }, [cloudState.loading, reports, activeReportId]);

  function setLocalSnapshot(parts: Partial<CloudSnapshot>) {
    const nextSnapshot = normalizeSnapshotParts(snapshotRef.current, parts);
    snapshotRef.current = nextSnapshot;
    expensesRef.current = nextSnapshot.expenses;
    reportsRef.current = nextSnapshot.reports;
    cloudState.setSnapshot(nextSnapshot);
  }

  function changeScreen(nextScreen: ScreenName) {
    setSelectedExpenseId(null);
    setScreen(nextScreen);
  }

  function changeActiveReport(reportId: string) {
    activeReportIdRef.current = reportId;
    writeActiveReportPreference(reportId);
    setActiveReportId(reportId);
  }

  function saveExpense(updatedExpense: Expense) {
    const nextExpenses = expensesRef.current.map((expense) => (expense.id === updatedExpense.id ? updatedExpense : expense));

    setLocalSnapshot({ expenses: nextExpenses });
    void cloudState.saveExpense(updatedExpense).catch(cloudUpdateError);
    setSelectedExpenseId(null);
  }

  function assignExpenseFolder(expenseId: string, reportId: string) {
    const updatedExpense = expensesRef.current.find((expense) => expense.id === expenseId);
    if (!updatedExpense) return;

    const nextExpense = { ...updatedExpense, reportId };
    const nextExpenses = expensesRef.current.map((expense) => (expense.id === expenseId ? nextExpense : expense));
    setLocalSnapshot({ expenses: nextExpenses });
    void cloudState.saveExpense(nextExpense).catch(cloudUpdateError);
  }

  function renameExpense(expenseId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const nextExpenses = expensesRef.current.map((expense) =>
      expense.id === expenseId
        ? expense.merchant
          ? { ...expense, merchant: trimmedName }
          : { ...expense, description: trimmedName }
        : expense
    );
    const updatedExpense = nextExpenses.find((expense) => expense.id === expenseId);

    setLocalSnapshot({ expenses: nextExpenses });
    if (updatedExpense) {
      void cloudState.saveExpense(updatedExpense).catch(cloudUpdateError);
    }
  }

  function createExpenseFolder(name: string, dates: ExpenseFolderDates = {}) {
    const existingIds = new Set(reportsRef.current.map((report) => report.id));
    const report = createExpenseFolderRecord(name, dates, new Date(), existingIds);
    if (!report) return undefined;

    setLocalSnapshot({ reports: [report, ...reportsRef.current] });
    void cloudState.saveExpenseFolder(report).catch(cloudUpdateError);
    return report;
  }

  function renameExpenseFolder(reportId: string, name: string, dates?: ExpenseFolderDates) {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    let updatedReport: Report | undefined;
    const nextReports = reportsRef.current.map((report) => {
      if (report.id !== reportId) return report;

      const startDate = dates ? dates.startDate || undefined : report.startDate;
      const endDate = dates ? dates.endDate || startDate : report.endDate;

      updatedReport = {
        ...report,
        name: trimmedName,
        startDate,
        endDate,
        dateRangeLabel: ""
      };
      updatedReport.dateRangeLabel = reportLabelForExpenseIds(updatedReport, updatedReport.expenseIds);

      return updatedReport;
    });

    setLocalSnapshot({ reports: nextReports });
    if (updatedReport) {
      void cloudState.saveExpenseFolder(updatedReport).catch(cloudUpdateError);
    }
  }

  function deleteExpenseFolder(reportId: string) {
    const currentReports = reportsRef.current;
    if (currentReports.length <= 1) return;

    const target = currentReports.find((report) => report.id === reportId);
    if (!target || target.expenseIds.length > 0) return;

    const nextReports = currentReports.filter((report) => report.id !== reportId);
    setLocalSnapshot({ reports: nextReports });
    void cloudState.deleteExpenseFolder(reportId).catch(cloudUpdateError);

    if (activeReportIdRef.current === reportId && nextReports[0]) {
      changeActiveReport(nextReports[0].id);
    }
  }

  function deleteExpense(expenseId: string) {
    const deletedExpense = expensesRef.current.find((expense) => expense.id === expenseId);
    const nextExpenses = expensesRef.current.filter((expense) => expense.id !== expenseId);
    const usedArtifactIds = new Set(nextExpenses.flatMap((expense) => expense.receiptArtifactIds));
    const nextCharges = statementCharges.map((charge) =>
      charge.matchedExpenseId === expenseId || charge.id === deletedExpense?.statementChargeMatchId
        ? { ...charge, matchStatus: "Unmatched" as const, matchedExpenseId: undefined }
        : charge
    );

    setLocalSnapshot({
      expenses: nextExpenses,
      receiptArtifacts: receiptArtifacts.filter((artifact) => usedArtifactIds.has(artifact.id)),
      statementCharges: nextCharges
    });
    void cloudState.deleteExpense(expenseId).catch(cloudUpdateError);
    setSelectedExpenseId(null);
    setScreen("Inbox");
  }

  function createDeclaration(expense: Expense) {
    const updatedExpense: Expense = {
      ...expense,
      declarationId: `decl-${expense.id}`,
      status: "Ready"
    };
    const nextExpenses = expensesRef.current.map((item) => (item.id === expense.id ? updatedExpense : item));
    const nextReports = reportsRef.current.map((report) => ({
      ...report,
      expenseIds:
        report.id === updatedExpense.reportId
          ? [updatedExpense.id, ...report.expenseIds.filter((id) => id !== updatedExpense.id)]
          : report.expenseIds.filter((id) => id !== updatedExpense.id)
    })).map((report) => ({ ...report, dateRangeLabel: reportLabelForExpenseIds(report, report.expenseIds) }));

    setLocalSnapshot({ expenses: nextExpenses, reports: nextReports });
    void cloudState.saveExpense(updatedExpense).catch(cloudUpdateError);
  }

  function addExpense(expense: Expense, artifacts: ReceiptArtifact[] = []) {
    const reportId = currentActiveReportId;
    const assignedExpense = { ...expense, reportId };

    setLocalSnapshot({
      expenses: [assignedExpense, ...expensesRef.current],
      receiptArtifacts: [
        ...artifacts,
        ...receiptArtifacts.filter((artifact) => !artifacts.some((nextArtifact) => nextArtifact.id === artifact.id))
      ]
    });
    void cloudState.saveExpense(assignedExpense, artifacts).catch(cloudUpdateError);
    setSelectedExpenseId(assignedExpense.id);
    setScreen("Inbox");
  }

  function syncEmail() {
    if (emailSyncPromiseRef.current) {
      return emailSyncPromiseRef.current;
    }

    const targetReportId = currentActiveReportId;
    const beforeIds = new Set(snapshotRef.current.expenses.map((expense) => expense.id));
    emailSyncPromiseRef.current = cloudState.syncEmail(targetReportId)
      .then((nextSnapshot) => nextSnapshot.expenses.filter((expense) => !beforeIds.has(expense.id)).length)
      .finally(() => {
        emailSyncPromiseRef.current = null;
      });

    return emailSyncPromiseRef.current;
  }

  function importStatementCharges(charges: StatementCharge[]) {
    const beforeExpenseIds = new Set(expensesRef.current.map((expense) => expense.id));
    const reconciled = reconcileStatementCharges(expensesRef.current, charges);
    const reportId = currentActiveReportId;
    const createdExpenseIds = new Set(reconciled.createdExpenseIds);
    const nextExpenses = reconciled.expenses.map((expense) =>
      createdExpenseIds.has(expense.id) && !expense.reportId ? { ...expense, reportId } : expense
    );

    setLocalSnapshot({
      expenses: nextExpenses,
      statementCharges: [
        ...reconciled.charges,
        ...statementCharges.filter((charge) => !reconciled.charges.some((nextCharge) => nextCharge.id === charge.id))
      ]
    });
    void cloudState.importStatementCharges(charges, reportId).catch(cloudUpdateError);

    return {
      importedCount: charges.length,
      matchedCount: reconciled.matchedExpenseIds.length,
      createdCount: nextExpenses.filter((expense) => !beforeExpenseIds.has(expense.id)).length
    };
  }

  async function generateCloudExportPackage(reportId: string) {
    const result = await cloudState.createExportPackage(reportId);
    const reportName =
      reportsRef.current.find((report) => report.id === result.exportPackage.reportId)?.name ??
      reportsRef.current.find((report) => report.id === reportId)?.name ??
      result.exportPackage.id;
    const response = await globalThis.fetch(result.downloadUrl);
    if (!response.ok) {
      throw new Error(`Export Package download failed: ${response.status}`);
    }

    const contentType = response.headers.get("Content-Type") ?? "application/zip";
    if (contentType.includes("text/html")) {
      throw new Error("Export Package download returned HTML instead of a zip file.");
    }

    const blob = await response.blob();
    await shareOrDownloadZip(blob, `Expense-Me-${safeDownloadName(reportName)}.zip`);
  }

  return (
    <AppShell active={screen} onChange={changeScreen}>
      {cloudState.error && (
        <div className="persistence-alert" role="alert">
          {cloudState.error}
        </div>
      )}
      {cloudState.loading && (
        <div className="persistence-alert" role="status">
          Loading cloud data...
        </div>
      )}
      {cloudState.localSnapshotForMigration && (
        <div className="persistence-alert" role="alert">
          V1 browser data is available to import into cloud data.
          <button type="button" onClick={() => void cloudState.migrateLocalSnapshot()}>
            Import V1 Data
          </button>
        </div>
      )}
      {selectedExpense && (
        <ExpenseDetailScreen
          expense={selectedExpense}
          onBack={() => setSelectedExpenseId(null)}
          onCreateDeclaration={createDeclaration}
          onCreateExpenseFolder={createExpenseFolder}
          onDelete={deleteExpense}
          reports={reports}
          onSave={saveExpense}
        />
      )}
      {!selectedExpense && screen === "Inbox" && (
        <InboxScreen
          expenses={expenses}
          onCapture={() => changeScreen("Capture")}
          onAssignExpenseFolder={assignExpenseFolder}
          onCreateExpenseFolder={createExpenseFolder}
          onRenameExpense={renameExpense}
          onOpenExport={() => changeScreen("Export")}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenCards={() => changeScreen("Cards")}
          onOpenExpense={setSelectedExpenseId}
          onDeleteExpense={deleteExpense}
          reports={reports}
          activeReportId={currentActiveReportId}
          onActiveReportChange={changeActiveReport}
          onSyncEmail={syncEmail}
        />
      )}
      {!selectedExpense && screen === "Capture" && (
        <CaptureSheet
          onClose={() => changeScreen("Inbox")}
          onExpenseCreated={addExpense}
          onOpenCards={() => changeScreen("Cards")}
          onSyncEmail={syncEmail}
        />
      )}
      {!selectedExpense && screen === "Reports" && (
        <ReportsScreen
          reports={reports}
          onBack={() => changeScreen("Inbox")}
          onCreateReport={createExpenseFolder}
          onDeleteReport={deleteExpenseFolder}
          onRenameReport={renameExpenseFolder}
        />
      )}
      {!selectedExpense && screen === "Cards" && (
        <CardsScreen
          statementCharges={statementCharges}
          onStatementImported={importStatementCharges}
          onBack={() => changeScreen("Inbox")}
        />
      )}
      {!selectedExpense && screen === "Export" && (
        <ExportScreen
          reports={reports}
          expenses={expenses}
          receiptArtifacts={receiptArtifacts}
          onBack={() => changeScreen("Inbox")}
          onGenerateExportPackage={generateCloudExportPackage}
        />
      )}
    </AppShell>
  );
}
