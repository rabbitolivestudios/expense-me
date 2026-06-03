import type { Report } from "./types";

function formatIsoDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

export function buildExpenseFolderDateRangeLabel(startDate?: string, endDate?: string, fallback = "Add expenses to this folder") {
  if (startDate && endDate) {
    return startDate === endDate ? formatIsoDate(startDate) : `${formatIsoDate(startDate)} to ${formatIsoDate(endDate)}`;
  }

  if (startDate) return `From ${formatIsoDate(startDate)}`;
  if (endDate) return `Through ${formatIsoDate(endDate)}`;

  return fallback;
}

export function expenseFolderDateRangeLabel(report: Report) {
  return buildExpenseFolderDateRangeLabel(report.startDate, report.endDate, report.dateRangeLabel);
}
