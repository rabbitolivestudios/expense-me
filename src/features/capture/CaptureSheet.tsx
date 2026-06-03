import { ArrowLeft, Camera, Check, CreditCard, FileText, Keyboard, MailCheck, RotateCcw } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import type { ArtifactType, Expense, IntakeSource, ReceiptArtifact } from "../../domain/types";
import { createExpenseFromExtractedText } from "../extraction/extractionPipeline";
import { extractReceiptTextFromFile, type ExtractionMethod } from "../extraction/fileTextExtraction";
import "./capture.css";

interface CaptureSheetProps {
  onClose: () => void;
  onExpenseCreated: (expense: Expense, artifacts?: ReceiptArtifact[]) => void;
  onOpenCards: () => void;
  onSyncEmail: () => Promise<number>;
}

interface PendingScan {
  expense: Expense;
  artifact: ReceiptArtifact;
}

const categoryChips = [
  { label: "Hotel", expenseType: "Stay", subExpenseType: "Hotel" },
  { label: "Taxi", expenseType: "Transport", subExpenseType: "Taxi" },
  { label: "Meal", expenseType: "Meals", subExpenseType: "Lunch" },
  { label: "Fuel", expenseType: "Transport", subExpenseType: "Fuel" },
  { label: "Parking", expenseType: "Transport", subExpenseType: "Parking" },
  { label: "Toll", expenseType: "Transport", subExpenseType: "Toll" },
  { label: "Flight", expenseType: "Transport", subExpenseType: "Air" },
  { label: "Office", expenseType: "Other Expenses", subExpenseType: "Office Supplies" }
] as const satisfies ReadonlyArray<Pick<Expense, "expenseType" | "subExpenseType"> & { label: string }>;

function nextId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomId}`;
}

function fallbackTextFromFilename(file: File) {
  return file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Imported receipt";
}

function extractionLabel(method: ExtractionMethod) {
  switch (method) {
    case "ocr":
      return "image OCR";
    case "pdf-text":
      return "PDF text";
    case "pdf-ocr":
      return "scanned PDF OCR";
    case "text":
      return "text file";
    default:
      return "manual review";
  }
}

function emailSyncErrorMessage(_error: unknown) {
  return "Email sync failed. Try again in a minute.";
}

async function createExpenseFromFile(file: File, sourceType: IntakeSource) {
  const id = nextId("exp-upload");
  const extraction = await extractReceiptTextFromFile(file);
  const extractedText = extraction.text;
  const baseText = extractedText || fallbackTextFromFilename(file);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(new Error("Receipt file import failed.")));
    reader.readAsDataURL(file);
  });
  const expense = createExpenseFromExtractedText(id, baseText);
  const artifactType: ArtifactType = file.type === "application/pdf"
    ? "PdfReceipt"
    : sourceType === "Camera"
      ? "CameraImage"
      : "UploadedImage";
  const artifact: ReceiptArtifact = {
    id: `art-${id}`,
    artifactType,
    originalFilename: file.name || `${id}.${file.type === "application/pdf" ? "pdf" : "jpg"}`,
    mimeType: file.type || "application/octet-stream",
    storageKey: `local/${id}/${file.name || "receipt"}`,
    createdAt: new Date().toISOString(),
    extractedText,
    dataUrl
  };

  return {
    expense: {
      ...expense,
      sourceType,
      status: "Review" as const,
      receiptArtifactIds: [artifact.id],
      notes: `Imported from ${file.name || "receipt"} using ${extractionLabel(extraction.method)}.`
    },
    artifact
  };
}

function createManualExpense() {
  return {
    id: nextId("exp-manual"),
    sourceType: "Manual",
    status: "Declare",
    expenseType: "Other Expenses",
    subExpenseType: "Any other expenses",
    expenseDate: new Date().toISOString().slice(0, 10),
    region: "NAFTA",
    country: "United States",
    city: "",
    description: "Manual expense",
    paymentMethod: "Credit Card",
    originalAmount: 0.01,
    originalCurrency: "USD",
    finalUsdAmount: 0.01,
    receiptArtifactIds: [],
    confidence: 1
  } satisfies Expense;
}

function receiptPreviewForArtifact(artifact: ReceiptArtifact) {
  const extractedPreviewText = artifact.extractedText?.trim();

  if (artifact.mimeType === "application/pdf" && extractedPreviewText) {
    return <pre>{extractedPreviewText}</pre>;
  }

  if (artifact.mimeType === "application/pdf") {
    return <iframe title="Receipt PDF preview" src={artifact.dataUrl} />;
  }

  if (artifact.mimeType.startsWith("image/")) {
    return <img alt="Receipt preview" src={artifact.dataUrl} />;
  }

  return <pre>{artifact.extractedText || "No preview text available."}</pre>;
}

export function CaptureSheet({ onClose, onExpenseCreated, onOpenCards, onSyncEmail }: CaptureSheetProps) {
  const [statusMessage, setStatusMessage] = useState("");
  const [syncingEmail, setSyncingEmail] = useState(false);
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [draftExpense, setDraftExpense] = useState<Expense | null>(null);
  const [scanSubmitted, setScanSubmitted] = useState(false);
  const scanRequestIdRef = useRef(0);
  const scanSubmittedRef = useRef(false);

  async function handleFile(file: File | undefined, sourceType: IntakeSource) {
    if (!file) return;
    const requestId = scanRequestIdRef.current + 1;
    scanRequestIdRef.current = requestId;
    scanSubmittedRef.current = false;
    setScanSubmitted(false);
    setStatusMessage(sourceType === "Camera" ? "Scanning receipt..." : "Reading receipt...");

    try {
      const imported = await createExpenseFromFile(file, sourceType);
      if (requestId !== scanRequestIdRef.current) return;
      setPendingScan(imported);
      setDraftExpense(imported.expense);
      setStatusMessage("");
    } catch (error) {
      if (requestId !== scanRequestIdRef.current) return;
      setStatusMessage(error instanceof Error ? error.message : "Receipt scan failed. Try again or enter it manually.");
    }
  }

  function handleReceiptInputChange(event: ChangeEvent<HTMLInputElement>, sourceType: IntakeSource) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    void handleFile(file, sourceType);
  }

  function updateDraft(patch: Partial<Expense>) {
    setDraftExpense((current) => (current ? { ...current, ...patch } : current));
  }

  function updateAmount(value: string) {
    const parsed = Number(value);
    updateDraft({
      originalAmount: Number.isFinite(parsed) ? parsed : 0,
      finalUsdAmount: draftExpense?.originalCurrency === "USD" && Number.isFinite(parsed) ? parsed : draftExpense?.finalUsdAmount
    });
  }

  function updateCurrency(value: string) {
    updateDraft({
      originalCurrency: value,
      finalUsdAmount: value === "USD" ? draftExpense?.originalAmount : undefined
    });
  }

  function applyCategoryChip(chip: (typeof categoryChips)[number]) {
    updateDraft({
      expenseType: chip.expenseType,
      subExpenseType: chip.subExpenseType
    });
  }

  function confirmScan() {
    if (!pendingScan || !draftExpense || scanSubmittedRef.current) return;
    scanSubmittedRef.current = true;
    setScanSubmitted(true);
    const merchant = draftExpense.merchant?.trim();
    const description = merchant || draftExpense.description || "Imported receipt";

    onExpenseCreated(
      {
        ...draftExpense,
        merchant: merchant || draftExpense.merchant,
        description,
        finalUsdAmount: draftExpense.originalCurrency === "USD" ? draftExpense.originalAmount : draftExpense.finalUsdAmount
      },
      [pendingScan.artifact]
    );
  }

  function clearPendingScan() {
    scanRequestIdRef.current += 1;
    scanSubmittedRef.current = false;
    setScanSubmitted(false);
    setPendingScan(null);
    setDraftExpense(null);
    setStatusMessage("");
  }

  async function checkEmail() {
    setSyncingEmail(true);
    setStatusMessage("Checking email...");

    try {
      const count = await onSyncEmail();
      setStatusMessage(count === 0 ? "No email receipt updates found." : `${count} email receipt${count === 1 ? "" : "s"} updated in Inbox.`);
    } catch (error) {
      setStatusMessage(emailSyncErrorMessage(error));
    } finally {
      setSyncingEmail(false);
    }
  }

  if (pendingScan && draftExpense) {
    const activeChip = categoryChips.find(
      (chip) => chip.expenseType === draftExpense.expenseType && chip.subExpenseType === draftExpense.subExpenseType
    );
    const preview = receiptPreviewForArtifact(pendingScan.artifact);

    return (
      <section className="screen-stack" aria-labelledby="review-scan-title">
        <header className="screen-header">
          <button className="back-button" type="button" aria-label="Back to Capture" onClick={clearPendingScan}>
            <ArrowLeft aria-hidden="true" />
          </button>
          <div>
            <p className="eyebrow">Scanned receipt</p>
            <h1 id="review-scan-title">Review Scan</h1>
          </div>
        </header>

        <div className="scan-review">
          <div className="scan-preview" aria-label="Receipt preview">
            {preview}
          </div>

          <div className="scan-fields">
            <label>
              <span>Merchant</span>
              <input
                aria-label="Merchant"
                value={draftExpense.merchant ?? ""}
                onChange={(event) => updateDraft({ merchant: event.target.value, description: event.target.value || draftExpense.description })}
              />
            </label>
            <div className="scan-field-row">
              <label>
                <span>Date</span>
                <input
                  aria-label="Expense date"
                  type="date"
                  value={draftExpense.expenseDate}
                  onChange={(event) => updateDraft({ expenseDate: event.target.value })}
                />
              </label>
              <label>
                <span>Amount</span>
                <input
                  aria-label="Amount"
                  inputMode="decimal"
                  type="number"
                  value={draftExpense.originalAmount}
                  onChange={(event) => updateAmount(event.target.value)}
                />
              </label>
            </div>
            <label>
              <span>Currency</span>
              <select aria-label="Currency" value={draftExpense.originalCurrency} onChange={(event) => updateCurrency(event.target.value)}>
                {["USD", "EUR", "GBP", "CAD", "MXN"].map((currency) => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="scan-chips" aria-label="Category chips">
          {categoryChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              aria-pressed={activeChip?.label === chip.label}
              onClick={() => applyCategoryChip(chip)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="scan-review-actions">
          <button type="button" onClick={clearPendingScan}>
            <RotateCcw aria-hidden="true" />
            Retake
          </button>
          <button className="confirm-scan" type="button" onClick={confirmScan} disabled={scanSubmitted}>
            <Check aria-hidden="true" />
            Confirm Scan
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="screen-stack" aria-labelledby="capture-title">
      <header className="screen-header">
        <button className="back-button" type="button" aria-label="Back to Inbox" onClick={onClose}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <p className="eyebrow">Main action</p>
          <h1 id="capture-title">Capture</h1>
        </div>
      </header>

      <label className="camera-panel">
        <Camera aria-hidden="true" />
        <span>Scan Receipt</span>
        <input
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Camera receipt file"
          onChange={(event) => handleReceiptInputChange(event, "Camera")}
        />
      </label>

      <div className="capture-grid" aria-label="Capture options">
        <label>
          <FileText aria-hidden="true" />
          Upload PDF or Image
          <input
            className="visually-hidden"
            type="file"
            accept="image/*,application/pdf,text/plain"
            aria-label="Upload PDF or image file"
            onChange={(event) => handleReceiptInputChange(event, "Upload")}
          />
        </label>
        <button type="button" onClick={() => void checkEmail()} disabled={syncingEmail}>
          <MailCheck aria-hidden="true" />
          {syncingEmail ? "Checking Email" : "Check Email"}
        </button>
        <button type="button" onClick={onOpenCards}>
          <CreditCard aria-hidden="true" />
          Upload Statement
        </button>
        <button type="button" onClick={() => onExpenseCreated(createManualExpense())}>
          <Keyboard aria-hidden="true" />
          Manual Expense
        </button>
      </div>

      {statusMessage && <p className="capture-status">{statusMessage}</p>}
    </section>
  );
}
