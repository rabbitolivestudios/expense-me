import { useEffect, useState } from "react";
import type { Expense, ReceiptArtifact, Report, StatementCharge } from "./domain/types";
import { CaptureSheet } from "./features/capture/CaptureSheet";
import { fetchAgentMailMessages, type AgentMailMessageSummary } from "./features/email/agentMailSync";
import { ExpenseDetailScreen } from "./features/expense/ExpenseDetailScreen";
import { ExportScreen } from "./features/export/ExportScreen";
import { createExpenseFromExtractedText } from "./features/extraction/extractionPipeline";
import { InboxScreen } from "./features/inbox/InboxScreen";
import { ReportsScreen } from "./features/reports/ReportsScreen";
import { CardsScreen } from "./features/statements/CardsScreen";
import { reconcileStatementCharges } from "./features/statements/reconciliation";
import { AppShell } from "./features/shell/AppShell";
import type { ScreenName } from "./features/shell/BottomNav";
import "./styles/app.css";

const storageKey = "expense-me-v1-live-state";

interface PersistedAppState {
  expenses: Expense[];
  receiptArtifacts: ReceiptArtifact[];
  reports: Report[];
  statementCharges: StatementCharge[];
}

function cloneReports(reports: Report[]) {
  return reports.map((report) => ({ ...report, expenseIds: [...report.expenseIds] }));
}

function createDefaultReport(expenseIds: string[] = []): Report {
  return {
    id: "report-current",
    name: "Current Export Package",
    dateRangeLabel: expenseIds.length > 0 ? "Ready for review" : "Add expenses to build the report",
    expenseIds,
    status: "Draft",
    createdAt: new Date().toISOString()
  };
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

function safeId(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 64) || `${Date.now()}`;
}

function createExpenseFromEmailSummary(message: AgentMailMessageSummary): { expense: Expense; artifact: ReceiptArtifact } {
  const id = `exp-email-${safeId(message.message_id)}`;
  const artifactId = `art-email-${safeId(message.message_id)}`;
  const text = [message.subject, message.from].filter(Boolean).join(" ");
  const expense = createExpenseFromExtractedText(id, text || "Email receipt");

  return {
    expense: {
      ...expense,
      sourceType: "Email",
      status: "Review",
      expenseDate: message.timestamp ? message.timestamp.slice(0, 10) : expense.expenseDate,
      receiptArtifactIds: [artifactId],
      notes: `Synced from ${message.from ?? "AgentMail"}${message.subject ? `: ${message.subject}` : ""}`
    },
    artifact: {
      id: artifactId,
      artifactType: "EmailBody",
      sourceMessageId: message.message_id,
      mimeType: "text/plain",
      storageKey: `agentmail/${message.message_id}`,
      createdAt: message.timestamp ?? new Date().toISOString(),
      extractedText: text || "Email receipt"
    }
  };
}

export default function App() {
  const persistedState = loadPersistedState();
  const [screen, setScreen] = useState<ScreenName>("Inbox");
  const [expenses, setExpenses] = useState<Expense[]>(() => persistedState?.expenses ?? []);
  const [receiptArtifacts, setReceiptArtifacts] = useState<ReceiptArtifact[]>(() => persistedState?.receiptArtifacts ?? []);
  const [reports, setReports] = useState<Report[]>(() =>
    persistedState?.reports?.length ? cloneReports(persistedState.reports) : [createDefaultReport()]
  );
  const [statementCharges, setStatementCharges] = useState<StatementCharge[]>(() => persistedState?.statementCharges ?? []);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const selectedExpense = expenses.find((expense) => expense.id === selectedExpenseId);

  useEffect(() => {
    persistState({ expenses, receiptArtifacts, reports, statementCharges });
  }, [expenses, receiptArtifacts, reports, statementCharges]);

  function changeScreen(nextScreen: ScreenName) {
    setSelectedExpenseId(null);
    setScreen(nextScreen);
  }

  function saveExpense(updatedExpense: Expense) {
    setExpenses((current) => current.map((expense) => (expense.id === updatedExpense.id ? updatedExpense : expense)));
    setSelectedExpenseId(null);
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

  function addExpensesToCurrentReport(expenseIds: string[]) {
    if (expenseIds.length === 0) return;

    setReports((current) => {
      if (current.length === 0) {
        return [createDefaultReport(expenseIds)];
      }

      return current.map((report, index) =>
        index === 0
          ? {
              ...report,
              dateRangeLabel: "Ready for review",
              expenseIds: [...expenseIds.filter((id) => !report.expenseIds.includes(id)), ...report.expenseIds]
            }
          : report
      );
    });
  }

  function addExpense(expense: Expense, artifacts: ReceiptArtifact[] = []) {
    setExpenses((current) => [expense, ...current]);
    if (artifacts.length > 0) {
      setReceiptArtifacts((current) => [
        ...artifacts,
        ...current.filter((artifact) => !artifacts.some((nextArtifact) => nextArtifact.id === artifact.id))
      ]);
    }
    addExpensesToCurrentReport([expense.id]);
    setSelectedExpenseId(expense.id);
    setScreen("Inbox");
  }

  async function syncEmail() {
    const messages = await fetchAgentMailMessages();
    const existingExpenseIds = new Set(expenses.map((expense) => expense.id));
    const emailBundles = messages
      .map(createExpenseFromEmailSummary)
      .filter((bundle) => !existingExpenseIds.has(bundle.expense.id));

    if (emailBundles.length > 0) {
      const emailExpenses = emailBundles.map((bundle) => bundle.expense);
      const emailArtifacts = emailBundles.map((bundle) => bundle.artifact);
      setExpenses((current) => [...emailExpenses, ...current]);
      setReceiptArtifacts((current) => [
        ...emailArtifacts,
        ...current.filter((artifact) => !emailArtifacts.some((nextArtifact) => nextArtifact.id === artifact.id))
      ]);
      addExpensesToCurrentReport(emailExpenses.map((expense) => expense.id));
    }

    return emailBundles.length;
  }

  function importStatementCharges(charges: StatementCharge[]) {
    const reconciled = reconcileStatementCharges(expenses, charges);
    setExpenses(reconciled.expenses);
    setStatementCharges((current) => [
      ...reconciled.charges,
      ...current.filter((charge) => !reconciled.charges.some((nextCharge) => nextCharge.id === charge.id))
    ]);
    addExpensesToCurrentReport(reconciled.createdExpenseIds);

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
          onDelete={deleteExpense}
          onSave={saveExpense}
        />
      )}
      {!selectedExpense && screen === "Inbox" && (
        <InboxScreen
          expenses={expenses}
          onCapture={() => changeScreen("Capture")}
          onOpenCards={() => changeScreen("Cards")}
          onOpenExpense={setSelectedExpenseId}
          onDeleteExpense={deleteExpense}
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
      {!selectedExpense && screen === "Reports" && <ReportsScreen reports={reports} onBack={() => changeScreen("Inbox")} />}
      {!selectedExpense && screen === "Cards" && (
        <CardsScreen
          statementCharges={statementCharges}
          onStatementImported={importStatementCharges}
          onBack={() => changeScreen("Inbox")}
        />
      )}
      {!selectedExpense && screen === "Export" && (
        <ExportScreen
          report={reports[0]}
          expenses={expenses}
          receiptArtifacts={receiptArtifacts}
          onBack={() => changeScreen("Inbox")}
        />
      )}
    </AppShell>
  );
}
