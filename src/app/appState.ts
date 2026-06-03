import { buildExpenseFolderDateRangeLabel } from "../domain/reportDates";
import type { Expense, Report } from "../domain/types";

export const defaultFolderId = "report-current";
let fallbackReportIdCounter = 0;

export interface ExpenseFolderDates {
  startDate?: string;
  endDate?: string;
}

export function cloneReports(reports: Report[]) {
  return reports.map((report) => ({ ...report, expenseIds: [...report.expenseIds] }));
}

export function createDefaultReport(expenseIds: string[] = []): Report {
  return {
    id: defaultFolderId,
    name: "Current Expense Folder",
    dateRangeLabel: expenseIds.length > 0 ? "Ready for export package" : "Add expenses to this folder",
    expenseIds,
    status: "Draft",
    createdAt: new Date().toISOString()
  };
}

export function reportForExpense(expense: Expense, reports: Report[]) {
  return reports.find((report) => report.expenseIds.includes(expense.id));
}

export function normalizeExpensesWithReports(expenses: Expense[], reports: Report[]) {
  return expenses.map((expense) => {
    if (expense.reportId && reports.some((report) => report.id === expense.reportId)) {
      return expense;
    }

    const existingReport = reportForExpense(expense, reports);
    if (existingReport) {
      return { ...expense, reportId: existingReport.id };
    }

    return reports.length === 1 ? { ...expense, reportId: reports[0].id } : expense;
  });
}

export function syncReportsWithExpenses(reports: Report[], expenses: Expense[]) {
  return reports.map((report) => {
    const expenseIds = expenses.filter((expense) => expense.reportId === report.id).map((expense) => expense.id);

    return {
      ...report,
      expenseIds,
      dateRangeLabel: reportLabelForExpenseIds(report, expenseIds)
    };
  });
}

export function reportLabelForExpenseIds(report: Report, expenseIds: string[]) {
  if (report.startDate || report.endDate) {
    return buildExpenseFolderDateRangeLabel(report.startDate, report.endDate);
  }

  return expenseIds.length > 0 ? "Ready for export package" : "Add expenses to this folder";
}

export function safeId(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 64) || `${Date.now()}`;
}

export function uniqueReportId(value: string, existingIds: Set<string>) {
  const base = `report-${safeId(value)}`;

  while (true) {
    fallbackReportIdCounter += 1;
    const suffix = globalThis.crypto?.randomUUID?.() ?? `${nowTimestamp()}-${fallbackReportIdCounter}`;
    const id = `${base}-${suffix}`;

    if (!existingIds.has(id)) return id;
  }
}

function nowTimestamp() {
  return Date.now();
}

export function createExpenseFolderRecord(name: string, dates: ExpenseFolderDates = {}, now = new Date(), existingIds = new Set<string>()) {
  const trimmedName = name.trim();
  if (!trimmedName) return undefined;
  const startDate = dates.startDate || undefined;
  const endDate = dates.endDate || startDate;
  const report: Report = {
    id: uniqueReportId(trimmedName, existingIds),
    name: trimmedName,
    startDate,
    endDate,
    dateRangeLabel: "",
    expenseIds: [],
    status: "Draft",
    createdAt: now.toISOString()
  };
  report.dateRangeLabel = reportLabelForExpenseIds(report, report.expenseIds);

  return report;
}
