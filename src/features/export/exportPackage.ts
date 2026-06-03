import JSZip from "jszip";
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

export function buildReadinessChecklist(report: Report, expenses: Expense[]): ReadinessItem[] {
  const reportExpenses = expenses.filter((expense) => report.expenseIds.includes(expense.id));
  const items: ReadinessItem[] = [];

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
}

export type ExportPackageFiles = Record<string, string>;

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

function extensionForMimeType(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "text/plain") return "txt";
  return "jpg";
}

function artifactFilename(artifact: ReceiptArtifact) {
  const filename = artifact.originalFilename
    ? safeFilename(artifact.originalFilename)
    : `${safeFilename(artifact.id)}.${extensionForMimeType(artifact.mimeType)}`;

  return filename.includes(".") ? filename : `${filename}.${extensionForMimeType(artifact.mimeType)}`;
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
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
    `Export Package Review: ${report.name}`,
    `Date range: ${expenseFolderDateRangeLabel(report)}`,
    "",
    ...expenses.flatMap((expense) => [
      `${expense.expenseDate} | ${expense.expenseType} / ${expense.subExpenseType}`,
      `${expense.description}`,
      `${expense.originalAmount.toFixed(2)} ${expense.originalCurrency}${expense.finalUsdAmount ? ` | Final USD ${expense.finalUsdAmount.toFixed(2)}` : ""}`,
      `Location: ${expense.region}, ${expense.country}, ${expense.city}`,
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
    "review-report.txt": buildReviewReport(input.report, expenses),
    "reconciliation-notes.txt": buildReconciliationNotes(input.report, expenses)
  };

  for (const expense of expenses) {
    if (expense.declarationId) {
      files[`declarations/${expense.declarationId}.txt`] = createDeclarationText(
        expense,
        input.employeeName,
        input.reportReference
      );
    }
  }

  return files;
}

export async function buildExportPackageZip(input: ExportPackageBuildInput) {
  const zip = new JSZip();
  const files = buildExportPackageFiles(input);
  const expenses = reportExpenses(input.report, input.expenses);
  const receiptArtifactIds = new Set(expenses.flatMap((expense) => expense.receiptArtifactIds));
  const receiptArtifacts = (input.receiptArtifacts ?? []).filter((artifact) => receiptArtifactIds.has(artifact.id));

  for (const [path, contents] of Object.entries(files)) {
    zip.file(path, contents);
  }

  if (receiptArtifacts.length > 0) {
    const usedPaths = new Set<string>();

    for (const artifact of receiptArtifacts) {
      const basePath = `receipts/${artifact.id}-${artifactFilename(artifact)}`;
      let path = basePath;
      let copy = 2;
      while (usedPaths.has(path)) {
        path = basePath.replace(/(\.[^.]+)?$/, `-${copy}$1`);
        copy += 1;
      }
      usedPaths.add(path);

      if (artifact.dataUrl) {
        zip.file(path, dataUrlToBytes(artifact.dataUrl));
      } else {
        zip.file(
          path.replace(/\.[^.]+$/, ".txt"),
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
    }
  }

  zip.file(
    "receipts/README.txt",
    receiptArtifacts.length > 0
      ? "Receipt/evidence files in this folder correspond to the Receipt or declaration column in entry-spreadsheet.csv."
      : "No receipt binaries were stored for this export. Missing receipts require declarations in the declarations folder."
  );

  return zip.generateAsync({ type: "uint8array" });
}
