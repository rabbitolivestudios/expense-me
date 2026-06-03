import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { seedExpenses, seedReports } from "../fixtures";
import { InboxScreen } from "../../src/features/inbox/InboxScreen";

describe("InboxScreen", () => {
  it("shows quick intake actions and attention queues", () => {
    render(
      <InboxScreen
        expenses={seedExpenses}
        reports={seedReports}
        onCapture={() => undefined}
        onAssignExpenseFolder={() => undefined}
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
});
