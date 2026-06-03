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
        onOpenExpense={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
      />
    );

    expect(screen.getByAltText("Expense Me app icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open email intake" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload statement" })).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Avec River North")).toBeInTheDocument();
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
        onOpenExpense={openExpense}
        onSyncEmail={() => Promise.resolve(0)}
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
