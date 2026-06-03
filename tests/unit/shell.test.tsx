import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { seedArtifacts, seedExpenses, seedReports, seedStatementCharges } from "../fixtures";

const appStorageKey = "expense-me-v1-live-state";
const appRecoveryStorageKey = `${appStorageKey}:recovery`;

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
    reports?: typeof seedReports;
    statementCharges?: typeof seedStatementCharges;
  };
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

describe("mobile app shell", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders five bottom navigation actions with Capture centered", () => {
    render(<App />);

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
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Reports" }));
    expect(screen.getByRole("heading", { name: "Expense Folders" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to Inbox" }));
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
  });

  it("creates a new Expense Folder from the folders screen", async () => {
    const user = userEvent.setup();
    render(<App />);

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
    render(<App />);

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
    render(<App />);

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
    expect(screen.queryByText("June customer visits updated")).not.toBeInTheDocument();
  });

  it("keeps Expense Folders with expenses from being deleted", async () => {
    const user = userEvent.setup();
    seedAppState();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Reports" }));

    expect(screen.getByRole("button", { name: "Delete Expense Folder Chicago Training - May 2026" })).toBeDisabled();
  });

  it("opens card statement import from the Inbox quick action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Upload statement" }));

    expect(screen.getByRole("heading", { name: "Cards" })).toBeInTheDocument();
    expect(screen.getByText("Unmatched Charges")).toBeInTheDocument();
  });

  it("saves edited expense details back to the inbox", async () => {
    const user = userEvent.setup();
    seedAppState();
    render(<App />);

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
    render(<App />);

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
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Capture receipt" }));
    await user.click(screen.getByRole("button", { name: "Manual Expense" }));

    expect(screen.getByRole("heading", { name: "Expense Detail" })).toBeInTheDocument();
    expect(screen.getByLabelText("Expense Folder")).toHaveValue("report-may-chicago");
  });

  it("uses the active Expense Folder for newly captured expenses", async () => {
    const user = userEvent.setup();
    seedAppState();
    render(<App />);

    await user.selectOptions(screen.getByLabelText("Active Expense Folder"), "report-customer-visit");
    await user.click(screen.getByRole("button", { name: "Capture receipt" }));
    await user.click(screen.getByRole("button", { name: "Manual Expense" }));

    expect(screen.getByRole("heading", { name: "Expense Detail" })).toBeInTheDocument();
    expect(screen.getByLabelText("Expense Folder")).toHaveValue("report-customer-visit");
  });

  it("persists the active Expense Folder choice across reloads", async () => {
    const user = userEvent.setup();
    seedAppState();
    const { unmount } = render(<App />);

    await user.selectOptions(screen.getByLabelText("Active Expense Folder"), "report-customer-visit");
    expect(storedAppState().activeReportId).toBe("report-customer-visit");

    unmount();
    render(<App />);

    expect(screen.getByLabelText("Active Expense Folder")).toHaveValue("report-customer-visit");
  });

  it("loads older persisted state missing statementCharges without erasing expenses", async () => {
    window.localStorage.setItem(
      appStorageKey,
      JSON.stringify({
        expenses: seedExpenses,
        receiptArtifacts: seedArtifacts,
        reports: seedReports
      })
    );

    render(<App />);

    expect(screen.getByRole("button", { name: /Avec River North/i })).toBeInTheDocument();
    await waitFor(() => {
      const saved = storedAppState();
      expect(saved.expenses?.map((expense) => expense.id)).toContain("exp-meal-client-dinner");
      expect(saved.statementCharges).toEqual([]);
    });
  });

  it("migrates legacy persisted state missing Expense Folders into the default folder", async () => {
    window.localStorage.setItem(
      appStorageKey,
      JSON.stringify({
        expenses: seedExpenses,
        receiptArtifacts: seedArtifacts,
        statementCharges: seedStatementCharges
      })
    );

    render(<App />);

    expect(screen.getByRole("button", { name: /Avec River North/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await waitFor(() => {
      const saved = storedAppState();
      const defaultReport = saved.reports?.find((report) => report.id === "report-current");

      expect(defaultReport?.expenseIds).toEqual(seedExpenses.map((expense) => expense.id));
      expect(saved.expenses?.every((expense) => expense.reportId === "report-current")).toBe(true);
      expect(saved.activeReportId).toBe("report-current");
    });
  });

  it("reads persisted app state only during initialization", async () => {
    const user = userEvent.setup();
    seedAppState();
    const getItem = vi.spyOn(window.localStorage, "getItem");

    render(<App />);

    expect(getItem.mock.calls.filter(([key]) => key === appStorageKey)).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText("Active Expense Folder"), "report-customer-visit");

    expect(getItem.mock.calls.filter(([key]) => key === appStorageKey)).toHaveLength(1);
  });

  it("shows a warning when local persistence fails", async () => {
    seedAppState();
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Changes are not being saved");
  });

  it("does not overwrite invalid persisted state on startup", async () => {
    const invalidState = "{ invalid persisted expense state";
    window.localStorage.setItem(appStorageKey, invalidState);

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Changes are not being saved");
    expect(window.localStorage.getItem(appStorageKey)).toBe(invalidState);
  });

  it("does not overwrite invalid persisted state during StrictMode remount", async () => {
    const invalidState = "{ invalid persisted expense state";
    window.localStorage.setItem(appStorageKey, invalidState);

    render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Changes are not being saved");
    expect(window.localStorage.getItem(appStorageKey)).toBe(invalidState);
  });

  it("does not overwrite malformed persisted state missing core arrays", async () => {
    const malformedState = JSON.stringify({ reports: seedReports });
    window.localStorage.setItem(appStorageKey, malformedState);

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Changes are not being saved");
    expect(window.localStorage.getItem(appStorageKey)).toBe(malformedState);
  });

  it("resumes saving after a user change when startup state was invalid", async () => {
    const user = userEvent.setup();
    const invalidState = "{ invalid persisted expense state";
    window.localStorage.setItem(appStorageKey, invalidState);

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Changes are not being saved");
    await user.click(screen.getByRole("button", { name: "Reports" }));
    await user.type(screen.getByLabelText("New Expense Folder"), "Recovered folder");
    await user.click(screen.getByRole("button", { name: "Create Expense Folder" }));

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(appStorageKey) ?? "{}") as { reports?: Array<{ name: string }> };
      const recovery = JSON.parse(window.localStorage.getItem(appRecoveryStorageKey) ?? "{}") as { raw?: string; storageKey?: string };

      expect(stored.reports?.some((report) => report.name === "Recovered folder")).toBe(true);
      expect(recovery.storageKey).toBe(appStorageKey);
      expect(recovery.raw).toBe(invalidState);
    });
  });

  it("syncs new email expenses into the active Expense Folder", async () => {
    const user = userEvent.setup();
    seedAppState();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("messageId=")
          ? {
              message: {
                text: "Uber\nJune 3, 2026\nTrip fare $9.00\nTotal $10.00"
              }
            }
          : {
              messages: [
                {
                  message_id: "active-sync-1",
                  subject: "[Business] Your Wednesday trip with Uber",
                  timestamp: "2026-06-03T14:23:00.000Z"
                }
              ]
            };

        return new Response(JSON.stringify(body), { status: 200 });
      })
    );

    render(<App />);

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
    const detailResponse = createDeferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("messageId=")) {
        return detailResponse.promise;
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            messages: [
              {
                message_id: "stale-sync-1",
                subject: "[Business] Your Thursday evening trip with Uber",
                timestamp: "2026-06-03T14:23:00.000Z"
              }
            ]
          }),
          { status: 200 }
        )
      );
    });

    window.localStorage.setItem(
      appStorageKey,
      JSON.stringify({
        expenses: [emailExpense, ...seedExpenses],
        receiptArtifacts: seedArtifacts,
        reports,
        statementCharges: seedStatementCharges
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("button", { name: /Sync expense-me@agentmail.to inbox/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("button", { name: /Thursday evening trip with Uber/i }));
    await user.selectOptions(screen.getByLabelText("Expense Folder"), "report-customer-visit");
    await user.click(screen.getByRole("button", { name: "Save Expense" }));

    await act(async () => {
      detailResponse.resolve(
        new Response(
          JSON.stringify({
            message: {
              text: "Uber\nJun 2, 2026\nTotal $16.80"
            }
          }),
          { status: 200 }
        )
      );
      await detailResponse.promise;
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("messageId=")
          ? {
              message: {
                text: "Uber\nJun 5, 2026\nTotal $21.10"
              }
            }
          : {
              messages: [
                {
                  message_id: "repair-unassigned-1",
                  subject: "[Business] Your Friday morning trip with Uber",
                  timestamp: "2026-06-05T14:23:00.000Z"
                }
              ]
            };

        return new Response(JSON.stringify(body), { status: 200 });
      })
    );

    render(<App />);

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
    const detailResponse = createDeferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("messageId=")) {
        return detailResponse.promise;
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            messages: [
              {
                message_id: "deleted-folder-sync-1",
                subject: "[Business] Your Wednesday trip with Uber",
                timestamp: "2026-06-03T14:23:00.000Z"
              }
            ]
          }),
          { status: 200 }
        )
      );
    });

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
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("button", { name: /Sync expense-me@agentmail.to inbox/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "Reports" }));
    await user.click(screen.getByRole("button", { name: "Delete Expense Folder Empty Active Folder" }));

    await act(async () => {
      detailResponse.resolve(
        new Response(
          JSON.stringify({
            message: {
              text: "Uber\nJun 3, 2026\nTotal $10.00"
            }
          }),
          { status: 200 }
        )
      );
      await detailResponse.promise;
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
    const detailResponse = createDeferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("messageId=")) {
          return detailResponse.promise;
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [
                {
                  message_id: "active-at-start-1",
                  subject: "[Business] Your Wednesday trip with Uber",
                  timestamp: "2026-06-03T14:23:00.000Z"
                }
              ]
            }),
            { status: 200 }
          )
        );
      })
    );

    render(<App />);

    expect(screen.getByLabelText("Active Expense Folder")).toHaveValue("report-may-chicago");
    await user.click(screen.getByRole("button", { name: /Sync expense-me@agentmail.to inbox/i }));
    await user.selectOptions(screen.getByLabelText("Active Expense Folder"), "report-customer-visit");

    await act(async () => {
      detailResponse.resolve(
        new Response(
          JSON.stringify({
            message: {
              text: "Uber\nJun 3, 2026\nTotal $10.00"
            }
          }),
          { status: 200 }
        )
      );
      await detailResponse.promise;
    });

    await waitFor(() => {
      const syncedExpense = storedAppState().expenses?.find((expense) => expense.id === "exp-email-active-at-start-1");
      expect(syncedExpense?.reportId).toBe("report-may-chicago");
    });
  });

  it("reveals an Expense Folder assignment action with swipe right", async () => {
    const user = userEvent.setup();
    seedAppState();
    render(<App />);

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
    render(<App />);

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
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Avec River North/i }));
    await user.type(screen.getByLabelText("New Expense Folder"), "Conference follow-up");
    await user.click(screen.getByRole("button", { name: "Create and Select Expense Folder" }));

    expect(screen.getByLabelText("Expense Folder")).toHaveDisplayValue("Conference follow-up");

    await user.click(screen.getByRole("button", { name: "Save Expense" }));
    await user.click(screen.getByRole("button", { name: /Avec River North/i }));

    expect(screen.getByLabelText("Expense Folder")).toHaveDisplayValue("Conference follow-up");
  });

  it("reveals a trash action with swipe left and deletes after confirmation", async () => {
    const user = userEvent.setup();
    seedAppState();
    render(<App />);

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
    vi.useFakeTimers();
    seedAppState();
    render(<App />);

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
    render(<App />);

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
    render(<App />);

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
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("button", { name: "Generate Export Package" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Back to Inbox" }));
    await user.click(screen.getByRole("button", { name: /Shell/i }));
    await user.click(screen.getByRole("button", { name: "Create Declaration" }));
    await user.click(screen.getByRole("button", { name: "Back to Inbox" }));
    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(screen.getByRole("button", { name: "Generate Export Package" })).toBeEnabled();
  });

  it("selects which Expense Folder is used for the Export Package", async () => {
    const user = userEvent.setup();
    seedAppState();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("heading", { name: "Chicago Training - May 2026" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Export Package Expense Folder"), "report-customer-visit");

    expect(screen.getByRole("heading", { name: "Customer Visit - Paris" })).toBeInTheDocument();
    expect(screen.getByText("May 21, 2026")).toBeInTheDocument();
  });
});
