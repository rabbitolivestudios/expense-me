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
