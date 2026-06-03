import { describe, expect, it } from "vitest";
import { seedExpenses } from "../fixtures";
import type { Expense, StatementCharge } from "../../src/domain/types";
import {
  applyStatementMatch,
  createExpenseFromStatementCharge,
  reconcileStatementCharges,
  scoreMatch
} from "../../src/features/statements/reconciliation";
import { parseStatementCsv } from "../../src/features/statements/statementImport";

describe("reconciliation", () => {
  it("scores likely matches by date, amount, currency, and merchant", () => {
    const expense = seedExpenses[0];
    const charge: StatementCharge = {
      id: "charge-1",
      statementImportId: "statement-1",
      cardLabel: "Corporate Visa",
      transactionDate: expense.expenseDate,
      description: "AVEC RIVER NORTH",
      originalAmount: expense.originalAmount,
      originalCurrency: "USD",
      finalUsdAmount: expense.originalAmount,
      matchStatus: "Unmatched"
    };

    expect(scoreMatch(expense, charge)).toBeGreaterThan(80);
  });

  it("uses the matched statement charge as the FX source of truth", () => {
    const expense: Expense = {
      ...seedExpenses[1],
      finalUsdAmount: 44.5,
      fxRate: 1.05,
      foreignTransactionFee: 0.25,
      statementChargeMatchId: undefined
    };
    const charge: StatementCharge = {
      id: "charge-eur",
      statementImportId: "statement-1",
      cardLabel: "Corporate Visa",
      transactionDate: expense.expenseDate,
      description: "TAXI PARIS",
      originalAmount: 42,
      originalCurrency: "EUR",
      finalUsdAmount: 45.6,
      fxRate: 1.0857,
      foreignTransactionFee: 1.37,
      matchStatus: "Unmatched"
    };

    const matched = applyStatementMatch(expense, charge);

    expect(matched.statementChargeMatchId).toBe("charge-eur");
    expect(matched.finalUsdAmount).toBe(45.6);
    expect(matched.fxRate).toBe(1.0857);
    expect(matched.foreignTransactionFee).toBe(1.37);
    expect(matched.status).toBe("Ready");
  });

  it("imports CSV statement rows with final USD, FX rate, and foreign fee details", () => {
    const csv = [
      "Transaction Date,Posted Date,Description,Amount,Currency,Final USD,FX Rate,Fee",
      '2026-05-21,2026-05-22,"TAXI, PARISIEN",-42.00,EUR,-45.60,1.0857,1.37'
    ].join("\n");

    const charges = parseStatementCsv(csv, "statement-1", "Corporate Visa");

    expect(charges).toEqual([
      {
        id: "statement-1-0",
        statementImportId: "statement-1",
        cardLabel: "Corporate Visa",
        transactionDate: "2026-05-21",
        postedDate: "2026-05-22",
        description: "TAXI, PARISIEN",
        originalAmount: 42,
        originalCurrency: "EUR",
        finalUsdAmount: 45.6,
        fxRate: 1.0857,
        foreignTransactionFee: 1.37,
        matchStatus: "Unmatched"
      }
    ]);
  });

  it("turns unmatched statement charges into reviewable missed-charge expenses", () => {
    const charge: StatementCharge = {
      id: "charge-hotel",
      statementImportId: "statement-1",
      cardLabel: "Corporate Visa",
      transactionDate: "2026-05-23",
      description: "HOTEL CHICAGO",
      originalAmount: 284.2,
      originalCurrency: "USD",
      finalUsdAmount: 284.2,
      matchStatus: "Unmatched"
    };

    const expense = createExpenseFromStatementCharge(charge);

    expect(expense.sourceType).toBe("Statement");
    expect(expense.expenseType).toBe("Stay");
    expect(expense.subExpenseType).toBe("Hotel");
    expect(expense.status).toBe("Declare");
    expect(expense.statementChargeMatchId).toBe("charge-hotel");
  });

  it("reconciles imported statements into matched and newly created expenses", () => {
    const matchedCharge: StatementCharge = {
      id: "charge-avec",
      statementImportId: "statement-1",
      cardLabel: "Corporate Visa",
      transactionDate: "2026-05-20",
      description: "AVEC RIVER NORTH",
      originalAmount: 184.2,
      originalCurrency: "USD",
      finalUsdAmount: 184.2,
      matchStatus: "Unmatched"
    };
    const missedCharge: StatementCharge = {
      id: "charge-hotel",
      statementImportId: "statement-1",
      cardLabel: "Corporate Visa",
      transactionDate: "2026-05-23",
      description: "HOTEL CHICAGO",
      originalAmount: 284.2,
      originalCurrency: "USD",
      finalUsdAmount: 284.2,
      matchStatus: "Unmatched"
    };

    const result = reconcileStatementCharges(seedExpenses, [matchedCharge, missedCharge]);

    expect(result.matchedExpenseIds).toContain("exp-meal-client-dinner");
    expect(result.createdExpenseIds).toHaveLength(1);
    expect(result.charges).toEqual([
      expect.objectContaining({ id: "charge-avec", matchStatus: "Matched", matchedExpenseId: "exp-meal-client-dinner" }),
      expect.objectContaining({ id: "charge-hotel", matchStatus: "Matched", matchedExpenseId: result.createdExpenseIds[0] })
    ]);
    expect(result.expenses.some((expense) => expense.id === result.createdExpenseIds[0])).toBe(true);
  });
});
