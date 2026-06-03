import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyCloudSnapshot, useExpenseMeCloudState } from "../../src/app/useExpenseMeCloudState";
import type { CloudRepository } from "../../src/client/cloudRepository";
import { v15MigrationMarkerKey, v1LocalStorageKey } from "../../src/client/localSnapshot";
import { normalizeCloudSnapshot } from "../../src/cloudflare/appSnapshot";
import type { CloudSnapshot } from "../../src/cloudflare/types";
import { seedArtifacts, seedExpenses, seedReports, seedStatementCharges } from "../fixtures";

function snapshot(overrides: Partial<CloudSnapshot> = {}) {
  return normalizeCloudSnapshot({
    workspaceId: "workspace-personal",
    userEmail: "thiago@example.com",
    expenses: [seedExpenses[0]],
    receiptArtifacts: [seedArtifacts[0]],
    reports: [seedReports[0]],
    statementCharges: [seedStatementCharges[0]],
    exportPackages: [],
    recordVersions: {
      expenses: { [seedExpenses[0].id]: 4 },
      reports: { [seedReports[0].id]: 2 },
      receiptArtifacts: { [seedArtifacts[0].id]: 3 },
      statementCharges: { [seedStatementCharges[0].id]: 1 },
      exportPackages: {}
    },
    ...overrides
  });
}

function repositoryStub(methods: Partial<CloudRepository>) {
  return methods as CloudRepository;
}

describe("useExpenseMeCloudState", () => {
  it("bootstraps the cloud snapshot", async () => {
    const cloudSnapshot = snapshot();
    const repository = repositoryStub({
      bootstrap: vi.fn().mockResolvedValue(cloudSnapshot)
    });

    const { result } = renderHook(() => useExpenseMeCloudState(repository));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.snapshot).toEqual(cloudSnapshot);
  });

  it("surfaces bootstrap failures", async () => {
    const repository = repositoryStub({
      bootstrap: vi.fn().mockRejectedValue(new Error("Bootstrap failed"))
    });

    const { result } = renderHook(() => useExpenseMeCloudState(repository));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Bootstrap failed");
    expect(result.current.snapshot).toMatchObject({
      workspaceId: "",
      userEmail: "",
      expenses: [],
      receiptArtifacts: [],
      statementCharges: [],
      reports: [expect.objectContaining({ id: "report-current", name: "Current Expense Folder" })]
    });
  });

  it("exposes a one-time V1 migration action when cloud data is empty", async () => {
    const localSnapshot = {
      expenses: [seedExpenses[0]],
      receiptArtifacts: [seedArtifacts[0]],
      reports: [seedReports[0]],
      statementCharges: [seedStatementCharges[0]]
    };
    const migratedSnapshot = snapshot();
    const repository = repositoryStub({
      bootstrap: vi.fn().mockResolvedValue(emptyCloudSnapshot()),
      migrateLocalSnapshot: vi.fn().mockResolvedValue(migratedSnapshot)
    });
    window.localStorage.setItem(v1LocalStorageKey, JSON.stringify(localSnapshot));

    const { result } = renderHook(() => useExpenseMeCloudState(repository));

    await waitFor(() => expect(result.current.localSnapshotForMigration).toEqual(localSnapshot));

    await act(async () => {
      await result.current.migrateLocalSnapshot();
    });

    expect(repository.migrateLocalSnapshot).toHaveBeenCalledWith(localSnapshot);
    expect(result.current.snapshot).toEqual(migratedSnapshot);
    expect(result.current.localSnapshotForMigration).toBeUndefined();
    expect(window.localStorage.getItem(v15MigrationMarkerKey)).toBe("complete");
  });

  it("saves Expenses with the last seen cloud version", async () => {
    const initialSnapshot = snapshot();
    const savedSnapshot = snapshot({ expenses: [{ ...seedExpenses[0], city: "Naperville" }] });
    const repository = repositoryStub({
      bootstrap: vi.fn().mockResolvedValue(initialSnapshot),
      saveExpense: vi.fn().mockResolvedValue(savedSnapshot)
    });

    const { result } = renderHook(() => useExpenseMeCloudState(repository));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveExpense({ ...seedExpenses[0], city: "Naperville" });
    });

    expect(repository.saveExpense).toHaveBeenCalledWith(
      { ...seedExpenses[0], city: "Naperville" },
      [],
      4
    );
    expect(result.current.snapshot.expenses[0].city).toBe("Naperville");
  });
});
