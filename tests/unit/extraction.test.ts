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

  it.each([
    ["Amtrak Rail Ticket\n05/21/2026\nTotal USD 38.00", "Transport", "Rail"],
    ["Airport Toll Road\n05/21/2026\nTotal USD 6.50", "Transport", "Toll"],
    ["Hotel Room Service\n05/21/2026\nTotal USD 29.00", "Stay", "Room Service"],
    ["Hotel Laundry\n05/21/2026\nTotal USD 14.00", "Stay", "Laundry"],
    ["Cocktail Drinks\n05/21/2026\nTotal USD 18.00", "Meals", "Drinks"],
    ["Conference Registration Fee\n05/21/2026\nTotal USD 250.00", "Other Expenses", "Registration Fees"],
    ["Training Fee\n05/21/2026\nTotal USD 75.00", "Other Expenses", "Training Fees"],
    ["Restaurant Tips\n05/21/2026\nTotal USD 8.00", "Other Expenses", "Tips"]
  ])("categorizes %s", (text, expenseType, subExpenseType) => {
    const expense = createExpenseFromExtractedText(`exp-${subExpenseType}`, text);

    expect(expense.expenseType).toBe(expenseType);
    expect(expense.subExpenseType).toBe(subExpenseType);
  });
});
