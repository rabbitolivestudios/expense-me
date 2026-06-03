import Papa from "papaparse";
import type { StatementCharge } from "../../domain/types";

type CsvRow = Record<string, string | undefined>;

const transactionDateHeaders = ["Transaction Date", "Date", "Trans Date"];
const postedDateHeaders = ["Posted Date", "Post Date", "Posting Date"];
const descriptionHeaders = ["Description", "Merchant", "Name"];
const amountHeaders = ["Amount", "Original Amount", "Transaction Amount"];
const currencyHeaders = ["Currency", "Original Currency"];
const finalUsdHeaders = ["Final USD", "Final USD Amount", "USD Amount", "Amount USD"];
const fxRateHeaders = ["FX Rate", "Exchange Rate", "Conversion Rate"];
const feeHeaders = ["Fee", "Foreign Transaction Fee", "Foreign Fee"];

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readField(row: CsvRow, headers: string[]) {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value?.trim()])
  );

  for (const header of headers) {
    const value = normalized.get(normalizeHeader(header));
    if (value) return value;
  }

  return undefined;
}

function parseMoney(value?: string) {
  if (!value) return undefined;

  const negative = value.trim().startsWith("(") && value.trim().endsWith(")");
  const cleaned = value.replace(/[$,()\s]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return undefined;

  return negative ? -parsed : parsed;
}

function parseOptionalNumber(value?: string) {
  const parsed = parseMoney(value);
  return parsed === undefined ? undefined : Math.abs(parsed);
}

function normalizeDate(value?: string) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const slashDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!slashDate) return value;

  const [, month, day, year] = slashDate;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseStatementCsv(csv: string, statementImportId: string, cardLabel: string): StatementCharge[] {
  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length > 0) {
    throw new Error(`Statement CSV import failed: ${parsed.errors[0].message}`);
  }

  return parsed.data.map((row, index) => {
    const originalAmount = Math.abs(parseMoney(readField(row, amountHeaders)) ?? 0);
    const finalUsdAmount = Math.abs(parseMoney(readField(row, finalUsdHeaders)) ?? originalAmount);
    const transactionDate = normalizeDate(readField(row, transactionDateHeaders)) || new Date().toISOString().slice(0, 10);
    const postedDate = normalizeDate(readField(row, postedDateHeaders));

    return {
      id: `${statementImportId}-${index}`,
      statementImportId,
      cardLabel,
      transactionDate,
      postedDate,
      description: readField(row, descriptionHeaders) || "Imported statement charge",
      originalAmount,
      originalCurrency: (readField(row, currencyHeaders) || "USD").toUpperCase(),
      finalUsdAmount,
      fxRate: parseOptionalNumber(readField(row, fxRateHeaders)),
      foreignTransactionFee: parseOptionalNumber(readField(row, feeHeaders)),
      matchStatus: "Unmatched"
    };
  });
}
