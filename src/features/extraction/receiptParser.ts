export interface ParsedReceipt {
  merchant?: string;
  expenseDate?: string;
  originalAmount?: number;
  originalCurrency?: string;
  confidence: number;
}

const currencyPattern = /\b(USD|EUR|GBP|CAD|MXN)\b/i;

function normalizeDate(value: string) {
  const [month, day, year] = value.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseAmount(text: string) {
  const totalLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /total|amount|paid/i.test(line) && /\d{1,3}(?:,\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2}/.test(line));
  const source = totalLine ?? text;
  const amountMatch = source.match(/\b(?:USD|EUR|GBP|CAD|MXN)?\s?\$?\s?((?:\d{1,3}(?:,\d{3})+|\d+)(?:[.,]\d{2}))\b/i);

  if (!amountMatch) return undefined;

  const token = amountMatch[1];
  const hasComma = token.includes(",");
  const hasDot = token.includes(".");
  const normalized = hasComma && hasDot
    ? token.lastIndexOf(",") > token.lastIndexOf(".")
      ? token.replace(/\./g, "").replace(",", ".")
      : token.replace(/,/g, "")
    : token.replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dateMatch = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
  const amount = parseAmount(text);
  const currency = text.match(currencyPattern)?.[1]?.toUpperCase() ?? (text.includes("$") ? "USD" : "USD");

  return {
    merchant: lines[0],
    expenseDate: dateMatch ? normalizeDate(dateMatch[1]) : undefined,
    originalAmount: amount,
    originalCurrency: currency,
    confidence: dateMatch && amount ? 0.78 : 0.45
  };
}
