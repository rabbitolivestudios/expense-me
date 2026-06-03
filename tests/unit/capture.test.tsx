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
  it("creates receipt expenses from OCR text instead of the file name", async () => {
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
});
