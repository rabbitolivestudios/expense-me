import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

function createMemoryStorage(): Storage {
  let data = new Map<string, string>();

  return {
    get length() {
      return data.size;
    },
    clear() {
      data = new Map();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    }
  };
}

function shouldInstallMemoryStorage() {
  try {
    return (
      typeof window.localStorage.clear !== "function" ||
      typeof window.localStorage.getItem !== "function" ||
      typeof window.localStorage.setItem !== "function"
    );
  } catch {
    return true;
  }
}

if (shouldInstallMemoryStorage()) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage()
  });
}

afterEach(() => {
  window.localStorage.clear();
});
