import type { Expense } from "../../domain/types";

export function createDeclarationText(expense: Expense, employeeName: string, reportReference: string) {
  return [
    "Declaration of expenditures without supporting documents",
    `Name: ${employeeName}`,
    `Expense report ref: ${reportReference}`,
    `Date: ${expense.expenseDate}`,
    `Description: ${expense.description}`,
    `Amount: ${expense.originalAmount.toFixed(2)} ${expense.originalCurrency}`,
    "I certify that this expense was incurred for business purposes and that supporting documentation is unavailable.",
    "Signature: ______________________________"
  ].join("\n");
}
