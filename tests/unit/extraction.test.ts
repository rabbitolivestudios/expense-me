import { describe, expect, it } from "vitest";
import type { Expense } from "../../src/domain/types";
import { buildEmailReceiptText, createExpenseFromEmailMessage, mergeEmailExpenseRepair, shouldRepairEmailExpense } from "../../src/features/email/emailExpense";
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

  it("keeps thousands separators when parsing receipt totals", () => {
    const result = parseReceiptText("HOTEL CHICAGO\n05/20/2026\nTotal $1,234.56");

    expect(result.originalAmount).toBe(1234.56);
  });

  it("extracts Uber receipt details from forwarded email body text", () => {
    const result = parseReceiptText(`
Subject: FW: [Business] Your Thursday evening trip with Uber
From: "Oliveira, Thiago" <thiago.oliveira@example.com>

Uber
Thursday, May 28, 2026
Trip fare $17.64
Total $19.42
    `);

    expect(result.merchant).toBe("Uber");
    expect(result.expenseDate).toBe("2026-05-28");
    expect(result.originalAmount).toBe(19.42);
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

  it("uses email timestamp only as a fallback when the receipt body has no date", () => {
    const expense = createExpenseFromExtractedText("exp-email", "Uber\nTotal $19.42", {
      fallbackDate: "2026-06-03",
      sourceType: "Email"
    });

    expect(expense.sourceType).toBe("Email");
    expect(expense.expenseDate).toBe("2026-06-03");
    expect(expense.originalAmount).toBe(19.42);
  });

  it.each([
    ["Amtrak Rail Ticket\n05/21/2026\nTotal USD 38.00", "Transport", "Rail"],
    ["Airport Toll Road\n05/21/2026\nTotal USD 6.50", "Transport", "Toll"],
    ["Hotel Room Service\n05/21/2026\nTotal USD 29.00", "Stay", "Room Service"],
    ["Hotel Laundry\n05/21/2026\nTotal USD 14.00", "Stay", "Laundry"],
    ["Cocktail Drinks\n05/21/2026\nTotal USD 18.00", "Meals", "Drinks"],
    ["Conference Registration Fee\n05/21/2026\nTotal USD 250.00", "Other Expenses", "Registration Fees"],
    ["Training Fee\n05/21/2026\nTotal USD 75.00", "Other Expenses", "Training Fees"],
    ["Restaurant Tips\n05/21/2026\nTotal USD 8.00", "Other Expenses", "Tips"],
    ["Uber\n05/21/2026\nTrip fare USD 18.00\nTip USD 3.00\nTotal USD 21.00", "Transport", "Taxi"]
  ])("categorizes %s", (text, expenseType, subExpenseType) => {
    const expense = createExpenseFromExtractedText(`exp-${subExpenseType}`, text);

    expect(expense.expenseType).toBe(expenseType);
    expect(expense.subExpenseType).toBe(subExpenseType);
  });
});

describe("email receipt expense conversion", () => {
  it("builds parseable text from AgentMail detail body fields", () => {
    const text = buildEmailReceiptText({
      message_id: "m1",
      subject: "FW: [Business] Your Thursday evening trip with Uber",
      body: {
        html: "<div>Uber</div><div>Jun 3, 2026</div><div>Total $21.55</div>"
      },
      preview: "signature text"
    });

    expect(text).toContain("Uber");
    expect(text).toContain("Jun 3, 2026");
    expect(text).toContain("Total $21.55");
  });

  it("creates an email expense from the detailed message body instead of the forwarded subject", () => {
    const bundle = createExpenseFromEmailMessage({
      message_id: "<msg-1@example.com>",
      subject: "FW: [Business] Your Thursday evening trip with Uber",
      from: "\"Oliveira, Thiago\" <thiago.oliveira@example.com>",
      timestamp: "2026-06-03T14:23:00.000Z",
      text: "Uber\nJune 2, 2026\nTrip fare $15.00\nTotal $16.80"
    });

    expect(bundle.expense.sourceType).toBe("Email");
    expect(bundle.expense.merchant).toBe("Uber");
    expect(bundle.expense.description).toBe("Uber");
    expect(bundle.expense.expenseDate).toBe("2026-06-02");
    expect(bundle.expense.originalAmount).toBe(16.8);
    expect(bundle.expense.expenseType).toBe("Transport");
    expect(bundle.expense.subExpenseType).toBe("Taxi");
    expect(bundle.artifact.extractedText).toContain("Total $16.80");
  });

  it("repairs old summary-only email expenses while preserving folder and matching links", () => {
    const existing: Expense = {
      id: "exp-email-msg-1-example-com",
      sourceType: "Email",
      status: "Review",
      expenseType: "Transport",
      subExpenseType: "Taxi",
      expenseDate: "2026-06-03",
      region: "NAFTA",
      country: "United States",
      city: "",
      merchant: "FW: [Business] Your Thursday evening trip with Uber",
      description: "FW: [Business] Your Thursday evening trip with Uber <thiago.oliveira@example.com>",
      paymentMethod: "Credit Card",
      originalAmount: 0.01,
      originalCurrency: "USD",
      finalUsdAmount: 0.01,
      receiptArtifactIds: ["art-existing"],
      statementChargeMatchId: "charge-1",
      reportId: "report-current",
      confidence: 0.45
    };
    const next = createExpenseFromEmailMessage({
      message_id: "<msg-1@example.com>",
      text: "Uber\nJun 2, 2026\nTotal $16.80"
    }).expense;

    expect(shouldRepairEmailExpense(existing, next)).toBe(true);

    const repaired = mergeEmailExpenseRepair(existing, next, existing.receiptArtifactIds);

    expect(repaired.merchant).toBe("Uber");
    expect(repaired.originalAmount).toBe(16.8);
    expect(repaired.expenseDate).toBe("2026-06-02");
    expect(repaired.reportId).toBe("report-current");
    expect(repaired.statementChargeMatchId).toBe("charge-1");
    expect(repaired.receiptArtifactIds).toEqual(["art-existing"]);
  });
});
