import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { seedArtifacts, seedExpenses, seedReports } from "../fixtures";
import type { ReceiptArtifact } from "../../src/domain/types";
import { buildExportPackageFiles, buildExportPackageZip, buildReadinessChecklist } from "../../src/features/export/exportPackage";

describe("Export Package readiness", () => {
  it("flags missing receipt declarations before export", () => {
    const checklist = buildReadinessChecklist(seedReports[0], seedExpenses);

    expect(checklist.some((item) => item.kind === "declaration")).toBe(true);
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
    expect(files["review-report.txt"]).toContain("Chicago Training - May 2026");
    expect(files["declarations/decl-exp-fuel-training.txt"]).toContain("Gas roundtrip Schererville / Training");
    expect(files["reconciliation-notes.txt"]).toContain("Export Package");
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
    expect(zip.file("review-report.txt")).toBeTruthy();
    expect(zip.file("declarations/decl-exp-fuel-training.txt")).toBeTruthy();
    expect(zip.file("receipts/art-restaurant-receipt-avec-dinner.txt")).toBeTruthy();
  });

  it("includes locally stored receipt binaries in the export package", async () => {
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

    await expect(zip.file("receipts/art-uploaded-receipt-receipt.txt")?.async("string")).resolves.toBe("receipt copy");
  });
});
