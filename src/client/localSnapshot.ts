import type { AppSnapshot } from "../domain/types";

export const v1LocalStorageKey = "expense-me-v1-live-state";
export const v15MigrationMarkerKey = "expense-me-v15-cloud-migration";

export function readV1LocalSnapshot(storage: Storage = window.localStorage): AppSnapshot | undefined {
  try {
    const raw = storage.getItem(v1LocalStorageKey);
    if (!raw) return undefined;

    const parsed = JSON.parse(raw) as Partial<AppSnapshot>;
    if (
      !Array.isArray(parsed.expenses) ||
      !Array.isArray(parsed.receiptArtifacts) ||
      !Array.isArray(parsed.reports) ||
      !Array.isArray(parsed.statementCharges)
    ) {
      return undefined;
    }

    return {
      expenses: parsed.expenses,
      receiptArtifacts: parsed.receiptArtifacts,
      reports: parsed.reports,
      statementCharges: parsed.statementCharges
    };
  } catch {
    return undefined;
  }
}

export function hasMigrationMarker(storage: Storage = window.localStorage) {
  try {
    return storage.getItem(v15MigrationMarkerKey) === "complete";
  } catch {
    return false;
  }
}

export function markMigrationComplete(storage: Storage = window.localStorage) {
  try {
    storage.setItem(v15MigrationMarkerKey, "complete");
  } catch {
    // Local marker persistence is best-effort for restricted storage modes.
  }
}
