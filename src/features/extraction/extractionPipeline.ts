import type { Expense } from "../../domain/types";
import { classifyExpenseText } from "./categorizeExpense";
import { parseReceiptText } from "./receiptParser";

interface CreateExpenseOptions {
  fallbackDate?: string;
  sourceType?: Expense["sourceType"];
}

export function createExpenseFromExtractedText(id: string, text: string, options: CreateExpenseOptions = {}): Expense {
  const parsed = parseReceiptText(text);
  const currency = parsed.originalCurrency ?? "USD";
  const amount = parsed.originalAmount ?? 0.01;
  const classification = classifyExpenseText(text);

  return {
    id,
    sourceType: options.sourceType ?? "Upload",
    status: "Review",
    ...classification,
    expenseDate: parsed.expenseDate ?? options.fallbackDate ?? new Date().toISOString().slice(0, 10),
    region: "NAFTA",
    country: "United States",
    city: "",
    merchant: parsed.merchant,
    description: parsed.merchant ?? "Imported receipt",
    paymentMethod: "Credit Card",
    originalAmount: amount,
    originalCurrency: currency,
    finalUsdAmount: currency === "USD" ? amount : undefined,
    receiptArtifactIds: [],
    confidence: parsed.confidence
  };
}
