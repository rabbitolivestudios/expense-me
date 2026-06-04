import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { expenseFolderDateRangeLabel } from "../../domain/reportDates";
import type { Expense, ReceiptArtifact, Report } from "../../domain/types";
import { isMealExpenseType } from "../../domain/options";
import { createDeclarationText } from "../declarations/declaration";

export interface ReadinessItem {
  kind: "field" | "receipt" | "declaration" | "fx" | "duplicate";
  expenseId: string;
  message: string;
}

const requiredFields: Array<keyof Pick<Expense, "expenseType" | "subExpenseType" | "expenseDate" | "region" | "country" | "city" | "description" | "paymentMethod" | "originalAmount" | "originalCurrency">> = [
  "expenseType",
  "subExpenseType",
  "expenseDate",
  "region",
  "country",
  "city",
  "description",
  "paymentMethod",
  "originalAmount",
  "originalCurrency"
];

const requiredFieldLabels: Record<(typeof requiredFields)[number], string> = {
  expenseType: "Expense type",
  subExpenseType: "Sub expense type",
  expenseDate: "Expense date",
  region: "Region",
  country: "Country",
  city: "City",
  description: "Expense description",
  paymentMethod: "Payment method",
  originalAmount: "Amount",
  originalCurrency: "Currency"
};

function expenseTitle(expense: Expense) {
  return expense.merchant || expense.description || expense.id;
}

function readinessMessage(expense: Expense, message: string) {
  return `${expenseTitle(expense)} (${expense.expenseDate}): ${message}`;
}

function needsFinalUsd(expense: Expense) {
  return expense.originalCurrency !== "USD" && (!Number.isFinite(expense.finalUsdAmount) || Number(expense.finalUsdAmount) <= 0);
}

function missingExpenseIds(report: Report, expenses: Expense[]) {
  const expenseIds = new Set(expenses.map((expense) => expense.id));
  return report.expenseIds.filter((expenseId) => !expenseIds.has(expenseId));
}

function missingReceiptArtifactIds(expenses: Expense[], receiptArtifacts: ReceiptArtifact[] | undefined) {
  if (!receiptArtifacts) return [];

  const artifactIds = new Set(receiptArtifacts.map((artifact) => artifact.id));
  return expenses.flatMap((expense) =>
    expense.receiptArtifactIds
      .filter((artifactId) => !artifactIds.has(artifactId))
      .map((artifactId) => ({ expense, artifactId }))
  );
}

export function buildReadinessChecklist(report: Report, expenses: Expense[], receiptArtifacts?: ReceiptArtifact[]): ReadinessItem[] {
  const reportExpenses = expenses.filter((expense) => report.expenseIds.includes(expense.id));
  const items: ReadinessItem[] = [];

  for (const expenseId of missingExpenseIds(report, expenses)) {
    items.push({ kind: "field", expenseId, message: `Unknown expense (${expenseId}): Expense record is missing.` });
  }

  for (const expense of reportExpenses) {
    if (expense.reportId !== report.id) {
      items.push({ kind: "field", expenseId: expense.id, message: readinessMessage(expense, "Expense Folder is required.") });
    }

    for (const field of requiredFields) {
      if (!expense[field]) {
        items.push({ kind: "field", expenseId: expense.id, message: readinessMessage(expense, `${requiredFieldLabels[field]} is required.`) });
      }
    }

    if (isMealExpenseType(expense.expenseType) && !expense.mealPeopleCount) {
      items.push({ kind: "field", expenseId: expense.id, message: readinessMessage(expense, "Meal expenses require number of people.") });
    }

    if (expense.receiptArtifactIds.length === 0 && !expense.declarationId) {
      items.push({ kind: "declaration", expenseId: expense.id, message: readinessMessage(expense, "Missing receipt declaration is required.") });
    }

    if (
      receiptArtifacts &&
      expense.receiptArtifactIds.length > 0 &&
      missingReceiptArtifactIds([expense], receiptArtifacts).length > 0 &&
      !expense.declarationId
    ) {
      items.push({ kind: "receipt", expenseId: expense.id, message: readinessMessage(expense, "Receipt evidence is missing from stored artifacts.") });
    }

    if ((expense.status === "FX" || needsFinalUsd(expense)) && !items.some((item) => item.kind === "fx" && item.expenseId === expense.id)) {
      items.push({ kind: "fx", expenseId: expense.id, message: readinessMessage(expense, "Confirm final USD amount and FX details.") });
    }

    if (expense.status === "Duplicate") {
      items.push({ kind: "duplicate", expenseId: expense.id, message: readinessMessage(expense, "Duplicate must be resolved or acknowledged.") });
    }
  }

  return items;
}

export interface ExportPackageBuildInput {
  report: Report;
  expenses: Expense[];
  receiptArtifacts?: ReceiptArtifact[];
  employeeName: string;
  reportReference: string;
  renderHtmlToPdf?: RenderHtmlToPdf;
}

export type ExportPackageFiles = Record<string, string>;

export interface HtmlPdfRenderContext {
  artifactId: string;
  filename: string;
  sourceMessageId?: string;
}

export type RenderHtmlToPdf = (html: string, context: HtmlPdfRenderContext) => Promise<Uint8Array>;

const csvHeaders = [
  "Expense folder",
  "Expense type",
  "Sub expense type",
  "Expense date",
  "Region",
  "Country",
  "City",
  "Expense description",
  "Payment method",
  "Amount",
  "Currency",
  "Final USD",
  "FX rate",
  "Foreign transaction fee",
  "Meal people count",
  "Attendee names",
  "Receipt or declaration"
];

function reportExpenses(report: Report, expenses: Expense[]) {
  return expenses.filter((expense) => report.expenseIds.includes(expense.id));
}

function safeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-").replace(/^-|-$/g, "") || "receipt";
}

function filenameBase(value: string) {
  return safeFilename(value).replace(/\.[^.]+$/, "") || "receipt";
}

function compactFilenameBase(value: string, maxCharacters: number) {
  const safe = filenameBase(value);
  if (safe.length <= maxCharacters) return safe;
  return safe.slice(0, maxCharacters).replace(/-+$/g, "") || "receipt";
}

function artifactPdfFilename(artifact: ReceiptArtifact, index: number) {
  const base = artifact.originalFilename
    ? compactFilenameBase(artifact.originalFilename, 39)
    : artifact.artifactType === "EmailBody"
      ? "email-receipt"
      : compactFilenameBase(artifact.id, 39);

  return `receipt-${String(index + 1).padStart(3, "0")}-${base}.pdf`;
}

function dataUrlToBytes(dataUrl: string) {
  const [, base64 = ""] = dataUrl.split(",");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function dataUrlMimeType(dataUrl: string) {
  return dataUrl.match(/^data:([^;,]+)/)?.[1];
}

function dataUrlToText(dataUrl: string) {
  const [, payload = ""] = dataUrl.split(",");
  if (dataUrl.includes(";base64,")) {
    const bytes = dataUrlToBytes(dataUrl);
    return new TextDecoder().decode(bytes);
  }

  return decodeURIComponent(payload);
}

function evidenceLabel(expense: Expense) {
  if (expense.receiptArtifactIds.length > 0) {
    return `Receipt attached: ${expense.receiptArtifactIds.join("; ")}`;
  }

  if (expense.declarationId) {
    return `Declaration: ${expense.declarationId}`;
  }

  return "Missing evidence";
}

function csvCell(value: string | number | undefined) {
  const text = value === undefined ? "" : String(value);
  const safeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
}

function buildEntryCsv(report: Report, expenses: Expense[]) {
  const rows = expenses.map((expense) =>
    [
      report.name,
      expense.expenseType,
      expense.subExpenseType,
      expense.expenseDate,
      expense.region,
      expense.country,
      expense.city,
      expense.description,
      expense.paymentMethod,
      expense.originalAmount.toFixed(2),
      expense.originalCurrency,
      expense.finalUsdAmount?.toFixed(2),
      expense.fxRate,
      expense.foreignTransactionFee?.toFixed(2),
      expense.mealPeopleCount,
      expense.attendeeNames?.join("; "),
      evidenceLabel(expense)
    ].map(csvCell).join(",")
  );

  return [csvHeaders.join(","), ...rows].join("\n");
}

function buildReviewReport(report: Report, expenses: Expense[]) {
  return [
    `Export Package Expense Index: ${report.name}`,
    `Date range: ${expenseFolderDateRangeLabel(report)}`,
    `Expense count: ${expenses.length}`,
    "",
    ...expenses.flatMap((expense, index) => [
      `${index + 1}. ${expense.expenseDate} | ${expense.expenseType} / ${expense.subExpenseType}`,
      `Merchant: ${expense.merchant ?? "Not specified"}`,
      `Description: ${expense.description}`,
      `Amount: ${expense.originalAmount.toFixed(2)} ${expense.originalCurrency}${expense.finalUsdAmount ? ` | Final USD ${expense.finalUsdAmount.toFixed(2)}` : ""}`,
      `Location: ${expense.region}, ${expense.country}, ${expense.city}`,
      `Payment: ${expense.paymentMethod}`,
      `Evidence: ${evidenceLabel(expense)}`,
      ""
    ])
  ].join("\n");
}

function buildReconciliationNotes(report: Report, expenses: Expense[]) {
  const matched = expenses.filter((expense) => expense.statementChargeMatchId);
  const needsFx = expenses.filter((expense) => expense.status === "FX");

  return [
    `Export Package reconciliation notes for ${report.name}`,
    `Matched card charges: ${matched.length}`,
    `FX/manual confirmations still needed: ${needsFx.length}`,
    "",
    ...expenses.map((expense) => {
      if (expense.statementChargeMatchId) {
        return `${expense.id}: matched to ${expense.statementChargeMatchId}; card final USD is source of truth.`;
      }
      if (expense.finalUsdAmount && expense.originalCurrency !== "USD") {
        return `${expense.id}: final USD manually confirmed at ${expense.finalUsdAmount.toFixed(2)}.`;
      }
      return `${expense.id}: no statement match recorded.`;
    })
  ].join("\n");
}

export function buildExportPackageFiles(input: ExportPackageBuildInput): ExportPackageFiles {
  const expenses = reportExpenses(input.report, input.expenses);
  const files: ExportPackageFiles = {
    "entry-spreadsheet.csv": buildEntryCsv(input.report, expenses),
    "expense-index.source.txt": buildReviewReport(input.report, expenses),
    "reconciliation-notes.source.txt": buildReconciliationNotes(input.report, expenses)
  };

  for (const expense of expenses) {
    if (expense.declarationId) {
      files[`declarations/${expense.declarationId}.source.txt`] = createDeclarationText(
        expense,
        input.employeeName,
        input.reportReference
      );
    }
  }

  return files;
}

function wrapText(text: string, maxCharacters: number) {
  const lines: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    let line = "";

    if (words.length === 0) {
      lines.push("");
      continue;
    }

    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxCharacters && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }

    lines.push(line);
  }

  return lines;
}

async function buildTextPdf(title: string, text: string) {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  const fontSize = 10;
  const lineHeight = 14;
  const titleSize = 16;
  const lines = wrapText(text, 92);
  let page = pdf.addPage([612, 792]);
  let y = 792 - margin;

  page.drawText(title, {
    x: margin,
    y,
    size: titleSize,
    font: boldFont,
    color: rgb(0.08, 0.06, 0.18)
  });
  y -= 28;

  for (const line of lines) {
    if (y < margin) {
      page = pdf.addPage([612, 792]);
      y = 792 - margin;
    }

    page.drawText(line || " ", {
      x: margin,
      y,
      size: fontSize,
      font: regularFont,
      color: rgb(0.08, 0.06, 0.18)
    });
    y -= lineHeight;
  }

  return pdf.save();
}

async function buildImagePdf(bytes: Uint8Array, mimeType: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const image = mimeType === "image/png"
    ? await pdf.embedPng(bytes)
    : await pdf.embedJpg(bytes);
  const margin = 36;
  const maxWidth = page.getWidth() - margin * 2;
  const maxHeight = page.getHeight() - margin * 2;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;

  page.drawImage(image, {
    x: (page.getWidth() - width) / 2,
    y: (page.getHeight() - height) / 2,
    width,
    height
  });

  return pdf.save();
}

async function buildArtifactPdf(
  artifact: ReceiptArtifact,
  options: { filename: string; renderHtmlToPdf?: RenderHtmlToPdf }
) {
  if (artifact.artifactType === "EmailBody") {
    const mimeType = artifact.dataUrl ? dataUrlMimeType(artifact.dataUrl) ?? artifact.mimeType : artifact.mimeType;

    if (artifact.dataUrl && mimeType === "text/html" && options.renderHtmlToPdf) {
      const rendered = await options.renderHtmlToPdf(dataUrlToText(artifact.dataUrl), {
        artifactId: artifact.id,
        filename: options.filename,
        sourceMessageId: artifact.sourceMessageId
      });
      return new Uint8Array(rendered);
    }

    return buildTextPdf("Email Receipt", artifact.extractedText ?? "Email receipt content was not stored.");
  }

  if (artifact.dataUrl) {
    const mimeType = dataUrlMimeType(artifact.dataUrl) ?? artifact.mimeType;

    if (mimeType === "text/plain") {
      return buildTextPdf(artifact.originalFilename ?? "Receipt", dataUrlToText(artifact.dataUrl));
    }

    const bytes = dataUrlToBytes(artifact.dataUrl);

    if (mimeType === "application/pdf") {
      return bytes;
    }

    if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/jpg") {
      try {
        return await buildImagePdf(bytes, mimeType);
      } catch {
        return buildTextPdf(
          artifact.originalFilename ?? artifact.id,
          [
            `Receipt artifact: ${artifact.id}`,
            `Original filename: ${artifact.originalFilename ?? "Not available"}`,
            `MIME type: ${artifact.mimeType}`,
            "",
            artifact.extractedText ?? "The receipt image could not be embedded in this generated PDF."
          ].join("\n")
        );
      }
    }
  }

  return buildTextPdf(
    artifact.originalFilename ?? artifact.id,
    [
      `Receipt artifact: ${artifact.id}`,
      `Type: ${artifact.artifactType}`,
      `Original filename: ${artifact.originalFilename ?? "Not available"}`,
      `Source message: ${artifact.sourceMessageId ?? "Not available"}`,
      "",
      artifact.extractedText ?? "Receipt copy is referenced by artifact id but binary content is not stored locally."
    ].join("\n")
  );
}

function addZipFile(zip: JSZip, path: string, contents: string | Uint8Array) {
  zip.file(path, contents, { createFolders: false });
}

export async function buildExportPackageZip(input: ExportPackageBuildInput) {
  const missingExpenses = missingExpenseIds(input.report, input.expenses);
  if (missingExpenses.length > 0) {
    throw new Error(`Export Package is missing expenses: ${missingExpenses.join(", ")}`);
  }

  const zip = new JSZip();
  const files = buildExportPackageFiles(input);
  const expenses = reportExpenses(input.report, input.expenses);
  const receiptArtifactIds = new Set(expenses.flatMap((expense) => expense.receiptArtifactIds));
  const receiptArtifacts = (input.receiptArtifacts ?? []).filter((artifact) => receiptArtifactIds.has(artifact.id));
  const missingReceipts = missingReceiptArtifactIds(expenses, input.receiptArtifacts ?? []);

  if (missingReceipts.length > 0) {
    throw new Error(`Export Package is missing receipt artifacts: ${missingReceipts.map((item) => item.artifactId).join(", ")}`);
  }

  if (files["entry-spreadsheet.csv"]) {
    addZipFile(zip, "entry-spreadsheet.csv", files["entry-spreadsheet.csv"]);
  }

  if (files["expense-index.source.txt"]) {
    addZipFile(zip, "expense-index.pdf", await buildTextPdf("Export Package Expense Index", files["expense-index.source.txt"]));
  }

  if (files["reconciliation-notes.source.txt"]) {
    addZipFile(
      zip,
      "reconciliation-notes.pdf",
      await buildTextPdf("Export Package Reconciliation Notes", files["reconciliation-notes.source.txt"])
    );
  }

  for (const [path, contents] of Object.entries(files)) {
    const declarationMatch = path.match(/^declarations\/(.+)\.source\.txt$/);
    if (declarationMatch) {
      addZipFile(zip, `declarations/${declarationMatch[1]}.pdf`, await buildTextPdf("Missing Receipt Declaration", contents));
    }
  }

  if (receiptArtifacts.length > 0) {
    for (const [index, artifact] of receiptArtifacts.entries()) {
      const filename = artifactPdfFilename(artifact, index);
      addZipFile(zip, `receipts/${filename}`, await buildArtifactPdf(artifact, {
        filename,
        renderHtmlToPdf: input.renderHtmlToPdf
      }));
    }
  }

  addZipFile(
    zip,
    "receipts/README.pdf",
    await buildTextPdf(
      "Receipts Folder",
      receiptArtifacts.length > 0
        ? "Receipt/evidence PDFs in this folder correspond to the Receipt or declaration column in entry-spreadsheet.csv."
        : "No receipt binaries were stored for this export. Missing receipts require declarations in the declarations folder."
    )
  );

  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "UNIX"
  });
}
