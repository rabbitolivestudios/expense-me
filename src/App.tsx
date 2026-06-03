import { useEffect, useRef, useState } from "react";
import {
  cloneReports,
  createDefaultReport,
  createExpenseFolderRecord,
  defaultFolderId,
  normalizeExpensesWithReports,
  reportLabelForExpenseIds,
  syncReportsWithExpenses
} from "./app/appState";
import type { ExpenseFolderDates } from "./app/appState";
import type { Expense, ReceiptArtifact, Report, StatementCharge } from "./domain/types";
import { CaptureSheet } from "./features/capture/CaptureSheet";
import { fetchAgentMailMessages } from "./features/email/agentMailSync";
import { createExpenseFromEmailMessage, mergeEmailExpenseRepair, shouldRepairEmailExpense } from "./features/email/emailExpense";
import { ExpenseDetailScreen } from "./features/expense/ExpenseDetailScreen";
import { ExportScreen } from "./features/export/ExportScreen";
import { InboxScreen } from "./features/inbox/InboxScreen";
import { ReportsScreen } from "./features/reports/ReportsScreen";
import { CardsScreen } from "./features/statements/CardsScreen";
import { reconcileStatementCharges } from "./features/statements/reconciliation";
import { AppShell } from "./features/shell/AppShell";
import { useTheme } from "./features/shell/useTheme";
import type { ScreenName } from "./features/shell/BottomNav";
import "./styles/app.css";

const storageKey = "expense-me-v1-live-state";
const recoveryStorageKey = `${storageKey}:recovery`;

interface PersistedAppState {
  expenses: Expense[];
  receiptArtifacts: ReceiptArtifact[];
  reports: Report[];
  statementCharges: StatementCharge[];
  activeReportId?: string;
}

interface PersistedStateLoad {
  state?: PersistedAppState;
  failed: boolean;
  raw?: string;
}

function requiredArray<T>(parsed: Partial<Record<keyof PersistedAppState, unknown>>, key: keyof PersistedAppState) {
  const value = parsed[key];

  return Array.isArray(value) ? (value as T[]) : undefined;
}

function optionalArray<T>(parsed: Partial<Record<keyof PersistedAppState, unknown>>, key: keyof PersistedAppState) {
  const value = parsed[key];
  if (value === undefined) return [];

  return Array.isArray(value) ? (value as T[]) : undefined;
}

function migrateReports(parsed: Partial<Record<keyof PersistedAppState, unknown>>, expenses: Expense[]) {
  const value = parsed.reports;

  if (value === undefined) {
    return [createDefaultReport(expenses.map((expense) => expense.id))];
  }

  return Array.isArray(value) ? cloneReports(value as Report[]) : undefined;
}

function loadPersistedState(): PersistedStateLoad {
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(storageKey);
    if (!raw) return { failed: false };

    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    const expenses = requiredArray<Expense>(parsed, "expenses");
    const receiptArtifacts = requiredArray<ReceiptArtifact>(parsed, "receiptArtifacts");
    const statementCharges = optionalArray<StatementCharge>(parsed, "statementCharges");

    if (!expenses || !receiptArtifacts || !statementCharges) {
      return { failed: true, raw };
    }
    const reports = migrateReports(parsed, expenses);

    if (!reports) return { failed: true, raw };

    return {
      failed: false,
      state: {
        expenses,
        receiptArtifacts,
        reports: cloneReports(reports),
        statementCharges,
        activeReportId: typeof parsed.activeReportId === "string" ? parsed.activeReportId : undefined
      }
    };
  } catch {
    return { failed: true, raw: raw ?? undefined };
  }
}

function persistState(state: PersistedAppState) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function backupFailedState(raw: string) {
  try {
    window.localStorage.setItem(
      recoveryStorageKey,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        storageKey,
        raw
      })
    );
    return true;
  } catch {
    return false;
  }
}

export default function App() {
  const [initialAppState] = useState(() => {
    const persistedLoad = loadPersistedState();
    const persistedState = persistedLoad.state;
    const baseReports = persistedState?.reports?.length ? cloneReports(persistedState.reports) : [createDefaultReport()];
    const initialExpenses = normalizeExpensesWithReports(persistedState?.expenses ?? [], baseReports);
    const initialActiveReportId =
      persistedState?.activeReportId && baseReports.some((report) => report.id === persistedState.activeReportId)
        ? persistedState.activeReportId
        : (baseReports[0]?.id ?? defaultFolderId);

    return {
      persistedState,
      persistenceLoadFailed: persistedLoad.failed,
      initialExpenses,
      initialReports: syncReportsWithExpenses(baseReports, initialExpenses),
      initialActiveReportId,
      failedRawState: persistedLoad.raw
    };
  });
  const [screen, setScreen] = useState<ScreenName>("Inbox");
  const [expenses, setExpenses] = useState<Expense[]>(() => initialAppState.initialExpenses);
  const expensesRef = useRef<Expense[]>(initialAppState.initialExpenses);
  const [receiptArtifacts, setReceiptArtifacts] = useState<ReceiptArtifact[]>(() => initialAppState.persistedState?.receiptArtifacts ?? []);
  const [reports, setReports] = useState<Report[]>(() => initialAppState.initialReports);
  const reportsRef = useRef<Report[]>(initialAppState.initialReports);
  const [activeReportId, setActiveReportId] = useState(initialAppState.initialActiveReportId);
  const activeReportIdRef = useRef(initialAppState.initialActiveReportId);
  const persistenceAllowedRef = useRef(!initialAppState.persistenceLoadFailed);
  const failedRawStateRef = useRef(initialAppState.failedRawState);
  const recoveryBackupSavedRef = useRef(false);
  const [statementCharges, setStatementCharges] = useState<StatementCharge[]>(() => initialAppState.persistedState?.statementCharges ?? []);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState(initialAppState.persistenceLoadFailed);
  const selectedExpense = expenses.find((expense) => expense.id === selectedExpenseId);
  const activeReport = reports.find((report) => report.id === activeReportId) ?? reports[0];
  const currentActiveReportId = activeReport?.id ?? defaultFolderId;
  const { theme, toggleTheme } = useTheme();
  const emailSyncPromiseRef = useRef<Promise<number> | null>(null);

  useEffect(() => {
    expensesRef.current = expenses;
  }, [expenses]);

  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);

  useEffect(() => {
    activeReportIdRef.current = currentActiveReportId;
  }, [currentActiveReportId]);

  useEffect(() => {
    if (!persistenceAllowedRef.current) {
      setPersistenceError(true);
      return;
    }
    if (failedRawStateRef.current && !recoveryBackupSavedRef.current) {
      const backedUp = backupFailedState(failedRawStateRef.current);
      if (!backedUp) {
        setPersistenceError(true);
        return;
      }
      recoveryBackupSavedRef.current = true;
    }

    const persisted = persistState({ expenses, receiptArtifacts, reports, statementCharges, activeReportId: currentActiveReportId });
    setPersistenceError(!persisted);
  }, [expenses, receiptArtifacts, reports, statementCharges, currentActiveReportId]);

  useEffect(() => {
    if (reports.length > 0 && !reports.some((report) => report.id === activeReportId)) {
      changeActiveReport(reports[0].id);
    }
  }, [reports, activeReportId]);

  function changeScreen(nextScreen: ScreenName) {
    setSelectedExpenseId(null);
    setScreen(nextScreen);
  }

  function allowPersistenceAfterUserChange() {
    persistenceAllowedRef.current = true;
  }

  function updateExpenses(updater: Expense[] | ((current: Expense[]) => Expense[])) {
    allowPersistenceAfterUserChange();
    setExpenses((current) => {
      const nextExpenses = typeof updater === "function" ? updater(current) : updater;
      expensesRef.current = nextExpenses;

      return nextExpenses;
    });
  }

  function updateReceiptArtifacts(updater: ReceiptArtifact[] | ((current: ReceiptArtifact[]) => ReceiptArtifact[])) {
    allowPersistenceAfterUserChange();
    setReceiptArtifacts((current) => (typeof updater === "function" ? updater(current) : updater));
  }

  function updateReports(updater: Report[] | ((current: Report[]) => Report[])) {
    allowPersistenceAfterUserChange();
    setReports((current) => {
      const nextReports = typeof updater === "function" ? updater(current) : updater;
      reportsRef.current = nextReports;

      return nextReports;
    });
  }

  function updateStatementCharges(updater: StatementCharge[] | ((current: StatementCharge[]) => StatementCharge[])) {
    allowPersistenceAfterUserChange();
    setStatementCharges((current) => (typeof updater === "function" ? updater(current) : updater));
  }

  function changeActiveReport(reportId: string) {
    allowPersistenceAfterUserChange();
    activeReportIdRef.current = reportId;
    setActiveReportId(reportId);
  }

  function saveExpense(updatedExpense: Expense) {
    updateExpenses((current) => current.map((expense) => (expense.id === updatedExpense.id ? updatedExpense : expense)));
    updateReports((current) =>
      current.map((report) => ({
        ...report,
        expenseIds:
          report.id === updatedExpense.reportId
            ? [updatedExpense.id, ...report.expenseIds.filter((id) => id !== updatedExpense.id)]
            : report.expenseIds.filter((id) => id !== updatedExpense.id)
      })).map((report) => ({ ...report, dateRangeLabel: reportLabelForExpenseIds(report, report.expenseIds) }))
    );
    setSelectedExpenseId(null);
  }

  function assignExpenseFolder(expenseId: string, reportId: string) {
    updateExpenses((current) => current.map((expense) => (expense.id === expenseId ? { ...expense, reportId } : expense)));
    updateReports((current) =>
      current.map((report) => ({
        ...report,
        expenseIds: report.id === reportId ? [expenseId, ...report.expenseIds.filter((id) => id !== expenseId)] : report.expenseIds.filter((id) => id !== expenseId)
      })).map((report) => ({ ...report, dateRangeLabel: reportLabelForExpenseIds(report, report.expenseIds) }))
    );
  }

  function renameExpense(expenseId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    updateExpenses((current) =>
      current.map((expense) =>
        expense.id === expenseId
          ? expense.merchant
            ? { ...expense, merchant: trimmedName }
            : { ...expense, description: trimmedName }
          : expense
      )
    );
  }

  function createExpenseFolder(name: string, dates: ExpenseFolderDates = {}) {
    const existingIds = new Set(reportsRef.current.map((report) => report.id));
    const report = createExpenseFolderRecord(name, dates, new Date(), existingIds);
    if (!report) return undefined;

    updateReports((current) => [report, ...current]);
    return report;
  }

  function renameExpenseFolder(reportId: string, name: string, dates?: ExpenseFolderDates) {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    updateReports((current) =>
      current.map((report) => {
        if (report.id !== reportId) return report;

        const startDate = dates ? dates.startDate || undefined : report.startDate;
        const endDate = dates ? dates.endDate || startDate : report.endDate;

        const updatedReport = {
          ...report,
          name: trimmedName,
          startDate,
          endDate,
          dateRangeLabel: ""
        };
        updatedReport.dateRangeLabel = reportLabelForExpenseIds(updatedReport, updatedReport.expenseIds);

        return updatedReport;
      })
    );
  }

  function deleteExpenseFolder(reportId: string) {
    const currentReports = reportsRef.current;
    if (currentReports.length <= 1) return;

    const target = currentReports.find((report) => report.id === reportId);
    if (!target || target.expenseIds.length > 0) return;

    const nextReports = currentReports.filter((report) => report.id !== reportId);
    updateReports(nextReports);

    if (activeReportIdRef.current === reportId && nextReports[0]) {
      changeActiveReport(nextReports[0].id);
    }
  }

  function deleteExpense(expenseId: string) {
    const deletedExpense = expenses.find((expense) => expense.id === expenseId);
    const nextExpenses = expenses.filter((expense) => expense.id !== expenseId);
    const usedArtifactIds = new Set(nextExpenses.flatMap((expense) => expense.receiptArtifactIds));

    updateExpenses(nextExpenses);
    updateReceiptArtifacts((current) => current.filter((artifact) => usedArtifactIds.has(artifact.id)));
    updateReports((current) =>
      current.map((report) => {
        const expenseIds = report.expenseIds.filter((id) => id !== expenseId);

        return {
          ...report,
          expenseIds,
          dateRangeLabel: reportLabelForExpenseIds(report, expenseIds)
        };
      })
    );
    updateStatementCharges((current) =>
      current.map((charge) =>
        charge.matchedExpenseId === expenseId || charge.id === deletedExpense?.statementChargeMatchId
          ? { ...charge, matchStatus: "Unmatched", matchedExpenseId: undefined }
          : charge
      )
    );
    setSelectedExpenseId(null);
    setScreen("Inbox");
  }

  function createDeclaration(expense: Expense) {
    const updatedExpense: Expense = {
      ...expense,
      declarationId: `decl-${expense.id}`,
      status: "Ready"
    };
    updateExpenses((current) => current.map((item) => (item.id === expense.id ? updatedExpense : item)));
  }

  function addExpensesToCurrentReport(expenseIds: string[], reportId = currentActiveReportId) {
    if (expenseIds.length === 0) return;

    updateReports((current) => {
      if (current.length === 0) {
        return [createDefaultReport(expenseIds)];
      }

      return current.map((report, index) =>
        report.id === reportId || (index === 0 && !current.some((item) => item.id === reportId))
          ? {
              ...report,
              expenseIds: [...expenseIds.filter((id) => !report.expenseIds.includes(id)), ...report.expenseIds]
            }
          : report
      ).map((report) => ({ ...report, dateRangeLabel: reportLabelForExpenseIds(report, report.expenseIds) }));
    });
  }

  function addExpense(expense: Expense, artifacts: ReceiptArtifact[] = []) {
    const reportId = currentActiveReportId;
    const assignedExpense = { ...expense, reportId };

    updateExpenses((current) => [assignedExpense, ...current]);
    if (artifacts.length > 0) {
      updateReceiptArtifacts((current) => [
        ...artifacts,
        ...current.filter((artifact) => !artifacts.some((nextArtifact) => nextArtifact.id === artifact.id))
      ]);
    }
    addExpensesToCurrentReport([assignedExpense.id], reportId);
    setSelectedExpenseId(assignedExpense.id);
    setScreen("Inbox");
  }

  async function runEmailSync(targetReportId: string) {
    const messages = await fetchAgentMailMessages();
    const emailBundles = messages.map(createExpenseFromEmailMessage);
    const existingExpensesById = new Map(expensesRef.current.map((expense) => [expense.id, expense]));
    const newBundles = emailBundles.filter((bundle) => !existingExpensesById.has(bundle.expense.id));
    const repairBundles = emailBundles
      .map((bundle) => ({ bundle, existing: existingExpensesById.get(bundle.expense.id) }))
      .filter((item): item is { bundle: (typeof emailBundles)[number]; existing: Expense } =>
        item.existing !== undefined && shouldRepairEmailExpense(item.existing, item.bundle.expense)
    );

    if (newBundles.length > 0 || repairBundles.length > 0) {
      const liveReports = reportsRef.current;
      const reportId = liveReports.some((report) => report.id === targetReportId)
        ? targetReportId
        : (liveReports[0]?.id ?? defaultFolderId);
      const emailExpenses = newBundles.map((bundle) => ({ ...bundle.expense, reportId }));
      const repairs = repairBundles.map(({ bundle, existing }) => {
        const receiptArtifactIds = existing.receiptArtifactIds.length > 0 ? existing.receiptArtifactIds : bundle.expense.receiptArtifactIds;
        const artifactId = receiptArtifactIds[0] ?? bundle.artifact.id;
        const hasValidFolder = Boolean(
          existing.reportId &&
          liveReports.some((report) => report.id === existing.reportId && report.expenseIds.includes(existing.id))
        );
        const repairedExpense = mergeEmailExpenseRepair(existing, bundle.expense, receiptArtifactIds);

        return {
          expense: hasValidFolder ? repairedExpense : { ...repairedExpense, reportId },
          artifact: { ...bundle.artifact, id: artifactId },
          addToReport: !hasValidFolder
        };
      });
      const repairedExpensesById = new Map(repairs.map((repair) => [repair.expense.id, repair.expense]));
      const emailArtifacts = [...newBundles.map((bundle) => bundle.artifact), ...repairs.map((repair) => repair.artifact)];
      const expenseIdsForReport = [
        ...emailExpenses.map((expense) => expense.id),
        ...repairs.filter((repair) => repair.addToReport).map((repair) => repair.expense.id)
      ];

      updateExpenses((current) => [
        ...emailExpenses,
        ...current.map((expense) => repairedExpensesById.get(expense.id) ?? expense)
      ]);
      updateReceiptArtifacts((current) => [
        ...emailArtifacts,
        ...current.filter((artifact) => !emailArtifacts.some((nextArtifact) => nextArtifact.id === artifact.id))
      ]);
      addExpensesToCurrentReport(expenseIdsForReport, reportId);
    }

    return newBundles.length + repairBundles.length;
  }

  function syncEmail() {
    if (emailSyncPromiseRef.current) {
      return emailSyncPromiseRef.current;
    }

    const targetReportId = currentActiveReportId;
    emailSyncPromiseRef.current = runEmailSync(targetReportId).finally(() => {
      emailSyncPromiseRef.current = null;
    });

    return emailSyncPromiseRef.current;
  }

  function importStatementCharges(charges: StatementCharge[]) {
    const reconciled = reconcileStatementCharges(expensesRef.current, charges);
    const reportId = currentActiveReportId;
    const createdExpenseIds = new Set(reconciled.createdExpenseIds);
    const nextExpenses = reconciled.expenses.map((expense) =>
      createdExpenseIds.has(expense.id) && !expense.reportId ? { ...expense, reportId } : expense
    );

    updateExpenses(nextExpenses);
    updateStatementCharges((current) => [
      ...reconciled.charges,
      ...current.filter((charge) => !reconciled.charges.some((nextCharge) => nextCharge.id === charge.id))
    ]);
    addExpensesToCurrentReport(reconciled.createdExpenseIds, reportId);

    return {
      importedCount: charges.length,
      matchedCount: reconciled.matchedExpenseIds.length,
      createdCount: reconciled.createdExpenseIds.length
    };
  }

  return (
    <AppShell active={screen} onChange={changeScreen}>
      {persistenceError && (
        <div className="persistence-alert" role="alert">
          Changes are not being saved. Check browser storage before closing this app.
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
        />
      )}
    </AppShell>
  );
}
