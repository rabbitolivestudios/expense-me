import type { Expense, ReceiptArtifact, Report, StatementCharge } from "../domain/types";
import { db } from "./db";

export async function clearExpenseMeDb() {
  await db.transaction("rw", [db.expenses, db.artifacts, db.statementCharges, db.reports, db.exportPackages], async () => {
    await Promise.all([
      db.expenses.clear(),
      db.artifacts.clear(),
      db.statementCharges.clear(),
      db.reports.clear(),
      db.exportPackages.clear()
    ]);
  });
}

export async function saveExpense(expense: Expense) {
  await db.expenses.put(expense);
}

export async function listExpenses() {
  return db.expenses.orderBy("expenseDate").reverse().toArray();
}

export async function saveArtifact(artifact: ReceiptArtifact) {
  await db.artifacts.put(artifact);
}

export async function saveStatementCharge(charge: StatementCharge) {
  await db.statementCharges.put(charge);
}

export async function listUnmatchedCharges() {
  return db.statementCharges.where("matchStatus").equals("Unmatched").toArray();
}

export async function saveReport(report: Report) {
  await db.reports.put(report);
}

export async function listReports() {
  return db.reports.orderBy("createdAt").reverse().toArray();
}
