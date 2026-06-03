import { useEffect, useRef, useState } from "react";
import {
  cloneReports,
  createDefaultReport,
  createExpenseFolderRecord,
  defaultFolderId,
  normalizeExpensesWithReports,
  syncReportsWithExpenses
} from "./app/appState";
import type { ExpenseFolderDates } from "./app/appState";
import { buildExpenseFolderDateRangeLabel } from "./domain/reportDates";
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

interface PersistedAppState {
  expenses: Expense[];
  receiptArtifacts: ReceiptArtifact[];
  reports: Report[];
  statementCharges: StatementCharge[];
}

function loadPersistedState(): PersistedAppState | undefined {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return undefined;

    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    if (
      !Array.isArray(parsed.expenses) ||
      !Array.isArray(parsed.receiptArtifacts) ||
      !Array.isArray(parsed.reports) ||
      !Array.isArray(parsed.statementCharges)
    ) {
      return undefined;
    }

    return {
      expenses: parsed.expenses,
      receiptArtifacts: parsed.receiptArtifacts,
      reports: cloneReports(parsed.reports),
      statementCharges: parsed.statementCharges
    };
  } catch {
    return undefined;
  }
}

function persistState(state: PersistedAppState) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Local persistence is best-effort for private browsing or restricted storage.
  }
}

export default function App() {
  const persistedState = loadPersistedState();
  const initialReports = persistedState?.reports?.length ? cloneReports(persistedState.reports) : [createDefaultReport()];
  const initialExpenses = normalizeExpensesWithReports(persistedState?.expenses ?? [], initialReports);
  const [screen, setScreen] = useState<ScreenName>("Inbox");
  const [expenses, setExpenses] = useState<Expense[]>(() => initialExpenses);
  const [receiptArtifacts, setReceiptArtifacts] = useState<ReceiptArtifact[]>(() => persistedState?.receiptArtifacts ?? []);
  const [reports, setReports] = useState<Report[]>(() => syncReportsWithExpenses(initialReports, initialExpenses));
  const [statementCharges, setStatementCharges] = useState<StatementCharge[]>(() => persistedState?.statementCharges ?? []);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const selectedExpense = expenses.find((expense) => expense.id === selectedExpenseId);
  const { theme, toggleTheme } = useTheme();
  const emailSyncPromiseRef = useRef<Promise<number> | null>(null);

  useEffect(() => {
    persistState({ expenses, receiptArtifacts, reports, statementCharges });
  }, [expenses, receiptArtifacts, reports, statementCharges]);

  function changeScreen(nextScreen: ScreenName) {
    setSelectedExpenseId(null);
    setScreen(nextScreen);
  }

  function saveExpense(updatedExpense: Expense) {
    setExpenses((current) => current.map((expense) => (expense.id === updatedExpense.id ? updatedExpense : expense)));
    setReports((current) =>
      current.map((report) => ({
        ...report,
        expenseIds:
          report.id === updatedExpense.reportId
            ? [updatedExpense.id, ...report.expenseIds.filter((id) => id !== updatedExpense.id)]
            : report.expenseIds.filter((id) => id !== updatedExpense.id)
      }))
    );
    setSelectedExpenseId(null);
  }

  function assignExpenseFolder(expenseId: string, reportId: string) {
    setExpenses((current) => current.map((expense) => (expense.id === expenseId ? { ...expense, reportId } : expense)));
    setReports((current) =>
      current.map((report) => ({
        ...report,
        expenseIds: report.id === reportId ? [expenseId, ...report.expenseIds.filter((id) => id !== expenseId)] : report.expenseIds.filter((id) => id !== expenseId)
      }))
    );
  }

  function renameExpense(expenseId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setExpenses((current) =>
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
    const report = createExpenseFolderRecord(name, dates);
    if (!report) return undefined;

    setReports((current) => [report, ...current]);
    return report;
  }

  function renameExpenseFolder(reportId: string, name: string, dates?: ExpenseFolderDates) {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setReports((current) =>
      current.map((report) => {
        if (report.id !== reportId) return report;

        const startDate = dates ? dates.startDate || undefined : report.startDate;
        const endDate = dates ? dates.endDate || startDate : report.endDate;

        return {
          ...report,
          name: trimmedName,
          startDate,
          endDate,
          dateRangeLabel: buildExpenseFolderDateRangeLabel(startDate, endDate)
        };
      })
    );
  }

  function deleteExpenseFolder(reportId: string) {
    setReports((current) => {
      if (current.length <= 1) return current;

      const target = current.find((report) => report.id === reportId);
      if (!target || target.expenseIds.length > 0) return current;

      return current.filter((report) => report.id !== reportId);
    });
  }

  function deleteExpense(expenseId: string) {
    const deletedExpense = expenses.find((expense) => expense.id === expenseId);
    const nextExpenses = expenses.filter((expense) => expense.id !== expenseId);
    const usedArtifactIds = new Set(nextExpenses.flatMap((expense) => expense.receiptArtifactIds));

    setExpenses(nextExpenses);
    setReceiptArtifacts((current) => current.filter((artifact) => usedArtifactIds.has(artifact.id)));
    setReports((current) =>
      current.map((report, index) => {
        const expenseIds = report.expenseIds.filter((id) => id !== expenseId);

        return {
          ...report,
          expenseIds,
          dateRangeLabel: index === 0 && expenseIds.length === 0 ? "Add expenses to build the report" : report.dateRangeLabel
        };
      })
    );
    setStatementCharges((current) =>
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
    setExpenses((current) => current.map((item) => (item.id === expense.id ? updatedExpense : item)));
  }

  function addExpensesToCurrentReport(expenseIds: string[], reportId = reports[0]?.id ?? defaultFolderId) {
    if (expenseIds.length === 0) return;

    setReports((current) => {
      if (current.length === 0) {
        return [createDefaultReport(expenseIds)];
      }

      return current.map((report, index) =>
        report.id === reportId || (index === 0 && !current.some((item) => item.id === reportId))
          ? {
              ...report,
              dateRangeLabel: "Ready for export package",
              expenseIds: [...expenseIds.filter((id) => !report.expenseIds.includes(id)), ...report.expenseIds]
            }
          : report
      );
    });
  }

  function addExpense(expense: Expense, artifacts: ReceiptArtifact[] = []) {
    const reportId = reports[0]?.id ?? defaultFolderId;
    const assignedExpense = { ...expense, reportId };

    setExpenses((current) => [assignedExpense, ...current]);
    if (artifacts.length > 0) {
      setReceiptArtifacts((current) => [
        ...artifacts,
        ...current.filter((artifact) => !artifacts.some((nextArtifact) => nextArtifact.id === artifact.id))
      ]);
    }
    addExpensesToCurrentReport([assignedExpense.id], reportId);
    setSelectedExpenseId(assignedExpense.id);
    setScreen("Inbox");
  }

  async function runEmailSync() {
    const messages = await fetchAgentMailMessages();
    const existingExpensesById = new Map(expenses.map((expense) => [expense.id, expense]));
    const emailBundles = messages.map(createExpenseFromEmailMessage);
    const newBundles = emailBundles.filter((bundle) => !existingExpensesById.has(bundle.expense.id));
    const repairBundles = emailBundles
      .map((bundle) => ({ bundle, existing: existingExpensesById.get(bundle.expense.id) }))
      .filter((item): item is { bundle: (typeof emailBundles)[number]; existing: Expense } =>
        item.existing !== undefined && shouldRepairEmailExpense(item.existing, item.bundle.expense)
      );

    if (newBundles.length > 0 || repairBundles.length > 0) {
      const reportId = reports[0]?.id ?? defaultFolderId;
      const emailExpenses = newBundles.map((bundle) => ({ ...bundle.expense, reportId }));
      const repairs = repairBundles.map(({ bundle, existing }) => {
        const receiptArtifactIds = existing.receiptArtifactIds.length > 0 ? existing.receiptArtifactIds : bundle.expense.receiptArtifactIds;
        const artifactId = receiptArtifactIds[0] ?? bundle.artifact.id;

        return {
          expense: mergeEmailExpenseRepair(existing, bundle.expense, receiptArtifactIds),
          artifact: { ...bundle.artifact, id: artifactId }
        };
      });
      const repairedExpensesById = new Map(repairs.map((repair) => [repair.expense.id, repair.expense]));
      const emailArtifacts = [...newBundles.map((bundle) => bundle.artifact), ...repairs.map((repair) => repair.artifact)];

      setExpenses((current) => [
        ...emailExpenses,
        ...current.map((expense) => repairedExpensesById.get(expense.id) ?? expense)
      ]);
      setReceiptArtifacts((current) => [
        ...emailArtifacts,
        ...current.filter((artifact) => !emailArtifacts.some((nextArtifact) => nextArtifact.id === artifact.id))
      ]);
      addExpensesToCurrentReport(emailExpenses.map((expense) => expense.id), reportId);
    }

    return newBundles.length + repairBundles.length;
  }

  function syncEmail() {
    if (emailSyncPromiseRef.current) {
      return emailSyncPromiseRef.current;
    }

    emailSyncPromiseRef.current = runEmailSync().finally(() => {
      emailSyncPromiseRef.current = null;
    });

    return emailSyncPromiseRef.current;
  }

  function importStatementCharges(charges: StatementCharge[]) {
    const reconciled = reconcileStatementCharges(expenses, charges);
    const reportId = reports[0]?.id ?? defaultFolderId;
    const createdExpenseIds = new Set(reconciled.createdExpenseIds);
    const nextExpenses = reconciled.expenses.map((expense) =>
      createdExpenseIds.has(expense.id) && !expense.reportId ? { ...expense, reportId } : expense
    );

    setExpenses(nextExpenses);
    setStatementCharges((current) => [
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
