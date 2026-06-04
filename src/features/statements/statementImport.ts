import Papa from "papaparse";
import JSZip from "jszip";
import { inferLocationFromStatementFields } from "../../domain/location";
import type { StatementCharge } from "../../domain/types";

type CsvRow = Record<string, string | undefined>;
type StatementImportRow = {
  row: CsvRow;
  rowNumber: number;
};

const transactionDateHeaders = ["Transaction Date", "Date", "Trans Date"];
const postedDateHeaders = ["Posted Date", "Post Date", "Posting Date"];
const descriptionHeaders = ["Description", "Merchant", "Name", "Merchant Name"];
const amountHeaders = ["Amount", "Original Amount", "Transaction Amount", "Original amount"];
const currencyHeaders = ["Currency", "Original Currency"];
const finalUsdHeaders = ["Final USD", "Final USD Amount", "USD Amount", "Amount USD", "Billed Amount"];
const fxRateHeaders = ["FX Rate", "Exchange Rate", "Conversion Rate"];
const feeHeaders = ["Fee", "Foreign Transaction Fee", "Foreign Fee"];
const debitCreditHeaders = ["Debit/Credit", "Debit Credit", "Credit/Debit", "Transaction Type", "Type"];
const cityHeaders = ["City", "Merchant City", "Merchant city"];
const stateHeaders = ["State", "Province", "Merchant State", "Merchant Province", "Merchant state/province"];
const countryHeaders = ["Country", "Merchant Country", "Merchant country"];

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

  const trimmed = value.trim();
  const negative = trimmed.startsWith("(") && trimmed.endsWith(")");
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

  const excelSerial = Number(value);
  if (/^\d+(\.\d+)?$/.test(value) && excelSerial > 20000 && excelSerial < 60000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(excelSerial) * 86400000);
    return date.toISOString().slice(0, 10);
  }

  const slashDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!slashDate) return value;

  const [, month, day, year] = slashDate;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function rowError(index: number, message: string, sourceLabel = "Statement CSV", rowNumber = index + 2) {
  return new Error(`${sourceLabel} row ${rowNumber}: ${message}`);
}

function chargeIdPart(value: string | number | undefined) {
  return String(value ?? "none")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "none";
}

function moneyIdPart(value: number) {
  return value.toFixed(2).replace(".", "-");
}

function stableChargeId(input: {
  cardLabel: string;
  transactionDate: string;
  postedDate?: string;
  description: string;
  originalAmount: number;
  originalCurrency: string;
  finalUsdAmount: number;
}) {
  return [
    "charge",
    chargeIdPart(input.cardLabel),
    chargeIdPart(input.transactionDate),
    chargeIdPart(input.postedDate),
    chargeIdPart(input.description),
    moneyIdPart(input.originalAmount),
    chargeIdPart(input.originalCurrency),
    moneyIdPart(input.finalUsdAmount)
  ].join("-");
}

function requireText(row: CsvRow, index: number, headers: string[], label: string, sourceLabel?: string, rowNumber?: number) {
  const value = readField(row, headers);
  if (!value) throw rowError(index, `${label} is required.`, sourceLabel, rowNumber);
  return value;
}

function parseRequiredMoney(row: CsvRow, index: number, headers: string[], label: string, sourceLabel?: string, rowNumber?: number) {
  const rawValue = requireText(row, index, headers, label, sourceLabel, rowNumber);
  const parsed = parseMoney(rawValue);
  if (parsed === undefined) throw rowError(index, `${label} must be a valid number.`, sourceLabel, rowNumber);
  return Math.abs(parsed);
}

function parseOptionalMoney(row: CsvRow, index: number, headers: string[], label: string, sourceLabel?: string, rowNumber?: number) {
  const rawValue = readField(row, headers);
  if (!rawValue) return undefined;

  const parsed = parseMoney(rawValue);
  if (parsed === undefined) throw rowError(index, `${label} must be a valid number.`, sourceLabel, rowNumber);
  return Math.abs(parsed);
}

function parseOptionalNumberField(row: CsvRow, index: number, headers: string[], label: string, sourceLabel?: string, rowNumber?: number) {
  const rawValue = readField(row, headers);
  if (!rawValue) return undefined;

  const parsed = parseOptionalNumber(rawValue);
  if (parsed === undefined) throw rowError(index, `${label} must be a valid number.`, sourceLabel, rowNumber);
  return parsed;
}

function normalizeRequiredDate(row: CsvRow, index: number, sourceLabel?: string, rowNumber?: number) {
  const rawValue = requireText(row, index, transactionDateHeaders, "Transaction date", sourceLabel, rowNumber);
  const normalized = normalizeDate(rawValue);
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw rowError(index, "Transaction date must be a valid date.", sourceLabel, rowNumber);
  }

  return normalized;
}

function isCreditRow(row: CsvRow) {
  const debitCredit = readField(row, debitCreditHeaders)?.toLowerCase();
  return debitCredit === "credit" || debitCredit === "cr";
}

function parseStatementRows(
  rows: StatementImportRow[],
  statementImportId: string,
  cardLabel: string,
  sourceLabel = "Statement CSV"
): StatementCharge[] {
  return rows.flatMap(({ row, rowNumber }, index) => {
    if (isCreditRow(row)) return [];

    const originalAmount = parseRequiredMoney(row, index, amountHeaders, "Amount", sourceLabel, rowNumber);
    const originalCurrency = (readField(row, currencyHeaders) || "USD").toUpperCase();
    const finalUsdFromCsv = parseOptionalMoney(row, index, finalUsdHeaders, "Final USD", sourceLabel, rowNumber);
    const fxRate = parseOptionalNumberField(row, index, fxRateHeaders, "FX Rate", sourceLabel, rowNumber);
    const foreignTransactionFee = parseOptionalMoney(row, index, feeHeaders, "Foreign transaction fee", sourceLabel, rowNumber);
    const finalUsdAmount =
      finalUsdFromCsv ??
      (originalCurrency === "USD"
        ? originalAmount
        : fxRate
          ? Number((originalAmount * fxRate + (foreignTransactionFee ?? 0)).toFixed(2))
          : undefined);
    const transactionDate = normalizeRequiredDate(row, index, sourceLabel, rowNumber);
    const postedDate = normalizeDate(readField(row, postedDateHeaders));
    const description = requireText(row, index, descriptionHeaders, "Description", sourceLabel, rowNumber);
    const location = inferLocationFromStatementFields({
      city: readField(row, cityHeaders),
      stateOrProvince: readField(row, stateHeaders),
      country: readField(row, countryHeaders),
      currency: originalCurrency
    });

    if (finalUsdAmount === undefined) {
      throw rowError(index, "Final USD or FX Rate is required for non-USD charges.", sourceLabel, rowNumber);
    }

    return [{
      id: stableChargeId({ cardLabel, transactionDate, postedDate, description, originalAmount, originalCurrency, finalUsdAmount }),
      statementImportId,
      cardLabel,
      transactionDate,
      postedDate,
      description,
      merchantCity: location.city,
      merchantCountry: location.country,
      merchantRegion: location.region,
      originalAmount,
      originalCurrency,
      finalUsdAmount,
      fxRate,
      foreignTransactionFee,
      matchStatus: "Unmatched" as const
    }];
  });
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

  return parseStatementRows(
    parsed.data.map((row, index) => ({ row, rowNumber: index + 2 })),
    statementImportId,
    cardLabel
  );
}

function decodeSgmlText(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readSgmlTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return match?.[1] ? decodeSgmlText(match[1].trim()) : undefined;
}

function normalizeOfxDate(value?: string) {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function parseStatementQbo(qbo: string, statementImportId: string, cardLabel: string): StatementCharge[] {
  const currency = (readSgmlTag(qbo, "CURDEF") || "USD").toUpperCase();
  const transactions = [...qbo.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)];

  return transactions.flatMap((match, index) => {
    const block = match[1];
    const transactionType = readSgmlTag(block, "TRNTYPE")?.toUpperCase();
    const rawAmount = readSgmlTag(block, "TRNAMT");
    const signedAmount = parseMoney(rawAmount);

    if (signedAmount === undefined) {
      throw rowError(index, "Amount must be a valid number.", "Statement QBO", index + 1);
    }

    if (transactionType === "CREDIT" || signedAmount > 0) return [];

    const transactionDate = normalizeOfxDate(readSgmlTag(block, "DTUSER")) ?? normalizeOfxDate(readSgmlTag(block, "DTPOSTED"));
    const postedDate = normalizeOfxDate(readSgmlTag(block, "DTPOSTED"));
    const description = readSgmlTag(block, "NAME") ?? readSgmlTag(block, "MEMO");
    const originalAmount = Math.abs(signedAmount);

    if (!transactionDate) throw rowError(index, "Transaction date is required.", "Statement QBO", index + 1);
    if (!description) throw rowError(index, "Description is required.", "Statement QBO", index + 1);

    return [{
      id: stableChargeId({
        cardLabel,
        transactionDate,
        postedDate,
        description,
        originalAmount,
        originalCurrency: currency,
        finalUsdAmount: originalAmount
      }),
      statementImportId,
      cardLabel,
      transactionDate,
      postedDate,
      description,
      originalAmount,
      originalCurrency: currency,
      finalUsdAmount: originalAmount,
      matchStatus: "Unmatched" as const
    }];
  });
}

function parseXmlDocument(xml: string, sourceLabel: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`${sourceLabel} import failed: the workbook XML could not be read.`);
  }
  return document;
}

function xmlElements(root: Document | Element, localName: string) {
  return Array.from(root.getElementsByTagNameNS("*", localName));
}

function columnIndex(cellReference: string) {
  const letters = cellReference.match(/^[A-Z]+/i)?.[0] ?? "";
  return [...letters.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function cellText(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute("t");

  if (type === "inlineStr") {
    return xmlElements(cell, "t").map((node) => node.textContent ?? "").join("");
  }

  const rawValue = xmlElements(cell, "v")[0]?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(rawValue)] ?? "";
  return rawValue;
}

async function readSharedStrings(zip: JSZip) {
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");
  if (!sharedStringsFile) return [];

  const document = parseXmlDocument(await sharedStringsFile.async("string"), "Statement XLSX");
  return xmlElements(document, "si").map((item) => xmlElements(item, "t").map((text) => text.textContent ?? "").join(""));
}

async function readXlsxRows(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const sheetPath = Object.keys(zip.files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort()[0];

  if (!sheetPath) {
    throw new Error("Statement XLSX import failed: no worksheet was found.");
  }

  const sharedStrings = await readSharedStrings(zip);
  const sheet = parseXmlDocument(await zip.file(sheetPath)!.async("string"), "Statement XLSX");

  return xmlElements(sheet, "row").map((row) => {
    const rowNumber = Number(row.getAttribute("r") ?? "0");
    const values: string[] = [];

    for (const cell of xmlElements(row, "c")) {
      const index = columnIndex(cell.getAttribute("r") ?? "");
      if (index >= 0) values[index] = cellText(cell, sharedStrings);
    }

    return {
      rowNumber,
      values: values.map((value) => value ?? "")
    };
  });
}

function looksLikeStatementHeader(values: string[]) {
  const headers = values.map(normalizeHeader);
  return (
    headers.some((header) => ["transactiondate", "transdate", "date"].includes(header)) &&
    headers.some((header) => ["description", "merchant", "name", "merchantname"].includes(header)) &&
    headers.some((header) => ["amount", "originalamount", "transactionamount", "billedamount"].includes(header))
  );
}

export async function parseStatementXlsx(buffer: ArrayBuffer, statementImportId: string, cardLabel: string): Promise<StatementCharge[]> {
  const rows = await readXlsxRows(buffer);
  const headerIndex = rows.findIndex((row) => looksLikeStatementHeader(row.values));

  if (headerIndex === -1) {
    throw new Error("Statement XLSX import failed: no statement header row was found.");
  }

  const headers = rows[headerIndex].values.map((header) => header.trim());
  const importRows = rows.slice(headerIndex + 1)
    .filter((row) => row.values.some((value) => value.trim()))
    .map((row) => ({
      rowNumber: row.rowNumber || rows[headerIndex].rowNumber + 1,
      row: headers.reduce<CsvRow>((fields, header, index) => {
        if (header) fields[header] = row.values[index]?.trim();
        return fields;
      }, {})
    }));

  return parseStatementRows(importRows, statementImportId, cardLabel, "Statement XLSX");
}

function readFileText(file: File) {
  if (typeof file.text === "function") return file.text();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(new Error("Statement import failed. Check the file and try again.")));
    reader.readAsText(file);
  });
}

function readFileArrayBuffer(file: File) {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("Statement import failed. Check the file and try again."));
      }
    });
    reader.addEventListener("error", () => reject(new Error("Statement import failed. Check the file and try again.")));
    reader.readAsArrayBuffer(file);
  });
}

export async function parseStatementFile(file: File, statementImportId: string, cardLabel: string): Promise<StatementCharge[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".qbo") || lowerName.endsWith(".ofx")) {
    return parseStatementQbo(await readFileText(file), statementImportId, cardLabel);
  }

  if (
    lowerName.endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return parseStatementXlsx(await readFileArrayBuffer(file), statementImportId, cardLabel);
  }

  return parseStatementCsv(await readFileText(file), statementImportId, cardLabel);
}
