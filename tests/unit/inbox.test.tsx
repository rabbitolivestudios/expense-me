import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seedExpenses, seedReports } from "../fixtures";
import { InboxScreen } from "../../src/features/inbox/InboxScreen";

describe("InboxScreen", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows quick intake actions and attention queues", () => {
    render(
      <InboxScreen
        expenses={seedExpenses}
        reports={seedReports}
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

  it("opens assign, rename, and delete actions after a long press on an expense", () => {
    vi.useFakeTimers();
    const openExpense = vi.fn();

    render(
      <InboxScreen
        expenses={seedExpenses}
        reports={seedReports}
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
});
