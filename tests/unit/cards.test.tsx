import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CardsScreen } from "../../src/features/statements/CardsScreen";

describe("CardsScreen", () => {
  it("shows malformed statement upload errors without importing charges", async () => {
    const user = userEvent.setup();
    const onStatementImported = vi.fn();
    const malformedCsv = ['Transaction Date,Description,Amount', '"2026-05-21,TAXI PARISIEN,42'].join("\n");

    render(<CardsScreen onBack={() => undefined} onStatementImported={onStatementImported} />);

    await user.upload(
      screen.getByLabelText("Statement CSV file"),
      new File([malformedCsv], "bad-statement.csv", { type: "text/csv" })
    );

    expect(await screen.findByText(/Statement CSV import failed/i)).toBeInTheDocument();
    expect(onStatementImported).not.toHaveBeenCalled();
  });
});
