import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { seedExpenses, seedReports } from "../fixtures";
import { ExpenseDetailScreen } from "../../src/features/expense/ExpenseDetailScreen";

describe("ExpenseDetailScreen", () => {
  it("requires an FX rate before saving non-USD expenses", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    // Foreign expense with no FX rate yet -> Final USD cannot be derived.
    const nonUsdExpense = {
      ...seedExpenses[1],
      fxRate: undefined,
      foreignTransactionFee: undefined,
      finalUsdAmount: undefined,
      status: "Review" as const
    };

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
    expect(screen.getByText("Enter the FX rate used.")).toBeInTheDocument();
  });

  it("derives Final USD from amount, FX rate and foreign fee", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    // amount 42 EUR, fx 1.0881, fee 1.10 -> 42 * 1.0881 + 1.10 = 46.80
    const nonUsdExpense = {
      ...seedExpenses[1],
      fxRate: 1.0881,
      foreignTransactionFee: 1.1,
      finalUsdAmount: undefined,
      status: "Review" as const
    };

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

    expect(screen.getByLabelText("Final USD")).toHaveValue("46.80");

    await user.click(screen.getByRole("button", { name: "Save Expense" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].finalUsdAmount).toBeCloseTo(46.8, 2);
  });
});
