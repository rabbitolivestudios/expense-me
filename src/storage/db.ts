import Dexie, { type EntityTable } from "dexie";
import type { Expense, ExportPackage, ReceiptArtifact, Report, StatementCharge } from "../domain/types";

export class ExpenseMeDb extends Dexie {
  expenses!: EntityTable<Expense, "id">;
  artifacts!: EntityTable<ReceiptArtifact, "id">;
  statementCharges!: EntityTable<StatementCharge, "id">;
  reports!: EntityTable<Report, "id">;
  exportPackages!: EntityTable<ExportPackage, "id">;

  constructor() {
    super("expense-me");
    this.version(1).stores({
      expenses: "id, status, expenseType, reportId, expenseDate, statementChargeMatchId",
      artifacts: "id, artifactType, sourceMessageId, fingerprint",
      statementCharges: "id, statementImportId, matchStatus, matchedExpenseId, transactionDate",
      reports: "id, status, createdAt",
      exportPackages: "id, reportId, generatedAt"
    });
  }
}

export const db = new ExpenseMeDb();
