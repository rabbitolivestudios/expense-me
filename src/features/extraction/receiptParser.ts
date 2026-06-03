export interface ParsedReceipt {
  merchant?: string;
  expenseDate?: string;
  originalAmount?: number;
  originalCurrency?: string;
  confidence: number;
}

const supportedCurrencyCodes = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "SGD", "CNY", "HKD", "MXN", "BRL", "AED", "SAR", "SEK", "NOK", "DKK"];
const currencyPattern = new RegExp(`\\b(${supportedCurrencyCodes.join("|")})\\b`, "i");
const moneyPattern = new RegExp(`\\b(?:${supportedCurrencyCodes.join("|")})?\\s?[$€£¥]?\\s?((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:[.,]\\d{2}))\\b`, "gi");
const monthNames: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12"
};

function normalizeDate(value: string) {
  const [month, day, year] = value.split("/");
  const normalizedYear = year.length === 2 ? `20${year}` : year;
  return normalizeDateParts(normalizedYear, month, day);
}

function normalizeMonthDate(month: string, day: string, year: string) {
  const normalizedMonth = monthNames[month.toLowerCase()];
  if (!normalizedMonth) return undefined;

  return normalizeDateParts(year, normalizedMonth, day);
}

function normalizeDateParts(year: string, month: string, day: string) {
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const parsed = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));

  if (
    !Number.isInteger(yearNumber) ||
    !Number.isInteger(monthNumber) ||
    !Number.isInteger(dayNumber) ||
    parsed.getUTCFullYear() !== yearNumber ||
    parsed.getUTCMonth() !== monthNumber - 1 ||
    parsed.getUTCDate() !== dayNumber
  ) {
    return undefined;
  }

  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
}

function parseDate(text: string) {
  const numericDateMatch = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  if (numericDateMatch) {
    return normalizeDate(numericDateMatch[1]);
  }

  const monthFirstMatch = text.match(
    /\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)?,?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?|September|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i
  );
  if (monthFirstMatch) {
    return normalizeMonthDate(monthFirstMatch[1], monthFirstMatch[2], monthFirstMatch[3]);
  }

  const dayFirstMatch = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?|September|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?),?\s+(\d{4})\b/i
  );

  return dayFirstMatch ? normalizeMonthDate(dayFirstMatch[2], dayFirstMatch[1], dayFirstMatch[3]) : undefined;
}

function parseMoneyToken(token: string) {
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

function amountsInLine(line: string) {
  return [...line.matchAll(moneyPattern)]
    .map((match) => parseMoneyToken(match[1]))
    .filter((amount): amount is number => amount !== undefined);
}

function parseAmount(text: string) {
  const priorityLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /total|amount|paid|charged|payment|trip fare|\bfare\b/i.test(line) && !/subtotal|tip|gratuity|discount|refund/i.test(line));

  const priorityAmounts = priorityLines.flatMap(amountsInLine);
  if (priorityAmounts.length > 0) return priorityAmounts.at(-1);

  const amounts = amountsInLine(text);
  if (amounts.length === 0) return undefined;

  return amounts.reduce((largest, amount) => (amount > largest ? amount : largest), amounts[0]);
}

function isNoiseLine(line: string) {
  return /^(fw|fwd|re):/i.test(line) ||
    /^(from|to|sent|subject|date):/i.test(line) ||
    /<[^>]+@[^>]+>/.test(line) ||
    /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(line) ||
    /^preview:/i.test(line);
}

function parseMerchant(text: string, lines: string[]) {
  if (/\bUber\b/i.test(text)) {
    return "Uber";
  }

  return lines.find((line) => !isNoiseLine(line));
}

function parseCurrency(text: string) {
  const explicitCurrency = text.match(currencyPattern)?.[1]?.toUpperCase();
  if (explicitCurrency) return explicitCurrency;
  if (text.includes("€")) return "EUR";
  if (text.includes("£")) return "GBP";
  if (text.includes("¥")) return "JPY";
  return "USD";
}

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const date = parseDate(text);
  const amount = parseAmount(text);
  const currency = parseCurrency(text);

  return {
    merchant: parseMerchant(text, lines),
    expenseDate: date,
    originalAmount: amount,
    originalCurrency: currency,
    confidence: date && amount ? 0.78 : 0.45
  };
}
