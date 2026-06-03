import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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

describe("mobile app shell", () => {
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
    expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to Inbox" }));
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeInTheDocument();
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
});
