import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { seedArtifacts, seedExpenses, seedReports, seedStatementCharges } from "../fixtures";

const appStorageKey = "expense-me-v1-live-state";

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

  it("reveals an Expense Folder assignment action with swipe right", async () => {
    const user = userEvent.setup();
    seedAppState();
    render(<App />);

    const expenseCard = screen.getByRole("button", { name: /Avec River North/i });

    fireEvent.touchStart(expenseCard, { touches: [{ clientX: 120 }] });
    fireEvent.touchMove(expenseCard, { touches: [{ clientX: 240 }] });
    fireEvent.touchEnd(expenseCard, { changedTouches: [{ clientX: 240 }] });

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

    fireEvent.touchStart(expenseCard, { touches: [{ clientX: 120 }] });
    fireEvent.touchMove(expenseCard, { touches: [{ clientX: 240 }] });
    fireEvent.touchEnd(expenseCard, { changedTouches: [{ clientX: 240 }] });

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

    fireEvent.touchStart(expenseCard, { touches: [{ clientX: 260 }] });
    fireEvent.touchMove(expenseCard, { touches: [{ clientX: 120 }] });
    fireEvent.touchEnd(expenseCard, { changedTouches: [{ clientX: 120 }] });

    const deleteAction = screen.getByRole("button", { name: "Delete Avec River North" });
    expect(deleteAction).toBeEnabled();

    await user.click(deleteAction);
    const confirmation = screen.getByRole("alertdialog", { name: "Delete expense" });
    await user.click(within(confirmation).getByRole("button", { name: "Confirm Delete" }));

    expect(screen.queryByRole("button", { name: /Avec River North/i })).not.toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
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
