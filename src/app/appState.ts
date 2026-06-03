import { buildExpenseFolderDateRangeLabel, expenseFolderDateRangeLabel } from "../domain/reportDates";
import type { Expense, Report } from "../domain/types";

export const defaultFolderId = "report-current";

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
      dateRangeLabel: expenseIds.length > 0 || report.startDate || report.endDate ? expenseFolderDateRangeLabel(report) : "Add expenses to this folder"
    };
  });
}

export function safeId(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 64) || `${Date.now()}`;
}

export function createExpenseFolderRecord(name: string, dates: ExpenseFolderDates = {}, now = new Date()) {
  const trimmedName = name.trim();
  if (!trimmedName) return undefined;
  const startDate = dates.startDate || undefined;
  const endDate = dates.endDate || startDate;

  return {
    id: `report-${safeId(trimmedName)}-${now.getTime()}`,
    name: trimmedName,
    startDate,
    endDate,
    dateRangeLabel: buildExpenseFolderDateRangeLabel(startDate, endDate),
    expenseIds: [],
    status: "Draft" as const,
    createdAt: now.toISOString()
  };
}
