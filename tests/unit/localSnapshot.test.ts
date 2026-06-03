import { afterEach, describe, expect, it } from "vitest";
import type { AppSnapshot } from "../../src/domain/types";
import { seedArtifacts, seedExpenses, seedReports, seedStatementCharges } from "../fixtures";
import {
  hasMigrationMarker,
  markMigrationComplete,
  readV1LocalSnapshot,
  v15MigrationMarkerKey,
  v1LocalStorageKey
} from "../../src/client/localSnapshot";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const snapshot: AppSnapshot = {
  expenses: [seedExpenses[0]],
  receiptArtifacts: [seedArtifacts[0]],
  reports: [seedReports[0]],
  statementCharges: [seedStatementCharges[0]]
};

describe("local V1 snapshot migration helpers", () => {
  const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

  afterEach(() => {
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
    }
  });

  it("reads a valid V1 localStorage snapshot and returns only AppSnapshot fields", () => {
    const storage = new MemoryStorage();
    storage.setItem(v1LocalStorageKey, JSON.stringify({ ...snapshot, exportPackages: [{ id: "export-1" }] }));

    const result = readV1LocalSnapshot(storage);

    expect(result).toEqual(snapshot);
    expect(result).not.toHaveProperty("exportPackages");
  });

  it("returns undefined for invalid JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem(v1LocalStorageKey, "{not json");

    expect(readV1LocalSnapshot(storage)).toBeUndefined();
  });

  it("returns undefined when required arrays are missing", () => {
    const storage = new MemoryStorage();
    storage.setItem(v1LocalStorageKey, JSON.stringify({ ...snapshot, statementCharges: undefined }));

    expect(readV1LocalSnapshot(storage)).toBeUndefined();
  });

  it("returns undefined when storage reads throw", () => {
    const storage = {
      getItem() {
        throw new Error("storage blocked");
      }
    } as unknown as Storage;

    expect(readV1LocalSnapshot(storage)).toBeUndefined();
  });

  it("returns undefined when the default localStorage getter throws", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage blocked");
      }
    });

    expect(readV1LocalSnapshot()).toBeUndefined();
  });

  it("tracks migration marker state", () => {
    const storage = new MemoryStorage();

    expect(hasMigrationMarker(storage)).toBe(false);
    markMigrationComplete(storage);

    expect(storage.getItem(v15MigrationMarkerKey)).toBe("complete");
    expect(hasMigrationMarker(storage)).toBe(true);
  });

  it("treats marker read failures as no marker", () => {
    const storage = {
      getItem() {
        throw new Error("storage blocked");
      }
    } as unknown as Storage;

    expect(hasMigrationMarker(storage)).toBe(false);
  });

  it("treats default marker storage failures as no marker and no-op write", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage blocked");
      }
    });

    expect(hasMigrationMarker()).toBe(false);
    expect(() => markMigrationComplete()).not.toThrow();
  });
});
