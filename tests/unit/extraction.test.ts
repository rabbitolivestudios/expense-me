import { describe, expect, it } from "vitest";
import { createExpenseFromExtractedText } from "../../src/features/extraction/extractionPipeline";
import { parseReceiptText } from "../../src/features/extraction/receiptParser";

describe("receipt parser", () => {
  it("extracts amount, date, and merchant from simple receipt text", () => {
    const result = parseReceiptText("AVEC RIVER NORTH\n05/20/2026\nTotal USD 184.20");

    expect(result.merchant).toBe("AVEC RIVER NORTH");
    expect(result.expenseDate).toBe("2026-05-20");
    expect(result.originalAmount).toBe(184.2);
    expect(result.originalCurrency).toBe("USD");
  });

  it("creates a review expense from extracted receipt text", () => {
    const expense = createExpenseFromExtractedText("exp-imported", "Taxi Parisien\n05/21/2026\nTotal EUR 42.00");

    expect(expense.id).toBe("exp-imported");
    expect(expense.merchant).toBe("Taxi Parisien");
    expect(expense.expenseType).toBe("Transport");
    expect(expense.subExpenseType).toBe("Taxi");
    expect(expense.originalCurrency).toBe("EUR");
    expect(expense.status).toBe("Review");
  });
});
