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
    .find((line) => /total|amount|paid/i.test(line) && /\d+[.,]\d{2}/.test(line));
  const source = totalLine ?? text;
  const amountMatch = source.match(/\b(?:USD|EUR|GBP|CAD|MXN)?\s?\$?\s?(\d+[.,]\d{2})\b/i);

  return amountMatch ? Number(amountMatch[1].replace(",", ".")) : undefined;
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
