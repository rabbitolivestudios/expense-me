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
        id: "charge-corporate-visa-2026-05-21-2026-05-22-taxi-parisien-42-00-eur-45-60",
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

  it.each([
    [
      "missing amount",
      ["Transaction Date,Description,Amount", "2026-05-21,TAXI PARISIEN,"].join("\n"),
      "Statement CSV row 2: Amount is required."
    ],
    [
      "invalid amount",
      ["Transaction Date,Description,Amount", "2026-05-21,TAXI PARISIEN,not-money"].join("\n"),
      "Statement CSV row 2: Amount must be a valid number."
    ],
    [
      "missing transaction date",
      ["Transaction Date,Description,Amount", ",TAXI PARISIEN,42"].join("\n"),
      "Statement CSV row 2: Transaction date is required."
    ],
    [
      "missing description",
      ["Transaction Date,Description,Amount", "2026-05-21,,42"].join("\n"),
      "Statement CSV row 2: Description is required."
    ],
    [
      "non-USD without final USD or FX rate",
      ["Transaction Date,Description,Amount,Currency", "2026-05-21,TAXI PARISIEN,42,EUR"].join("\n"),
      "Statement CSV row 2: Final USD or FX Rate is required for non-USD charges."
    ]
  ])("rejects statement CSV rows with %s", (_name, csv, message) => {
    expect(() => parseStatementCsv(csv, "statement-1", "Corporate Visa")).toThrow(message);
  });

  it("computes final USD for non-USD statement rows when an FX rate is supplied", () => {
    const csv = [
      "Transaction Date,Description,Amount,Currency,FX Rate,Fee",
      "2026-05-21,TAXI PARISIEN,42,EUR,1.1,1.25"
    ].join("\n");

    const [charge] = parseStatementCsv(csv, "statement-1", "Corporate Visa");

    expect(charge.finalUsdAmount).toBe(47.45);
    expect(charge.fxRate).toBe(1.1);
    expect(charge.foreignTransactionFee).toBe(1.25);
  });

  it("uses stable statement charge ids across repeated imports", () => {
    const csv = [
      "Transaction Date,Posted Date,Description,Amount,Currency,Final USD",
      "2026-05-23,2026-05-24,HOTEL CHICAGO,284.20,USD,284.20"
    ].join("\n");
    const [firstCharge] = parseStatementCsv(csv, "statement-1", "Corporate Visa");
    const [secondCharge] = parseStatementCsv(csv, "statement-2", "Corporate Visa");

    expect(secondCharge.id).toBe(firstCharge.id);

    const firstResult = reconcileStatementCharges([], [firstCharge]);
    const secondResult = reconcileStatementCharges(firstResult.expenses, [secondCharge]);

    expect(firstResult.createdExpenseIds).toHaveLength(1);
    expect(secondResult.createdExpenseIds).toHaveLength(0);
    expect(secondResult.expenses).toHaveLength(1);
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

  it.each([
    ["AMTRAK RAIL", "Transport", "Rail"],
    ["AIRPORT TOLL ROAD", "Transport", "Toll"],
    ["HOTEL ROOM SERVICE", "Stay", "Room Service"],
    ["HOTEL LAUNDRY", "Stay", "Laundry"],
    ["CLIENT DRINKS", "Meals", "Drinks"],
    ["CONFERENCE REGISTRATION", "Other Expenses", "Registration Fees"],
    ["TRAINING FEES", "Other Expenses", "Training Fees"],
    ["RESTAURANT TIPS", "Other Expenses", "Tips"]
  ])("classifies unmatched statement charge %s", (description, expenseType, subExpenseType) => {
    const charge: StatementCharge = {
      id: `charge-${description.replace(/\s+/g, "-").toLowerCase()}`,
      statementImportId: "statement-1",
      cardLabel: "Corporate Visa",
      transactionDate: "2026-05-23",
      description,
      originalAmount: 42,
      originalCurrency: "USD",
      finalUsdAmount: 42,
      matchStatus: "Unmatched"
    };

    const expense = createExpenseFromStatementCharge(charge);

    expect(expense.expenseType).toBe(expenseType);
    expect(expense.subExpenseType).toBe(subExpenseType);
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
