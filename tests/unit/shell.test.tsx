import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { normalizeCloudSnapshot } from "../../src/cloudflare/appSnapshot";
import type { CloudSnapshot } from "../../src/cloudflare/types";
import { reconcileStatementCharges } from "../../src/features/statements/reconciliation";
import { seedArtifacts, seedExpenses, seedReports, seedStatementCharges } from "../fixtures";

const appStorageKey = "expense-me-v1-live-state";
const activeReportPreferenceKey = "expense-me-v15-active-report";

function firePointer(element: Element, type: string, clientX: number) {
  fireEvent(element, new MouseEvent(type, { bubbles: true, cancelable: true, clientX }));
}

function seedAppState() {
  window.localStorage.setItem(
    appStorageKey,
    JSON.stringify({
      expenses: seedExpenses,
      receiptArtifacts: seedArtifacts,
      reports: seedReports,
      statementCharges: seedStatementCharges
    })
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function storedAppState() {
  return JSON.parse(window.localStorage.getItem(appStorageKey) ?? "{}") as {
    activeReportId?: string;
    expenses?: typeof seedExpenses;
    receiptArtifacts?: typeof seedArtifacts;
    reports?: typeof seedReports;
    statementCharges?: typeof seedStatementCharges;
  };
}

function stateFromStorage() {
  const parsed = storedAppState();
  const snapshot = normalizeCloudSnapshot({
    workspaceId: "workspace-personal",
    userEmail: "thiago@example.com",
    expenses: parsed.expenses ?? [],
    receiptArtifacts: parsed.receiptArtifacts ?? [],
    reports: parsed.reports,
    statementCharges: parsed.statementCharges ?? [],
    exportPackages: [],
    recordVersions: {}
  });

  return {
    expenses: snapshot.expenses,
    receiptArtifacts: snapshot.receiptArtifacts,
    reports: snapshot.reports,
    statementCharges: snapshot.statementCharges
  };
}

function writeAppState(state: ReturnType<typeof stateFromStorage>) {
  window.localStorage.setItem(appStorageKey, JSON.stringify(state));
}

function cloudSnapshotFromStorage(): CloudSnapshot {
  const state = stateFromStorage();
  const versionMap = (items: Array<{ id: string }>) => Object.fromEntries(items.map((item) => [item.id, 1]));

  return normalizeCloudSnapshot({
    workspaceId: "workspace-personal",
    userEmail: "thiago@example.com",
    expenses: state.expenses,
    receiptArtifacts: state.receiptArtifacts,
    reports: state.reports,
    statementCharges: state.statementCharges,
    exportPackages: [],
    recordVersions: {
      expenses: versionMap(state.expenses),
      reports: versionMap(state.reports),
      receiptArtifacts: versionMap(state.receiptArtifacts),
      statementCharges: versionMap(state.statementCharges),
      exportPackages: {}
    }
  });
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  }));
}

function reportsWithExpenseMembership<T extends { id: string; expenseIds: string[] }>(reports: T[], expense: { id: string; reportId?: string }) {
  return reports.map((report) => ({
    ...report,
    expenseIds:
      report.id === expense.reportId
        ? [expense.id, ...report.expenseIds.filter((id) => id !== expense.id)]
        : report.expenseIds.filter((id) => id !== expense.id)
  }));
}

function upsertStoredExpense(expense: (typeof seedExpenses)[number]) {
  const state = stateFromStorage();
  writeAppState({
    ...state,
    expenses: [expense, ...state.expenses.filter((item) => item.id !== expense.id)],
    reports: reportsWithExpenseMembership(state.reports, expense)
  });
}

function installCloudApiMock(options: { syncEmail?: (reportId?: string) => CloudSnapshot | Promise<CloudSnapshot> } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/bootstrap") {
      return jsonResponse({ snapshot: cloudSnapshotFromStorage() });
    }

    if (url === "/api/expenses" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const state = stateFromStorage();
      const expense = body.expense;
      const artifacts = body.artifacts ?? [];
      writeAppState({
        ...state,
        expenses: [expense, ...state.expenses.filter((item) => item.id !== expense.id)],
        reports: reportsWithExpenseMembership(state.reports, expense),
        receiptArtifacts: [
          ...artifacts,
          ...state.receiptArtifacts.filter((item: { id: string }) => !artifacts.some((artifact: { id: string }) => artifact.id === item.id))
        ]
      });
      return jsonResponse({ snapshot: cloudSnapshotFromStorage() });
    }

    if (url.startsWith("/api/expenses/") && method === "DELETE") {
      const expenseId = decodeURIComponent(url.replace("/api/expenses/", "").split("?")[0]);
      const state = stateFromStorage();
      const expenses = state.expenses.filter((expense) => expense.id !== expenseId);
      const usedArtifactIds = new Set(expenses.flatMap((expense) => expense.receiptArtifactIds));
      writeAppState({
        ...state,
        expenses,
        receiptArtifacts: state.receiptArtifacts.filter((artifact: { id: string }) => usedArtifactIds.has(artifact.id)),
        statementCharges: state.statementCharges.map((charge) =>
          charge.matchedExpenseId === expenseId ? { ...charge, matchStatus: "Unmatched", matchedExpenseId: undefined } : charge
        )
      });
      return jsonResponse({ snapshot: cloudSnapshotFromStorage() });
    }

    if (url === "/api/expense-folders" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const state = stateFromStorage();
      const report = body.report;
      writeAppState({
        ...state,
        reports: [report, ...state.reports.filter((item) => item.id !== report.id)]
      });
      return jsonResponse({ snapshot: cloudSnapshotFromStorage() });
    }

    if (url.startsWith("/api/expense-folders/") && method === "DELETE") {
      const reportId = decodeURIComponent(url.replace("/api/expense-folders/", "").split("?")[0]);
      const state = stateFromStorage();
      const report = state.reports.find((item) => item.id === reportId);
      if (report?.expenseIds.length) return jsonResponse({ error: "Expense Folder has expenses and cannot be deleted." }, 409);
      writeAppState({ ...state, reports: state.reports.filter((item) => item.id !== reportId) });
      return jsonResponse({ snapshot: cloudSnapshotFromStorage() });
    }

    if (url === "/api/statements/import" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const state = stateFromStorage();
      const reconciled = reconcileStatementCharges(state.expenses, body.charges ?? []);
      writeAppState({ ...state, expenses: reconciled.expenses, statementCharges: reconciled.charges });
      return jsonResponse({ snapshot: cloudSnapshotFromStorage() });
    }

    if (url === "/api/email/sync" && method === "POST") {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const snapshot = await options.syncEmail?.(body.reportId);
      return jsonResponse({ snapshot: snapshot ?? cloudSnapshotFromStorage() });
    }

    if (url === "/api/export-packages" && method === "POST") {
      return jsonResponse({
        exportPackage: {
          id: "export-package-test",
          reportId: JSON.parse(String(init?.body ?? "{}")).reportId,
          generatedAt: "2026-06-03T18:00:00.000Z",
          reviewPdfName: "review.txt",
          spreadsheetName: "entry.csv",
          receiptsZipName: "receipts.zip",
          declarationPdfNames: [],
          reconciliationNotesName: "reconciliation.txt"
        },
        downloadUrl: "/api/export-packages/export-package-test/download"
      });
    }

    if (url === "/api/export-packages/export-package-test/download" && method === "GET") {
      return Promise.resolve(new Response(new Uint8Array([80, 75, 3, 4]), {
        headers: { "Content-Type": "application/zip" }
      }));
    }

    return jsonResponse({ error: `Unhandled test route ${method} ${url}` }, 404);
  }));
}

async function renderLoadedApp(ui = <App />) {
  const result = render(ui);
  await waitFor(() => expect(screen.queryByText("Loading cloud data...")).not.toBeInTheDocument());
  return result;
}

function seedFolderOnlyState() {
  window.localStorage.setItem(
    appStorageKey,
    JSON.stringify({
      expenses: [],
      receiptArtifacts: [],
      reports: [seedReports[0]],
      statementCharges: []
    })
  );
}

function seedReadyExportState() {
  window.localStorage.setItem(
    appStorageKey,
    JSON.stringify({
      expenses: [
        {
          ...seedExpenses[0],
          status: "Ready",
          reportId: "report-export-ready"
        }
      ],
      receiptArtifacts: [seedArtifacts[0]],
      reports: [
        {
          ...seedReports[0],
          id: "report-export-ready",
          name: "June Customer Visit",
          expenseIds: [seedExpenses[0].id]
        }
      ],
      statementCharges: []
    })
  );
}

describe("mobile app shell", () => {
  beforeEach(() => {
    installCloudApiMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders five bottom navigation actions with Capture centered", async () => {
    await renderLoadedApp();

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toHaveTextContent("Inbox");
    expect(nav).toHaveTextContent("Reports");
    expect(nav).toHaveTextContent("Capture");
    expect(nav).toHaveTextContent("Cards");
    expect(nav).toHaveTextContent("Export");
    expect(screen.getByRole("button", { name: "Capture receipt" })).toBeInTheDocument();
  });

  it("returns to Inbox from a secondary section with the back icon", async () => {
    const user = userEvent.setup();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: "Reports" }));
    expect(screen.getByRole("heading", { name: "Expense Folders" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to Inbox" }));
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
  });

  it("creates a new Expense Folder from the folders screen", async () => {
    const user = userEvent.setup();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: "Reports" }));
    await user.type(screen.getByLabelText("New Expense Folder"), "June customer visits");
    await user.type(screen.getByLabelText("New Expense Folder start date"), "2026-06-10");
    await user.type(screen.getByLabelText("New Expense Folder end date"), "2026-06-12");
    await user.click(screen.getByRole("button", { name: "Create Expense Folder" }));

    expect(screen.getByText("June customer visits")).toBeInTheDocument();
    expect(screen.getByText("June 10, 2026 to June 12, 2026")).toBeInTheDocument();
  });

  it("creates distinct ids for same-name Expense Folders created in one millisecond", async () => {
    const user = userEvent.setup();
    vi.spyOn(Date, "now").mockReturnValue(1770000000000);
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: "Reports" }));
    await user.type(screen.getByLabelText("New Expense Folder"), "Duplicate folder");
    await user.click(screen.getByRole("button", { name: "Create Expense Folder" }));
    await user.type(screen.getByLabelText("New Expense Folder"), "Duplicate folder");
    await user.click(screen.getByRole("button", { name: "Create Expense Folder" }));

    await waitFor(() => {
      const duplicateReports = (storedAppState().reports ?? []).filter((report) => report.name === "Duplicate folder");
      expect(duplicateReports).toHaveLength(2);
      expect(new Set(duplicateReports.map((report) => report.id))).toHaveProperty("size", 2);
    });
  });

  it("renames and deletes an empty Expense Folder", async () => {
    const user = userEvent.setup();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: "Reports" }));
    await user.type(screen.getByLabelText("New Expense Folder"), "June customer visits");
    await user.click(screen.getByRole("button", { name: "Create Expense Folder" }));
    await user.click(screen.getByRole("button", { name: "Rename Expense Folder June customer visits" }));

    const renameInput = screen.getByLabelText("Expense Folder name");
    await user.clear(renameInput);
    await user.type(renameInput, "June customer visits updated");
    await user.type(screen.getByLabelText("Expense Folder start date"), "2026-06-14");
    await user.type(screen.getByLabelText("Expense Folder end date"), "2026-06-14");
    await user.click(screen.getByRole("button", { name: "Save Expense Folder name" }));

    expect(screen.getByText("June customer visits updated")).toBeInTheDocument();
    expect(screen.getByText("June 14, 2026")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Expense Folder June customer visits updated" }));
    await waitFor(() => expect(screen.queryByText("June customer visits updated")).not.toBeInTheDocument());
  });

  it("keeps Expense Folders with expenses from being deleted", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: "Reports" }));

    expect(screen.getByRole("button", { name: "Delete Expense Folder Chicago Training - May 2026" })).toBeDisabled();
  });

  it("opens card statement import from the Inbox quick action", async () => {
    const user = userEvent.setup();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: "Upload statement" }));

    expect(screen.getByRole("heading", { name: "Cards" })).toBeInTheDocument();
    expect(screen.getByText("Unmatched Charges")).toBeInTheDocument();
  });

  it("saves edited expense details back to the inbox", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: /Avec River North/i }));
    const city = screen.getByLabelText("City");
    await user.clear(city);
    await user.type(city, "Detroit");
    await user.click(screen.getByRole("button", { name: "Save Expense" }));

    expect(screen.getByText("Detroit · Dinner")).toBeInTheDocument();
  });

  it("shows and saves the required Expense Folder in expense details", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: /Avec River North/i }));
    const folderSelect = screen.getByLabelText("Expense Folder");
    expect(folderSelect).toHaveValue("report-may-chicago");

    await user.selectOptions(folderSelect, "report-customer-visit");
    await user.click(screen.getByRole("button", { name: "Save Expense" }));
    await user.click(screen.getByRole("button", { name: /Avec River North/i }));

    expect(screen.getByLabelText("Expense Folder")).toHaveValue("report-customer-visit");
  });

  it("auto-assigns a manually created expense when one Expense Folder exists", async () => {
    const user = userEvent.setup();
    seedFolderOnlyState();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: "Capture receipt" }));
    await user.click(screen.getByRole("button", { name: "Manual Expense" }));

    expect(screen.getByRole("heading", { name: "Expense Detail" })).toBeInTheDocument();
    expect(screen.getByLabelText("Expense Folder")).toHaveValue("report-may-chicago");
  });

  it("uses the active Expense Folder for newly captured expenses", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    await user.selectOptions(screen.getByLabelText("Active Expense Folder"), "report-customer-visit");
    await user.click(screen.getByRole("button", { name: "Capture receipt" }));
    await user.click(screen.getByRole("button", { name: "Manual Expense" }));

    expect(screen.getByRole("heading", { name: "Expense Detail" })).toBeInTheDocument();
    expect(screen.getByLabelText("Expense Folder")).toHaveValue("report-customer-visit");
  });

  it("persists the active Expense Folder choice across reloads", async () => {
    const user = userEvent.setup();
    seedAppState();
    const { unmount } = await renderLoadedApp();

    await user.selectOptions(screen.getByLabelText("Active Expense Folder"), "report-customer-visit");
    expect(window.localStorage.getItem(activeReportPreferenceKey)).toBe("report-customer-visit");

    unmount();
    await renderLoadedApp();

    expect(screen.getByLabelText("Active Expense Folder")).toHaveValue("report-customer-visit");
  });

  it("syncs new email expenses into the active Expense Folder", async () => {
    const user = userEvent.setup();
    seedAppState();
    installCloudApiMock({
      syncEmail: (reportId) => {
        upsertStoredExpense({
          ...seedExpenses[0],
          id: "exp-email-active-sync-1",
          sourceType: "Email",
          merchant: "Uber",
          description: "Uber trip",
          originalAmount: 10,
          finalUsdAmount: 10,
          receiptArtifactIds: [],
          reportId,
          confidence: 0.9
        });
        return cloudSnapshotFromStorage();
      }
    });

    await renderLoadedApp();

    await user.selectOptions(screen.getByLabelText("Active Expense Folder"), "report-customer-visit");
    await user.click(screen.getByRole("button", { name: /Sync expense-me@agentmail.to inbox/i }));

    expect(await screen.findByText("Email synced. 1 receipt updated.")).toBeInTheDocument();
    await waitFor(() => {
      const emailExpense = storedAppState().expenses?.find((expense) => expense.id === "exp-email-active-sync-1");
      expect(emailExpense?.reportId).toBe("report-customer-visit");
    });
  });

  it("keeps edits made to an email expense while sync is pending", async () => {
    const user = userEvent.setup();
    const emailExpense = {
      ...seedExpenses[0],
      id: "exp-email-stale-sync-1",
      sourceType: "Email" as const,
      merchant: "FW: [Business] Your Thursday evening trip with Uber",
      description: "FW: [Business] Your Thursday evening trip with Uber <thiago@example.com>",
      originalAmount: 0.01,
      finalUsdAmount: 0.01,
      receiptArtifactIds: ["art-email-stale-sync-1"],
      reportId: "report-may-chicago",
      confidence: 0.45
    };
    const reports = seedReports.map((report) =>
      report.id === "report-may-chicago"
        ? { ...report, expenseIds: [emailExpense.id, ...report.expenseIds] }
        : report
    );
    const syncResponse = createDeferred<void>();

    window.localStorage.setItem(
      appStorageKey,
      JSON.stringify({
        expenses: [emailExpense, ...seedExpenses],
        receiptArtifacts: seedArtifacts,
        reports,
        statementCharges: seedStatementCharges
      })
    );
    installCloudApiMock({
      syncEmail: async () => {
        await syncResponse.promise;
        const currentExpense = stateFromStorage().expenses.find((expense) => expense.id === emailExpense.id) ?? emailExpense;
        upsertStoredExpense({
          ...currentExpense,
          merchant: "Uber",
          originalAmount: 16.8,
          finalUsdAmount: 16.8
        });
        return cloudSnapshotFromStorage();
      }
    });

    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: /Sync expense-me@agentmail.to inbox/i }));

    await user.click(screen.getByRole("button", { name: /Thursday evening trip with Uber/i }));
    await user.selectOptions(screen.getByLabelText("Expense Folder"), "report-customer-visit");
    await user.click(screen.getByRole("button", { name: "Save Expense" }));

    await act(async () => {
      syncResponse.resolve(undefined);
      await syncResponse.promise;
    });

    await waitFor(() => {
      const stored = storedAppState();
      const repairedExpense = stored.expenses?.find((expense) => expense.id === emailExpense.id);
      expect(repairedExpense?.merchant).toBe("Uber");
      expect(repairedExpense?.originalAmount).toBe(16.8);
      expect(repairedExpense?.reportId).toBe("report-customer-visit");
      expect(stored.reports?.find((report) => report.id === "report-customer-visit")?.expenseIds).toContain(emailExpense.id);
    });
  });

  it("assigns repaired legacy email expenses that have no Expense Folder", async () => {
    const user = userEvent.setup();
    const emailExpense = {
      ...seedExpenses[0],
      id: "exp-email-repair-unassigned-1",
      sourceType: "Email" as const,
      merchant: "FW: [Business] Your Friday morning trip with Uber",
      description: "FW: [Business] Your Friday morning trip with Uber <thiago@example.com>",
      originalAmount: 0.01,
      finalUsdAmount: 0.01,
      receiptArtifactIds: ["art-email-repair-unassigned-1"],
      reportId: undefined,
      confidence: 0.45
    };

    window.localStorage.setItem(
      appStorageKey,
      JSON.stringify({
        expenses: [emailExpense, ...seedExpenses],
        receiptArtifacts: seedArtifacts,
        reports: seedReports,
        statementCharges: seedStatementCharges
      })
    );
    installCloudApiMock({
      syncEmail: (reportId) => {
        upsertStoredExpense({
          ...emailExpense,
          merchant: "Uber",
          originalAmount: 21.1,
          finalUsdAmount: 21.1,
          reportId
        });
        return cloudSnapshotFromStorage();
      }
    });

    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: /Sync expense-me@agentmail.to inbox/i }));

    await waitFor(() => {
      const stored = storedAppState();
      const repairedExpense = stored.expenses?.find((expense) => expense.id === emailExpense.id);
      expect(repairedExpense?.merchant).toBe("Uber");
      expect(repairedExpense?.reportId).toBe("report-may-chicago");
      expect(stored.reports?.find((report) => report.id === "report-may-chicago")?.expenseIds).toContain(emailExpense.id);
    });
  });

  it("syncs new email expenses into an existing folder if the active folder is deleted while sync is pending", async () => {
    const user = userEvent.setup();
    const emptyReport = {
      ...seedReports[0],
      id: "report-empty-active",
      name: "Empty Active Folder",
      startDate: undefined,
      endDate: undefined,
      dateRangeLabel: "Add expenses to this folder",
      expenseIds: []
    };
    const syncResponse = createDeferred<void>();

    window.localStorage.setItem(
      appStorageKey,
      JSON.stringify({
        expenses: seedExpenses,
        receiptArtifacts: seedArtifacts,
        reports: [emptyReport, ...seedReports],
        activeReportId: emptyReport.id,
        statementCharges: seedStatementCharges
      })
    );
    window.localStorage.setItem(activeReportPreferenceKey, emptyReport.id);
    installCloudApiMock({
      syncEmail: async (reportId) => {
        await syncResponse.promise;
        const state = stateFromStorage();
        const targetReportId = state.reports.some((report) => report.id === reportId) ? reportId : state.reports[0]?.id;
        upsertStoredExpense({
          ...seedExpenses[0],
          id: "exp-email-deleted-folder-sync-1",
          sourceType: "Email",
          merchant: "Uber",
          description: "Uber trip",
          originalAmount: 10,
          finalUsdAmount: 10,
          receiptArtifactIds: [],
          reportId: targetReportId,
          confidence: 0.9
        });
        return cloudSnapshotFromStorage();
      }
    });

    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: /Sync expense-me@agentmail.to inbox/i }));
    await user.click(screen.getByRole("button", { name: "Reports" }));
    await user.click(screen.getByRole("button", { name: "Delete Expense Folder Empty Active Folder" }));
    await waitFor(() => expect(storedAppState().reports?.some((report) => report.id === emptyReport.id)).toBe(false));

    await act(async () => {
      syncResponse.resolve(undefined);
      await syncResponse.promise;
    });

    await waitFor(() => {
      const stored = storedAppState();
      const syncedExpense = stored.expenses?.find((expense) => expense.id === "exp-email-deleted-folder-sync-1");
      expect(syncedExpense?.reportId).toBe("report-may-chicago");
      expect(stored.reports?.some((report) => report.id === emptyReport.id)).toBe(false);
      expect(stored.reports?.find((report) => report.id === "report-may-chicago")?.expenseIds).toContain(syncedExpense?.id);
    });
  });

  it("keeps email sync assigned to the folder active when sync started", async () => {
    const user = userEvent.setup();
    seedAppState();
    const syncResponse = createDeferred<void>();
    installCloudApiMock({
      syncEmail: async (reportId) => {
        await syncResponse.promise;
        upsertStoredExpense({
          ...seedExpenses[0],
          id: "exp-email-active-at-start-1",
          sourceType: "Email",
          merchant: "Uber",
          description: "Uber trip",
          originalAmount: 10,
          finalUsdAmount: 10,
          receiptArtifactIds: [],
          reportId,
          confidence: 0.9
        });
        return cloudSnapshotFromStorage();
      }
    });

    await renderLoadedApp();

    expect(screen.getByLabelText("Active Expense Folder")).toHaveValue("report-may-chicago");
    await user.click(screen.getByRole("button", { name: /Sync expense-me@agentmail.to inbox/i }));
    await user.selectOptions(screen.getByLabelText("Active Expense Folder"), "report-customer-visit");

    await act(async () => {
      syncResponse.resolve(undefined);
      await syncResponse.promise;
    });

    await waitFor(() => {
      const syncedExpense = storedAppState().expenses?.find((expense) => expense.id === "exp-email-active-at-start-1");
      expect(syncedExpense?.reportId).toBe("report-may-chicago");
    });
  });

  it("reveals an Expense Folder assignment action with swipe right", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });

    firePointer(expenseCard, "pointerdown", 120);
    firePointer(expenseCard, "pointermove", 240);
    firePointer(expenseCard, "pointerup", 240);

    const assignAction = screen.getByRole("button", { name: "Assign Expense Folder for Avec River North" });
    expect(assignAction).toBeEnabled();

    await user.click(assignAction);
    const dialog = screen.getByRole("dialog", { name: "Assign Expense Folder" });
    await user.selectOptions(within(dialog).getByLabelText("Expense Folder"), "report-customer-visit");
    await user.click(within(dialog).getByRole("button", { name: "Assign Folder" }));

    await user.click(screen.getByRole("button", { name: /Avec River North/i }));
    expect(screen.getByLabelText("Expense Folder")).toHaveValue("report-customer-visit");
  });

  it("creates and selects a new Expense Folder from inbox assignment", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });

    firePointer(expenseCard, "pointerdown", 120);
    firePointer(expenseCard, "pointermove", 240);
    firePointer(expenseCard, "pointerup", 240);

    await user.click(screen.getByRole("button", { name: "Assign Expense Folder for Avec River North" }));
    const dialog = screen.getByRole("dialog", { name: "Assign Expense Folder" });
    await user.type(within(dialog).getByLabelText("New Expense Folder"), "June customer dinner");
    await user.click(within(dialog).getByRole("button", { name: "Create and Select Expense Folder" }));
    await user.click(within(dialog).getByRole("button", { name: "Assign Folder" }));

    await user.click(screen.getByRole("button", { name: /Avec River North/i }));
    expect(screen.getByLabelText("Expense Folder")).toHaveDisplayValue("June customer dinner");
  });

  it("creates and selects a new Expense Folder from expense details", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: /Avec River North/i }));
    await user.type(screen.getByLabelText("New Expense Folder"), "Conference follow-up");
    await user.click(screen.getByRole("button", { name: "Create and Select Expense Folder" }));

    await waitFor(() => expect(screen.getByLabelText("Expense Folder")).toHaveDisplayValue("Conference follow-up"));

    await user.click(screen.getByRole("button", { name: "Save Expense" }));
    await user.click(screen.getByRole("button", { name: /Avec River North/i }));

    expect(screen.getByLabelText("Expense Folder")).toHaveDisplayValue("Conference follow-up");
  });

  it("reveals a trash action with swipe left and deletes after confirmation", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });

    firePointer(expenseCard, "pointerdown", 260);
    firePointer(expenseCard, "pointermove", 120);
    firePointer(expenseCard, "pointerup", 120);

    const deleteAction = screen.getByRole("button", { name: "Delete Avec River North" });
    expect(deleteAction).toBeEnabled();

    await user.click(deleteAction);
    const confirmation = screen.getByRole("alertdialog", { name: "Delete expense" });
    await user.click(within(confirmation).getByRole("button", { name: "Confirm Delete" }));

    expect(screen.queryByRole("button", { name: /Avec River North/i })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /To review/i })).toBeInTheDocument();
  });

  it("renames an expense from the inbox long-press action sheet", async () => {
    seedAppState();
    await renderLoadedApp();
    vi.useFakeTimers();

    fireEvent.pointerDown(screen.getByRole("button", { name: /Avec River North/i }), { clientX: 140 });
    act(() => {
      vi.advanceTimersByTime(650);
    });

    const actions = screen.getByRole("dialog", { name: "Expense actions" });
    fireEvent.click(within(actions).getByRole("button", { name: "Rename Avec River North" }));

    const renameDialog = screen.getByRole("dialog", { name: "Rename expense" });
    const nameInput = within(renameDialog).getByLabelText("Expense name");
    fireEvent.change(nameInput, { target: { value: "Avec client dinner" } });
    fireEvent.click(within(renameDialog).getByRole("button", { name: "Save Name" }));

    expect(screen.queryByRole("button", { name: /Avec River North/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Avec client dinner/i })).toBeInTheDocument();
  });

  it("deletes an expense from the detail screen after confirmation", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: /Avec River North/i }));
    await user.click(screen.getByRole("button", { name: "Delete Expense" }));
    const confirmation = screen.getByRole("alertdialog", { name: "Delete expense" });
    await user.click(within(confirmation).getByRole("button", { name: "Confirm Delete" }));

    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Avec River North/i })).not.toBeInTheDocument();
  });

  it("shows required-field feedback before saving incomplete company details", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: /Avec River North/i }));
    await user.selectOptions(screen.getByLabelText("Region"), "Europe");
    await user.click(screen.getByRole("button", { name: "Save Expense" }));

    expect(screen.getByRole("heading", { name: "Expense Detail" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Review required fields");
    expect(screen.getByText("Choose a country.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Country"), "France");
    await user.click(screen.getByRole("button", { name: "Save Expense" }));

    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
  });

  it("enables Export Package generation after creating a missing receipt declaration", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("button", { name: "Generate Export Package" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Back to Inbox" }));
    await user.click(screen.getByRole("button", { name: /Shell/i }));
    await user.click(screen.getByRole("button", { name: "Create Declaration" }));
    await user.click(screen.getByRole("button", { name: "Back to Inbox" }));
    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(screen.getByRole("button", { name: "Generate Export Package" })).toBeEnabled();
  });

  it("keeps Expense Folder membership in sync when creating a declaration after changing folders", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    await user.click(await screen.findByRole("button", { name: /Shell/i }));
    await user.selectOptions(screen.getByLabelText("Expense Folder"), "report-customer-visit");
    await user.click(screen.getByRole("button", { name: "Create Declaration" }));

    await waitFor(() => {
      const stored = storedAppState();
      expect(stored.expenses?.find((expense) => expense.id === "exp-fuel-training")?.reportId).toBe("report-customer-visit");
      expect(stored.reports?.find((report) => report.id === "report-customer-visit")?.expenseIds).toContain("exp-fuel-training");
      expect(stored.reports?.find((report) => report.id === "report-may-chicago")?.expenseIds).not.toContain("exp-fuel-training");
    });
  });

  it("selects which Expense Folder is used for the Export Package", async () => {
    const user = userEvent.setup();
    seedAppState();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("heading", { name: "Chicago Training - May 2026" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Export Package Expense Folder"), "report-customer-visit");

    expect(screen.getByRole("heading", { name: "Customer Visit - Paris" })).toBeInTheDocument();
    expect(screen.getByText("May 21, 2026")).toBeInTheDocument();
  });

  it("downloads cloud Export Packages as zip bytes with the Expense Folder name", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export-package");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === "a") {
        Object.defineProperty(element, "click", { value: click });
      }
      return element;
    }) as typeof document.createElement);
    seedReadyExportState();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("button", { name: "Generate Export Package" }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith("/api/export-packages/export-package-test/download");
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: "application/zip" }));

    const link = click.mock.instances[0] as HTMLAnchorElement;
    expect(link.download).toBe("Expense-Me-June-Customer-Visit.zip");
    expect(link.href).toBe("blob:export-package");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export-package");
  });

  it("shares cloud Export Packages as zip files when the browser supports file sharing", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export-package");
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === "a") {
        Object.defineProperty(element, "click", { value: click });
      }
      return element;
    }) as typeof document.createElement);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });
    seedReadyExportState();
    await renderLoadedApp();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("button", { name: "Generate Export Package" }));

    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(canShare).toHaveBeenCalledWith({
      files: [expect.objectContaining({ name: "Expense-Me-June-Customer-Visit.zip", type: "application/zip" })]
    });
    expect(share).toHaveBeenCalledWith({
      files: [expect.objectContaining({ name: "Expense-Me-June-Customer-Visit.zip", type: "application/zip" })],
      title: "Expense-Me-June-Customer-Visit.zip"
    });
    expect(click).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
