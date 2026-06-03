import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureSheet } from "../../src/features/capture/CaptureSheet";
import { extractReceiptTextFromFile } from "../../src/features/extraction/fileTextExtraction";

function deferredExtraction() {
  let resolve!: (value: { text: string; method: "ocr" | "pdf-text" }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ text: string; method: "ocr" | "pdf-text" }>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("keeps the latest selected receipt when imports finish out of order", async () => {
    const user = userEvent.setup();
    const firstImport = deferredExtraction();
    const secondImport = deferredExtraction();
    vi.mocked(extractReceiptTextFromFile)
      .mockReturnValueOnce(firstImport.promise)
      .mockReturnValueOnce(secondImport.promise);

    render(
      <CaptureSheet
        onClose={() => undefined}
        onExpenseCreated={() => undefined}
        onOpenCards={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
      />
    );

    const uploadInput = screen.getByLabelText("Upload PDF or image file");
    await user.upload(uploadInput, new File(["slow"], "slow-hotel.pdf", { type: "application/pdf" }));
    await user.upload(uploadInput, new File(["fast"], "fast-taxi.jpg", { type: "image/jpeg" }));

    secondImport.resolve({ text: "Taxi Parisien\n05/21/2026\nTotal EUR 42.00", method: "ocr" });

    expect(await screen.findByRole("heading", { name: "Review Scan" })).toBeInTheDocument();
    expect(screen.getByLabelText("Merchant")).toHaveValue("Taxi Parisien");

    firstImport.resolve({ text: "Hotel Chicago\n05/21/2026\nTotal USD 284.20", method: "pdf-text" });

    await waitFor(() => expect(screen.getByLabelText("Merchant")).not.toHaveValue("Taxi Parisien"), { timeout: 250 }).catch(() => undefined);
    await waitFor(() => expect(screen.getByLabelText("Merchant")).toHaveValue("Taxi Parisien"));
  });

  it("allows the same failed file selection to be retried", async () => {
    const user = userEvent.setup();
    vi.mocked(extractReceiptTextFromFile)
      .mockRejectedValueOnce(new Error("Temporary OCR failure."))
      .mockResolvedValueOnce({ text: "Taxi Parisien\n05/21/2026\nTotal EUR 42.00", method: "ocr" });

    render(
      <CaptureSheet
        onClose={() => undefined}
        onExpenseCreated={() => undefined}
        onOpenCards={() => undefined}
        onSyncEmail={() => Promise.resolve(0)}
      />
    );

    const receiptFile = new File(["image"], "retry-receipt.jpg", { type: "image/jpeg" });
    const uploadInput = screen.getByLabelText("Upload PDF or image file");

    await user.upload(uploadInput, receiptFile);

    expect(await screen.findByText("Temporary OCR failure.")).toBeInTheDocument();

    await user.upload(uploadInput, receiptFile);

    expect(await screen.findByRole("heading", { name: "Review Scan" })).toBeInTheDocument();
    expect(screen.getByLabelText("Merchant")).toHaveValue("Taxi Parisien");
    expect(extractReceiptTextFromFile).toHaveBeenCalledTimes(2);
  });

  it("submits a reviewed scan only once", async () => {
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
      screen.getByLabelText("Upload PDF or image file"),
      new File(["image"], "taxi.jpg", { type: "image/jpeg" })
    );

    const confirmButton = await screen.findByRole("button", { name: "Confirm Scan" });
    await user.dblClick(confirmButton);

    expect(onExpenseCreated).toHaveBeenCalledOnce();
    expect(confirmButton).toBeDisabled();
  });
});
