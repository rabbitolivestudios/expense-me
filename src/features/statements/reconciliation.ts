import type { Expense, StatementCharge } from "../../domain/types";
import { regionForCountry } from "../../domain/location";
import { classifyExpenseText } from "../extraction/categorizeExpense";

const strongMatchThreshold = 75;

function dateKey(value: string) {
  return value.slice(0, 10);
}

function sameDay(a: string, b: string) {
  return dateKey(a) === dateKey(b);
}

function amountClose(a: number, b: number) {
  return Math.abs(Math.abs(a) - Math.abs(b)) < 0.02;
}

function merchantToken(value?: string) {
  return value?.toLowerCase().split(/\s+/).find((token) => token.length > 2);
}

export function scoreMatch(expense: Expense, charge: StatementCharge) {
  let score = 0;

  if (sameDay(expense.expenseDate, charge.transactionDate)) score += 35;
  if (amountClose(expense.originalAmount, charge.originalAmount)) score += 35;
  if (expense.originalCurrency === charge.originalCurrency) score += 15;

  const token = merchantToken(expense.merchant || expense.description);
  if (token && charge.description.toLowerCase().includes(token)) score += 15;

  return score;
}

export function applyStatementMatch(expense: Expense, charge: StatementCharge): Expense {
  const statementRegion = charge.merchantRegion ?? regionForCountry(charge.merchantCountry);

  return {
    ...expense,
    statementChargeMatchId: charge.id,
    region: statementRegion ?? expense.region,
    country: charge.merchantCountry ?? expense.country,
    city: charge.merchantCity ?? expense.city,
    finalUsdAmount: charge.finalUsdAmount,
    fxRate: charge.fxRate,
    foreignTransactionFee: charge.foreignTransactionFee,
    status: expense.receiptArtifactIds.length > 0 || expense.declarationId ? "Ready" : "Declare"
  };
}

function statementExpenseId(charge: StatementCharge) {
  return `exp-statement-${charge.id.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
}

export function createExpenseFromStatementCharge(charge: StatementCharge): Expense {
  const classification = classifyExpenseText(charge.description);
  const country = charge.merchantCountry ?? "United States";

  return {
    id: statementExpenseId(charge),
    sourceType: "Statement",
    status: "Declare",
    ...classification,
    expenseDate: charge.transactionDate,
    region: charge.merchantRegion ?? regionForCountry(country) ?? "NAFTA",
    country,
    city: charge.merchantCity ?? "",
    merchant: charge.description,
    description: `Statement charge: ${charge.description}`,
    paymentMethod: "Credit Card",
    originalAmount: charge.originalAmount,
    originalCurrency: charge.originalCurrency,
    finalUsdAmount: charge.finalUsdAmount,
    fxRate: charge.fxRate,
    foreignTransactionFee: charge.foreignTransactionFee,
    receiptArtifactIds: [],
    statementChargeMatchId: charge.id,
    notes: "Created from card statement import. Attach a receipt or create a missing receipt declaration.",
    confidence: 0.58
  };
}

export interface StatementReconciliationResult {
  expenses: Expense[];
  charges: StatementCharge[];
  matchedExpenseIds: string[];
  createdExpenseIds: string[];
}

export function reconcileStatementCharges(expenses: Expense[], importedCharges: StatementCharge[]): StatementReconciliationResult {
  const nextExpenses = expenses.map((expense) => ({ ...expense }));
  const matchedExpenseIds: string[] = [];
  const createdExpenseIds: string[] = [];
  const usedExpenseIds = new Set(nextExpenses.filter((expense) => expense.statementChargeMatchId).map((expense) => expense.id));

  const charges = importedCharges.map((charge) => {
    const existingExpense = nextExpenses.find((expense) => expense.statementChargeMatchId === charge.id);
    if (existingExpense) {
      return { ...charge, matchStatus: "Matched" as const, matchedExpenseId: existingExpense.id };
    }

    const bestMatch = nextExpenses
      .filter((expense) => !usedExpenseIds.has(expense.id))
      .map((expense) => ({ expense, score: scoreMatch(expense, charge) }))
      .sort((a, b) => b.score - a.score)[0];

    if (bestMatch && bestMatch.score >= strongMatchThreshold) {
      const matchedExpense = applyStatementMatch(bestMatch.expense, charge);
      const expenseIndex = nextExpenses.findIndex((expense) => expense.id === matchedExpense.id);
      nextExpenses[expenseIndex] = matchedExpense;
      usedExpenseIds.add(matchedExpense.id);
      matchedExpenseIds.push(matchedExpense.id);

      return { ...charge, matchStatus: "Matched" as const, matchedExpenseId: matchedExpense.id };
    }

    const statementExpense = createExpenseFromStatementCharge(charge);
    nextExpenses.unshift(statementExpense);
    usedExpenseIds.add(statementExpense.id);
    createdExpenseIds.push(statementExpense.id);

    return { ...charge, matchStatus: "Matched" as const, matchedExpenseId: statementExpense.id };
  });

  return {
    expenses: nextExpenses,
    charges,
    matchedExpenseIds,
    createdExpenseIds
  };
}
