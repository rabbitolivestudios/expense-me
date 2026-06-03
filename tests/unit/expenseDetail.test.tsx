import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { seedExpenses, seedReports } from "../fixtures";
import { ExpenseDetailScreen } from "../../src/features/expense/ExpenseDetailScreen";

describe("ExpenseDetailScreen", () => {
  it("requires final USD before saving non-USD expenses", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const nonUsdExpense = { ...seedExpenses[1], finalUsdAmount: undefined, status: "Review" as const };

    render(
      <ExpenseDetailScreen
        expense={nonUsdExpense}
        onBack={() => undefined}
        onCreateDeclaration={() => undefined}
        onCreateExpenseFolder={() => undefined}
        onDelete={() => undefined}
        reports={seedReports}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole("button", { name: "Save Expense" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm final USD amount.")).toBeInTheDocument();
  });
});
