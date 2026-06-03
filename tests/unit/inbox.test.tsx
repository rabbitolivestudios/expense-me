import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedExpenses, seedReports } from "../fixtures";
import { InboxScreen } from "../../src/features/inbox/InboxScreen";

function firePointer(element: Element, type: string, clientX: number) {
  fireEvent(element, new MouseEvent(type, { bubbles: true, cancelable: true, clientX }));
}

function swipeRight(element: Element) {
  firePointer(element, "pointerdown", 120);
  firePointer(element, "pointermove", 240);
  firePointer(element, "pointerup", 240);
}

describe("InboxScreen", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows quick intake actions and attention queues", () => {
    render(
      <InboxScreen
        expenses={seedExpenses}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    expect(screen.getByAltText("Expense Me app icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open email intake" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload statement" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /To review/i })).toBeInTheDocument();
    expect(screen.getByText("Avec River North")).toBeInTheDocument();
  });

  it("syncs email when the AgentMail strip is tapped", async () => {
    const syncEmail = vi.fn().mockResolvedValue(2);

    render(
      <InboxScreen
        expenses={seedExpenses}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={syncEmail}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Sync expense-me@agentmail.to inbox/i }));

    expect(syncEmail).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Email synced. 2 receipts updated.")).toBeInTheDocument();
  });

  it("separates inbox expenses by week and year", () => {
    const expenses = [
      { ...seedExpenses[0], id: "exp-2026-current", expenseDate: "2026-06-03", merchant: "Uber Wednesday" },
      { ...seedExpenses[1], id: "exp-2026-prior", expenseDate: "2026-05-28", merchant: "Uber Prior Week" },
      { ...seedExpenses[2], id: "exp-2025-old", expenseDate: "2025-12-30", merchant: "Uber Last Year" }
    ];

    render(
      <InboxScreen
        expenses={expenses}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    expect(screen.getByText("Week of Jun 1")).toBeInTheDocument();
    expect(screen.getByText("Week of May 25")).toBeInTheDocument();
    expect(screen.getByText("Week of Dec 29")).toBeInTheDocument();
    expect(screen.getAllByText("2026")).toHaveLength(2);
    expect(screen.getByText("2025")).toBeInTheDocument();
  });

  it("keeps year-boundary dates in one weekly separator", () => {
    const expenses = [
      { ...seedExpenses[0], id: "exp-2026-jan", expenseDate: "2026-01-01", merchant: "New Year Taxi" },
      { ...seedExpenses[1], id: "exp-2025-dec", expenseDate: "2025-12-31", merchant: "Year End Taxi" }
    ];

    render(
      <InboxScreen
        expenses={expenses}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    expect(screen.getAllByText("Week of Dec 29")).toHaveLength(1);
  });

  it("does not display unresolved foreign amounts as USD", () => {
    const pendingFxExpense = {
      ...seedExpenses[1],
      id: "exp-pending-fx",
      reportId: seedReports[0].id,
      originalAmount: 42,
      originalCurrency: "EUR",
      finalUsdAmount: undefined,
      fxRate: undefined,
      foreignTransactionFee: undefined
    };
    const report = { ...seedReports[0], expenseIds: [pendingFxExpense.id] };

    render(
      <InboxScreen
        expenses={[pendingFxExpense]}
        reports={[report]}
        activeReportId={report.id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    expect(screen.getByText("€42.00")).toBeInTheDocument();
    expect(screen.getAllByText(/Check FX/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/\$42\.00/)).not.toBeInTheDocument();
  });

  it("flags unresolved FX in active folder totals", () => {
    const pendingFxExpense = {
      ...seedExpenses[1],
      id: "exp-pending-fx-total",
      reportId: seedReports[0].id,
      originalAmount: 42,
      originalCurrency: "EUR",
      finalUsdAmount: undefined,
      fxRate: undefined,
      foreignTransactionFee: undefined
    };
    const report = { ...seedReports[0], expenseIds: [seedExpenses[0].id, pendingFxExpense.id] };

    render(
      <InboxScreen
        expenses={[seedExpenses[0], pendingFxExpense]}
        reports={[report]}
        activeReportId={report.id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    expect(screen.getByText("$184")).toBeInTheDocument();
    expect(screen.getByText("In folder · FX pending")).toBeInTheDocument();
    expect(screen.queryByText("$226")).not.toBeInTheDocument();
  });

  it("shows a zero total for empty active folders", () => {
    const report = { ...seedReports[0], expenseIds: [] };

    render(
      <InboxScreen
        expenses={[]}
        reports={[report]}
        activeReportId={report.id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.queryByText("FX pending")).not.toBeInTheDocument();
  });

  it("normalizes a stale active Expense Folder id to the visible fallback", async () => {
    const changeActiveReport = vi.fn();

    render(
      <InboxScreen
        expenses={seedExpenses}
        reports={seedReports}
        activeReportId="missing-report"
        onActiveReportChange={changeActiveReport}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    await waitFor(() => expect(changeActiveReport).toHaveBeenCalledWith(seedReports[0].id));
  });

  it("opens assign, rename, and delete actions after a long press on an expense", () => {
    vi.useFakeTimers();
    const openExpense = vi.fn();

    render(
      <InboxScreen
        expenses={seedExpenses}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={openExpense}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: /Avec River North/i }), { clientX: 120 });
    act(() => {
      vi.advanceTimersByTime(650);
    });

    expect(screen.getByRole("dialog", { name: "Expense actions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign Expense Folder for Avec River North" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename Avec River North" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Avec River North" })).toBeInTheDocument();
    expect(openExpense).not.toHaveBeenCalled();
  });

  it("clears a pending long-press timer on unmount", () => {
    vi.useFakeTimers();

    const { unmount } = render(
      <InboxScreen
        expenses={seedExpenses}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    firePointer(screen.getByRole("button", { name: /Avec River North/i }), "pointerdown", 120);
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to the active folder when assigning an expense with a stale report id", () => {
    const assignExpenseFolder = vi.fn();
    const expense = { ...seedExpenses[0], reportId: "missing-report" };

    render(
      <InboxScreen
        expenses={[expense]}
        reports={seedReports}
        activeReportId={seedReports[1].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={assignExpenseFolder}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });
    swipeRight(expenseCard);
    fireEvent.click(screen.getByRole("button", { name: "Assign Expense Folder for Avec River North" }));

    const dialog = screen.getByRole("dialog", { name: "Assign Expense Folder" });
    expect(within(dialog).getByLabelText("Expense Folder")).toHaveValue(seedReports[1].id);

    fireEvent.click(within(dialog).getByRole("button", { name: "Assign Folder" }));

    expect(assignExpenseFolder).toHaveBeenCalledWith(expense.id, seedReports[1].id);
  });

  it("omits quick-created folder dates when the expense date is invalid", () => {
    const createExpenseFolder = vi.fn(() => ({ ...seedReports[0], id: "report-new-invalid-date", name: "Pending date folder" }));
    const expense = { ...seedExpenses[0], expenseDate: "pending-date" };

    render(
      <InboxScreen
        expenses={[expense]}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={createExpenseFolder}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });
    swipeRight(expenseCard);
    fireEvent.click(screen.getByRole("button", { name: "Assign Expense Folder for Avec River North" }));

    const dialog = screen.getByRole("dialog", { name: "Assign Expense Folder" });
    fireEvent.change(within(dialog).getByLabelText("New Expense Folder"), { target: { value: "Pending date folder" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create and Select Expense Folder" }));

    expect(createExpenseFolder).toHaveBeenCalledWith("Pending date folder", {});
  });

  it("trims quick-created folder names before saving", () => {
    const createExpenseFolder = vi.fn(() => ({ ...seedReports[0], id: "report-trimmed-name", name: "Trimmed folder" }));

    render(
      <InboxScreen
        expenses={[seedExpenses[0]]}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={createExpenseFolder}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });
    swipeRight(expenseCard);
    fireEvent.click(screen.getByRole("button", { name: "Assign Expense Folder for Avec River North" }));

    const dialog = screen.getByRole("dialog", { name: "Assign Expense Folder" });
    fireEvent.change(within(dialog).getByLabelText("New Expense Folder"), { target: { value: "  Trimmed folder  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create and Select Expense Folder" }));

    expect(createExpenseFolder).toHaveBeenCalledWith("Trimmed folder", { startDate: seedExpenses[0].expenseDate, endDate: seedExpenses[0].expenseDate });
  });

  it("assigns a quick-created folder before the folder list refreshes", () => {
    const createdReport = { ...seedReports[0], id: "report-delayed-refresh", name: "Delayed refresh folder", expenseIds: [] };
    const createExpenseFolder = vi.fn(() => createdReport);
    const assignExpenseFolder = vi.fn();

    render(
      <InboxScreen
        expenses={[seedExpenses[0]]}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={assignExpenseFolder}
        onCreateExpenseFolder={createExpenseFolder}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });
    swipeRight(expenseCard);
    fireEvent.click(screen.getByRole("button", { name: "Assign Expense Folder for Avec River North" }));

    const dialog = screen.getByRole("dialog", { name: "Assign Expense Folder" });
    fireEvent.change(within(dialog).getByLabelText("New Expense Folder"), { target: { value: "Delayed refresh folder" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create and Select Expense Folder" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign Folder" }));

    expect(assignExpenseFolder).toHaveBeenCalledWith(seedExpenses[0].id, createdReport.id);
  });

  it("assigns a quick-created folder after the folder list refreshes", () => {
    const createdReport = { ...seedReports[0], id: "report-refreshed", name: "Refreshed folder", expenseIds: [] };
    const createExpenseFolder = vi.fn(() => createdReport);
    const assignExpenseFolder = vi.fn();

    const props = {
      expenses: [seedExpenses[0]],
      activeReportId: seedReports[0].id,
      onActiveReportChange: () => undefined,
      onCapture: () => undefined,
      onAssignExpenseFolder: assignExpenseFolder,
      onCreateExpenseFolder: createExpenseFolder,
      onRenameExpense: () => undefined,
      onDeleteExpense: () => undefined,
      onOpenCards: () => undefined,
      onOpenExport: () => undefined,
      onOpenExpense: () => undefined,
      onSyncEmail: () => Promise.resolve(0),
      theme: "light" as const,
      onToggleTheme: () => undefined
    };

    const { rerender } = render(<InboxScreen {...props} reports={seedReports} />);

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });
    swipeRight(expenseCard);
    fireEvent.click(screen.getByRole("button", { name: "Assign Expense Folder for Avec River North" }));

    const dialog = screen.getByRole("dialog", { name: "Assign Expense Folder" });
    fireEvent.change(within(dialog).getByLabelText("New Expense Folder"), { target: { value: "Refreshed folder" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create and Select Expense Folder" }));

    rerender(<InboxScreen {...props} reports={[...seedReports, createdReport]} />);
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign Folder" }));

    expect(assignExpenseFolder).toHaveBeenCalledWith(seedExpenses[0].id, createdReport.id);
  });

  it("shows feedback when quick folder creation fails", () => {
    render(
      <InboxScreen
        expenses={[seedExpenses[0]]}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });
    swipeRight(expenseCard);
    fireEvent.click(screen.getByRole("button", { name: "Assign Expense Folder for Avec River North" }));

    const dialog = screen.getByRole("dialog", { name: "Assign Expense Folder" });
    fireEvent.change(within(dialog).getByLabelText("New Expense Folder"), { target: { value: "Missing folder" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create and Select Expense Folder" }));

    expect(within(dialog).getByText("Expense Folder could not be created.")).toBeInTheDocument();
  });

  it("opens an expense after canceling a revealed assign action", () => {
    const openExpense = vi.fn();

    render(
      <InboxScreen
        expenses={seedExpenses}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={openExpense}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });
    swipeRight(expenseCard);
    fireEvent.click(screen.getByRole("button", { name: "Assign Expense Folder for Avec River North" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(expenseCard);

    expect(openExpense).toHaveBeenCalledWith(seedExpenses[0].id);
  });

  it("clears swipe reveal when the pointer returns to neutral", () => {
    render(
      <InboxScreen
        expenses={seedExpenses}
        reports={seedReports}
        activeReportId={seedReports[0].id}
        onActiveReportChange={() => undefined}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onRenameExpense={() => undefined}
        onDeleteExpense={() => undefined}
        onOpenCards={() => undefined}
        onOpenExport={() => undefined}
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
        theme="light"
        onToggleTheme={() => undefined}
      />
    );

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });
    firePointer(expenseCard, "pointerdown", 120);
    firePointer(expenseCard, "pointermove", 240);
    firePointer(expenseCard, "pointermove", 124);
    firePointer(expenseCard, "pointerup", 124);

    expect(screen.queryByRole("button", { name: "Assign Expense Folder for Avec River North" })).not.toBeInTheDocument();
  });
});
