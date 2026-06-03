import type { Expense } from "../../domain/types";
import { parseReceiptText } from "./receiptParser";

function classifyExtractedText(text: string): Pick<Expense, "expenseType" | "subExpenseType"> {
  const normalized = text.toLowerCase();

  if (/hotel|lodging|inn|suite|resort/.test(normalized)) {
    return { expenseType: "Stay", subExpenseType: "Hotel" };
  }

  if (/taxi|uber|lyft|cab/.test(normalized)) {
    return { expenseType: "Transport", subExpenseType: "Taxi" };
  }

  if (/fuel|shell|gas|gasoline/.test(normalized)) {
    return { expenseType: "Transport", subExpenseType: "Fuel" };
  }

  if (/air|airline|flight/.test(normalized)) {
    return { expenseType: "Transport", subExpenseType: "Air" };
  }

  if (/parking/.test(normalized)) {
    return { expenseType: "Transport", subExpenseType: "Parking" };
  }

  if (/breakfast/.test(normalized)) {
    return { expenseType: "Meals", subExpenseType: "Breakfast" };
  }

  if (/brunch/.test(normalized)) {
    return { expenseType: "Meals", subExpenseType: "Brunch" };
  }

  if (/dinner/.test(normalized)) {
    return { expenseType: "Meals", subExpenseType: "Dinner" };
  }

  if (/restaurant|cafe|coffee|lunch|meal/.test(normalized)) {
    return { expenseType: "Meals", subExpenseType: "Lunch" };
  }

  return { expenseType: "Other Expenses", subExpenseType: "Any other expenses" };
}

export function createExpenseFromExtractedText(id: string, text: string): Expense {
  const parsed = parseReceiptText(text);
  const currency = parsed.originalCurrency ?? "USD";
  const amount = parsed.originalAmount ?? 0.01;
  const classification = classifyExtractedText(text);

  return {
    id,
    sourceType: "Upload",
    status: "Review",
    ...classification,
    expenseDate: parsed.expenseDate ?? new Date().toISOString().slice(0, 10),
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
