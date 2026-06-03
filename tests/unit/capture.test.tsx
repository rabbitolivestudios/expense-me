import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CaptureSheet } from "../../src/features/capture/CaptureSheet";
import { extractReceiptTextFromFile } from "../../src/features/extraction/fileTextExtraction";

vi.mock("../../src/features/extraction/fileTextExtraction", async () => {
  const actual = await vi.importActual<typeof import("../../src/features/extraction/fileTextExtraction")>(
    "../../src/features/extraction/fileTextExtraction"
  );

  return {
    ...actual,
    extractReceiptTextFromFile: vi.fn()
  };
});

describe("CaptureSheet", () => {
  it("reviews OCR results before creating the expense", async () => {
    const user = userEvent.setup();
    const onExpenseCreated = vi.fn();
    vi.mocked(extractReceiptTextFromFile).mockResolvedValue({
      text: "Taxi Parisien\n05/21/2026\nTotal EUR 42.00",
      method: "ocr"
    });

    render(
      <CaptureSheet
        onClose={() => undefined}
        onExpenseCreated={onExpenseCreated}
        onOpenCards={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
      />
    );

    await user.upload(
      screen.getByLabelText("Camera receipt file"),
      new File(["image"], "hotel-wrong-name.jpg", { type: "image/jpeg" })
    );

    expect(await screen.findByRole("heading", { name: "Review Scan" })).toBeInTheDocument();
    expect(onExpenseCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Merchant")).toHaveValue("Taxi Parisien");
    expect(screen.getByLabelText("Amount")).toHaveValue(42);
    expect(screen.getByLabelText("Currency")).toHaveValue("EUR");
    expect(screen.getByRole("button", { name: "Taxi" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Confirm Scan" }));

    await waitFor(() => expect(onExpenseCreated).toHaveBeenCalledOnce());
    const [expense, artifacts] = onExpenseCreated.mock.calls[0];

    expect(expense.merchant).toBe("Taxi Parisien");
    expect(expense.expenseType).toBe("Transport");
    expect(expense.subExpenseType).toBe("Taxi");
    expect(expense.originalAmount).toBe(42);
    expect(expense.originalCurrency).toBe("EUR");
    expect(expense.notes).toContain("image OCR");
    expect(artifacts[0].extractedText).toContain("Taxi Parisien");
  });

  it("lets the user correct extracted fields and apply a category chip", async () => {
    const user = userEvent.setup();
    const onExpenseCreated = vi.fn();
    vi.mocked(extractReceiptTextFromFile).mockResolvedValue({
      text: "Unknown vendor\n05/21/2026\nTotal USD 284.20",
      method: "pdf-text"
    });

    render(
      <CaptureSheet
        onClose={() => undefined}
        onExpenseCreated={onExpenseCreated}
        onOpenCards={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
      />
    );

    await user.upload(
      screen.getByLabelText("Upload PDF or image file"),
      new File(["pdf"], "receipt.pdf", { type: "application/pdf" })
    );

    expect(await screen.findByRole("heading", { name: "Review Scan" })).toBeInTheDocument();
    expect(screen.getByText(/Unknown vendor/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Merchant"));
    await user.type(screen.getByLabelText("Merchant"), "Hotel Chicago");
    await user.click(screen.getByRole("button", { name: "Hotel" }));
    await user.click(screen.getByRole("button", { name: "Confirm Scan" }));

    await waitFor(() => expect(onExpenseCreated).toHaveBeenCalledOnce());
    const [expense] = onExpenseCreated.mock.calls[0];

    expect(expense.merchant).toBe("Hotel Chicago");
    expect(expense.description).toBe("Hotel Chicago");
    expect(expense.expenseType).toBe("Stay");
    expect(expense.subExpenseType).toBe("Hotel");
    expect(expense.originalAmount).toBe(284.2);
  });
});
