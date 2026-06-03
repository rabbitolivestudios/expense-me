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

function rowError(index: number, message: string) {
  return new Error(`Statement CSV row ${index + 2}: ${message}`);
}

function requireText(row: CsvRow, index: number, headers: string[], label: string) {
  const value = readField(row, headers);
  if (!value) throw rowError(index, `${label} is required.`);
  return value;
}

function parseRequiredMoney(row: CsvRow, index: number, headers: string[], label: string) {
  const rawValue = requireText(row, index, headers, label);
  const parsed = parseMoney(rawValue);
  if (parsed === undefined) throw rowError(index, `${label} must be a valid number.`);
  return Math.abs(parsed);
}

function parseOptionalMoney(row: CsvRow, index: number, headers: string[], label: string) {
  const rawValue = readField(row, headers);
  if (!rawValue) return undefined;

  const parsed = parseMoney(rawValue);
  if (parsed === undefined) throw rowError(index, `${label} must be a valid number.`);
  return Math.abs(parsed);
}

function parseOptionalNumberField(row: CsvRow, index: number, headers: string[], label: string) {
  const rawValue = readField(row, headers);
  if (!rawValue) return undefined;

  const parsed = parseOptionalNumber(rawValue);
  if (parsed === undefined) throw rowError(index, `${label} must be a valid number.`);
  return parsed;
}

function normalizeRequiredDate(row: CsvRow, index: number) {
  const rawValue = requireText(row, index, transactionDateHeaders, "Transaction date");
  const normalized = normalizeDate(rawValue);
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw rowError(index, "Transaction date must be a valid date.");
  }

  return normalized;
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
    const originalAmount = parseRequiredMoney(row, index, amountHeaders, "Amount");
    const originalCurrency = (readField(row, currencyHeaders) || "USD").toUpperCase();
    const finalUsdFromCsv = parseOptionalMoney(row, index, finalUsdHeaders, "Final USD");
    const fxRate = parseOptionalNumberField(row, index, fxRateHeaders, "FX Rate");
    const foreignTransactionFee = parseOptionalMoney(row, index, feeHeaders, "Foreign transaction fee");
    const finalUsdAmount =
      finalUsdFromCsv ??
      (originalCurrency === "USD"
        ? originalAmount
        : fxRate
          ? Number((originalAmount * fxRate + (foreignTransactionFee ?? 0)).toFixed(2))
          : undefined);
    const transactionDate = normalizeRequiredDate(row, index);
    const postedDate = normalizeDate(readField(row, postedDateHeaders));

    if (finalUsdAmount === undefined) {
      throw rowError(index, "Final USD or FX Rate is required for non-USD charges.");
    }

    return {
      id: `${statementImportId}-${index}`,
      statementImportId,
      cardLabel,
      transactionDate,
      postedDate,
      description: requireText(row, index, descriptionHeaders, "Description"),
      originalAmount,
      originalCurrency,
      finalUsdAmount,
      fxRate,
      foreignTransactionFee,
      matchStatus: "Unmatched"
    };
  });
}
