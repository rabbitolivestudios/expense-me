import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { seedArtifacts, seedExpenses, seedReports } from "../fixtures";
import type { ReceiptArtifact } from "../../src/domain/types";
import { buildExportPackageFiles, buildExportPackageZip, buildReadinessChecklist } from "../../src/features/export/exportPackage";

describe("Export Package readiness", () => {
  it("flags missing receipt declarations before export", () => {
    const checklist = buildReadinessChecklist(seedReports[0], seedExpenses);

    expect(checklist.some((item) => item.kind === "declaration")).toBe(true);
  });

  it("flags expenses that are not assigned to an Expense Folder", () => {
    const unassignedExpense = { ...seedExpenses[0], reportId: undefined };
    const checklist = buildReadinessChecklist({ ...seedReports[0], expenseIds: [unassignedExpense.id] }, [unassignedExpense]);

    expect(checklist).toContainEqual({
      kind: "field",
      expenseId: unassignedExpense.id,
      message: "Avec River North (2026-05-20): Expense Folder is required."
    });
  });

  it("names the affected expense in field readiness blockers", () => {
    const incompleteExpense = { ...seedExpenses[0], city: "" };
    const checklist = buildReadinessChecklist({ ...seedReports[0], expenseIds: [incompleteExpense.id] }, [incompleteExpense]);

    expect(checklist).toContainEqual({
      kind: "field",
      expenseId: incompleteExpense.id,
      message: "Avec River North (2026-05-20): City is required."
    });
    expect(checklist.some((item) => item.message === "city is required.")).toBe(false);
  });

  it("blocks non-USD expenses without a final USD amount", () => {
    const nonUsdExpense = { ...seedExpenses[1], finalUsdAmount: undefined, status: "Ready" as const };
    const checklist = buildReadinessChecklist({ ...seedReports[1], expenseIds: [nonUsdExpense.id] }, [nonUsdExpense]);

    expect(checklist).toContainEqual({
      kind: "fx",
      expenseId: nonUsdExpense.id,
      message: "Taxi Parisien (2026-05-21): Confirm final USD amount and FX details."
    });
  });

  it("blocks exports when an Expense Folder references a missing expense", () => {
    const checklist = buildReadinessChecklist(
      { ...seedReports[0], expenseIds: ["missing-expense"] },
      seedExpenses,
      seedArtifacts
    );

    expect(checklist).toContainEqual({
      kind: "field",
      expenseId: "missing-expense",
      message: "Unknown expense (missing-expense): Expense record is missing."
    });
  });

  it("blocks exports when a receipt artifact id cannot be resolved", () => {
    const expense = {
      ...seedExpenses[0],
      receiptArtifactIds: ["missing-artifact"]
    };
    const checklist = buildReadinessChecklist(
      { ...seedReports[0], expenseIds: [expense.id] },
      [expense],
      []
    );

    expect(checklist).toContainEqual({
      kind: "receipt",
      expenseId: expense.id,
      message: "Avec River North (2026-05-20): Receipt evidence is missing from stored artifacts."
    });
  });

  it("builds handoff files with corporate fields and declaration text", () => {
    const expenses = seedExpenses.map((expense) =>
      expense.id === "exp-fuel-training" ? { ...expense, declarationId: "decl-exp-fuel-training", status: "Ready" as const } : expense
    );
    const files = buildExportPackageFiles({
      report: seedReports[0],
      expenses,
      employeeName: "CASTRO Laurent",
      reportReference: "EXP-1229"
    });

    expect(files["entry-spreadsheet.csv"]).toContain("Expense type,Sub expense type,Expense date,Region,Country,City");
    expect(files["entry-spreadsheet.csv"]).toContain("Transport,Fuel,2026-05-20,NAFTA,United States,Chicago");
    expect(files["entry-spreadsheet.csv"]).toContain("Receipt attached: art-restaurant-receipt");
    expect(files["entry-spreadsheet.csv"]).toContain("Declaration: decl-exp-fuel-training");
    expect(files["expense-index.source.txt"]).toContain("Chicago Training - May 2026");
    expect(files["declarations/decl-exp-fuel-training.source.txt"]).toContain("Gas roundtrip Schererville / Training");
    expect(files["reconciliation-notes.source.txt"]).toContain("Export Package");
  });

  it("neutralizes formula-like values in exported CSV cells", () => {
    const files = buildExportPackageFiles({
      report: { ...seedReports[0], name: "=Trip Folder", expenseIds: [seedExpenses[0].id] },
      expenses: [{ ...seedExpenses[0], description: "=HYPERLINK(\"https://example.invalid\",\"click\")" }],
      employeeName: "CASTRO Laurent",
      reportReference: "EXP-1229"
    });

    expect(files["entry-spreadsheet.csv"]).toContain("'=Trip Folder");
    expect(files["entry-spreadsheet.csv"]).toContain("'=HYPERLINK");
  });

  it("builds a downloadable zip archive from the handoff files", async () => {
    const expenses = seedExpenses.map((expense) =>
      expense.id === "exp-fuel-training" ? { ...expense, declarationId: "decl-exp-fuel-training", status: "Ready" as const } : expense
    );
    const archive = await buildExportPackageZip({
      report: seedReports[0],
      expenses,
      receiptArtifacts: seedArtifacts,
      employeeName: "CASTRO Laurent",
      reportReference: "EXP-1229"
    });
    const zip = await JSZip.loadAsync(archive);

    expect(zip.file("entry-spreadsheet.csv")).toBeTruthy();
    expect(zip.file("expense-index.pdf")).toBeTruthy();
    expect(zip.file("declarations/decl-exp-fuel-training.pdf")).toBeTruthy();
    expect(zip.file("receipts/receipt-001-avec-dinner.pdf")).toBeTruthy();
    expect(Object.keys(zip.files).filter((path) => path.endsWith(".txt"))).toEqual([]);
  });

  it("keeps generated zip entries simple for iPhone extraction", async () => {
    const archive = await buildExportPackageZip({
      report: { ...seedReports[0], expenseIds: ["exp-email-long-receipt"] },
      expenses: [{
        ...seedExpenses[0],
        id: "exp-email-long-receipt",
        receiptArtifactIds: ["art-email-VI0PR01MB11464D7CB2395693A51245CE8E9132-VI0PR01MB11464-eurprd01"]
      }],
      receiptArtifacts: [{
        id: "art-email-VI0PR01MB11464D7CB2395693A51245CE8E9132-VI0PR01MB11464-eurprd01",
        artifactType: "EmailBody",
        mimeType: "text/plain",
        storageKey: "agentmail/long-message-id",
        createdAt: "2026-05-20T23:42:00.000Z",
        extractedText: "Email receipt text"
      }],
      employeeName: "CASTRO Laurent",
      reportReference: "EXP-1229"
    });
    const zip = await JSZip.loadAsync(archive);
    const paths = Object.keys(zip.files);

    expect(paths).not.toContain("receipts/");
    expect(paths).toContain("receipts/receipt-001-email-receipt.pdf");
    expect(paths.every((path) => path.length <= 64)).toBe(true);
  });

  it("wraps locally stored text receipts in PDF files", async () => {
    const receiptArtifact: ReceiptArtifact = {
      id: "art-uploaded-receipt",
      artifactType: "UploadedImage",
      originalFilename: "receipt.txt",
      mimeType: "text/plain",
      storageKey: "local/receipt.txt",
      createdAt: "2026-05-20T12:00:00.000Z",
      dataUrl: `data:text/plain;base64,${btoa("receipt copy")}`
    };
    const expenses = [
      {
        ...seedExpenses[0],
        receiptArtifactIds: [receiptArtifact.id]
      }
    ];
    const archive = await buildExportPackageZip({
      report: { ...seedReports[0], expenseIds: [expenses[0].id] },
      expenses,
      receiptArtifacts: [receiptArtifact],
      employeeName: "CASTRO Laurent",
      reportReference: "EXP-1229"
    });
    const zip = await JSZip.loadAsync(archive);

    expect(zip.file("receipts/receipt-001-receipt.pdf")).toBeTruthy();
    expect(zip.file("receipts/receipt-001-receipt.txt")).toBeNull();
    await expect(zip.file("receipts/receipt-001-receipt.pdf")?.async("string")).resolves.toMatch(/^%PDF/);
  });

  it("wraps percent-encoded text data URL receipts in PDF files", async () => {
    const receiptArtifact: ReceiptArtifact = {
      id: "art-text-url-receipt",
      artifactType: "UploadedImage",
      originalFilename: "receipt.txt",
      mimeType: "text/plain",
      storageKey: "local/receipt.txt",
      createdAt: "2026-05-20T12:00:00.000Z",
      dataUrl: "data:text/plain,receipt%20copy"
    };
    const expense = {
      ...seedExpenses[0],
      receiptArtifactIds: [receiptArtifact.id]
    };
    const archive = await buildExportPackageZip({
      report: { ...seedReports[0], expenseIds: [expense.id] },
      expenses: [expense],
      receiptArtifacts: [receiptArtifact],
      employeeName: "CASTRO Laurent",
      reportReference: "EXP-1229"
    });
    const zip = await JSZip.loadAsync(archive);

    expect(zip.file("receipts/receipt-001-receipt.pdf")).toBeTruthy();
    await expect(zip.file("receipts/receipt-001-receipt.pdf")?.async("string")).resolves.toMatch(/^%PDF/);
  });

  it("fails closed when building a package with missing referenced receipts", async () => {
    const expense = {
      ...seedExpenses[0],
      receiptArtifactIds: ["missing-artifact"]
    };

    await expect(buildExportPackageZip({
      report: { ...seedReports[0], expenseIds: [expense.id] },
      expenses: [expense],
      receiptArtifacts: [],
      employeeName: "CASTRO Laurent",
      reportReference: "EXP-1229"
    })).rejects.toThrow("Export Package is missing receipt artifacts: missing-artifact");
  });

  it("exports email body receipts as PDF files instead of text fallbacks", async () => {
    const emailArtifact: ReceiptArtifact = {
      id: "art-uber-email",
      artifactType: "EmailBody",
      sourceMessageId: "uber-message-1",
      mimeType: "text/plain",
      storageKey: "agentmail/uber-message-1",
      createdAt: "2026-05-20T12:00:00.000Z",
      extractedText: "Subject: Your trip with Uber\nUber\nTotal $18.42"
    };
    const expense = {
      ...seedExpenses[0],
      sourceType: "Email" as const,
      merchant: "Uber",
      description: "Uber: Chicago office -> Home",
      receiptArtifactIds: [emailArtifact.id]
    };
    const archive = await buildExportPackageZip({
      report: { ...seedReports[0], expenseIds: [expense.id] },
      expenses: [expense],
      receiptArtifacts: [emailArtifact],
      employeeName: "CASTRO Laurent",
      reportReference: "EXP-1229"
    });
    const zip = await JSZip.loadAsync(archive);

    expect(zip.file("receipts/receipt-001-email-receipt.pdf")).toBeTruthy();
    expect(zip.file("receipts/receipt-001-email-receipt.txt")).toBeNull();
    await expect(zip.file("receipts/receipt-001-email-receipt.pdf")?.async("string")).resolves.toMatch(/^%PDF/);
  });

  it("prints stored email HTML through the configured PDF renderer", async () => {
    const html = "<html><body><table><tr><td>Uber formatted receipt</td></tr></table></body></html>";
    const encodedHtml = btoa(html);
    const renderedPdf = new TextEncoder().encode("%PDF-gotenberg-email");
    const renderHtmlToPdf = vi.fn(async () => renderedPdf);
    const emailArtifact: ReceiptArtifact = {
      id: "art-uber-html-email",
      artifactType: "EmailBody",
      sourceMessageId: "uber-message-2",
      mimeType: "text/html",
      storageKey: "agentmail/uber-message-2",
      createdAt: "2026-05-20T12:00:00.000Z",
      extractedText: "Uber\nTotal $18.42",
      dataUrl: `data:text/html;base64,${encodedHtml}`
    };
    const expense = {
      ...seedExpenses[0],
      sourceType: "Email" as const,
      merchant: "Uber",
      description: "Uber",
      receiptArtifactIds: [emailArtifact.id]
    };
    const archive = await buildExportPackageZip({
      report: { ...seedReports[0], expenseIds: [expense.id] },
      expenses: [expense],
      receiptArtifacts: [emailArtifact],
      employeeName: "CASTRO Laurent",
      reportReference: "EXP-1229",
      renderHtmlToPdf
    });
    const zip = await JSZip.loadAsync(archive);

    expect(renderHtmlToPdf).toHaveBeenCalledWith(html, expect.objectContaining({
      filename: "receipt-001-email-receipt.pdf",
      sourceMessageId: "uber-message-2"
    }));
    await expect(zip.file("receipts/receipt-001-email-receipt.pdf")?.async("string")).resolves.toBe("%PDF-gotenberg-email");
  });

  it("wraps scanned receipt image files in PDFs for the expense system", async () => {
    const imageArtifact: ReceiptArtifact = {
      id: "art-scan",
      artifactType: "CameraImage",
      originalFilename: "taxi-receipt.png",
      mimeType: "image/png",
      storageKey: "local/taxi-receipt.png",
      createdAt: "2026-05-20T12:00:00.000Z",
      dataUrl: `data:image/png;base64,${btoa("png bytes")}`
    };
    const expense = {
      ...seedExpenses[1],
      receiptArtifactIds: [imageArtifact.id]
    };
    const archive = await buildExportPackageZip({
      report: { ...seedReports[1], expenseIds: [expense.id] },
      expenses: [expense],
      receiptArtifacts: [imageArtifact],
      employeeName: "CASTRO Laurent",
      reportReference: "EXP-1229"
    });
    const zip = await JSZip.loadAsync(archive);

    expect(zip.file("receipts/receipt-001-taxi-receipt.pdf")).toBeTruthy();
    expect(zip.file("receipts/receipt-001-taxi-receipt.png")).toBeNull();
    expect(zip.file("receipts/receipt-001-taxi-receipt.txt")).toBeNull();
    await expect(zip.file("receipts/receipt-001-taxi-receipt.pdf")?.async("string")).resolves.toMatch(/^%PDF/);
  });

  it("adds a readable PDF expense index to the export package", async () => {
    const archive = await buildExportPackageZip({
      report: seedReports[0],
      expenses: seedExpenses,
      receiptArtifacts: seedArtifacts,
      employeeName: "CASTRO Laurent",
      reportReference: "EXP-1229"
    });
    const zip = await JSZip.loadAsync(archive);

    expect(zip.file("expense-index.pdf")).toBeTruthy();
    expect(zip.file("review-report.txt")).toBeNull();
    await expect(zip.file("expense-index.pdf")?.async("string")).resolves.toMatch(/^%PDF/);
  });
});
