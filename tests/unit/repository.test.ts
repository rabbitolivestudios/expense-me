import { beforeEach, describe, expect, it } from "vitest";
import { seedArtifacts, seedExpenses, seedReports, seedStatementCharges } from "../fixtures";
import {
  clearExpenseMeDb,
  listReports,
  listUnmatchedCharges,
  saveArtifact,
  saveExpense,
  saveReport,
  saveStatementCharge,
  listExpenses
} from "../../src/storage/repository";
import { db } from "../../src/storage/db";

describe("Expense repository", () => {
  beforeEach(async () => {
    await clearExpenseMeDb();
  });

  it("persists and lists expenses newest first", async () => {
    await saveExpense(seedExpenses[0]);
    await saveExpense(seedExpenses[1]);

    const expenses = await listExpenses();

    expect(expenses).toHaveLength(2);
    expect(expenses.map((expense) => expense.id)).toEqual(["exp-taxi-paris", "exp-meal-client-dinner"]);
    expect(expenses[1].description).toBe("Dinner with client");
  });

  it("replaces an existing expense by id", async () => {
    await saveExpense(seedExpenses[0]);
    await saveExpense({ ...seedExpenses[0], description: "Updated client dinner" });

    const expenses = await listExpenses();

    expect(expenses).toHaveLength(1);
    expect(expenses[0].description).toBe("Updated client dinner");
  });

  it("persists artifacts for later receipt lookup", async () => {
    await saveArtifact(seedArtifacts[0]);

    await expect(db.artifacts.get(seedArtifacts[0].id)).resolves.toMatchObject({
      id: "art-restaurant-receipt",
      storageKey: "seed/avec-dinner.pdf"
    });
  });

  it("lists only unmatched statement charges", async () => {
    await saveStatementCharge(seedStatementCharges[0]);
    await saveStatementCharge(seedStatementCharges[1]);

    const charges = await listUnmatchedCharges();

    expect(charges).toHaveLength(1);
    expect(charges[0].id).toBe("charge-hotel-chicago");
  });

  it("persists and lists reports newest first", async () => {
    await saveReport(seedReports[0]);
    await saveReport({
      ...seedReports[0],
      id: "report-newer",
      createdAt: "2026-06-03T12:00:00.000Z"
    });

    const reports = await listReports();

    expect(reports.map((report) => report.id)).toEqual(["report-newer", "report-may-chicago"]);
  });

  it("clears all local-first stores", async () => {
    await saveExpense(seedExpenses[0]);
    await saveArtifact(seedArtifacts[0]);
    await saveStatementCharge(seedStatementCharges[0]);
    await saveReport(seedReports[0]);

    await clearExpenseMeDb();

    await expect(db.expenses.count()).resolves.toBe(0);
    await expect(db.artifacts.count()).resolves.toBe(0);
    await expect(db.statementCharges.count()).resolves.toBe(0);
    await expect(db.reports.count()).resolves.toBe(0);
    await expect(db.exportPackages.count()).resolves.toBe(0);
  });
});
