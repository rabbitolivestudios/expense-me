import { ArrowLeft, Camera, CreditCard, FileText, Keyboard, MailCheck } from "lucide-react";
import { useState } from "react";
import type { ArtifactType, Expense, IntakeSource, ReceiptArtifact } from "../../domain/types";
import { createExpenseFromExtractedText } from "../extraction/extractionPipeline";
import "./capture.css";

interface CaptureSheetProps {
  onClose: () => void;
  onExpenseCreated: (expense: Expense, artifacts?: ReceiptArtifact[]) => void;
  onOpenCards: () => void;
  onSyncEmail: () => Promise<number>;
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

async function createExpenseFromFile(file: File, sourceType: IntakeSource) {
  const id = nextId("exp-upload");
  const baseText = file.type.startsWith("text/") ? await file.text() : file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
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
    extractedText: baseText,
    dataUrl
  };

  return {
    expense: {
      ...expense,
      sourceType,
      status: "Review" as const,
      receiptArtifactIds: [artifact.id],
      notes: `Imported from ${file.name}`
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

export function CaptureSheet({ onClose, onExpenseCreated, onOpenCards, onSyncEmail }: CaptureSheetProps) {
  const [statusMessage, setStatusMessage] = useState("");
  const [syncingEmail, setSyncingEmail] = useState(false);

  async function handleFile(file: File | undefined, sourceType: IntakeSource) {
    if (!file) return;
    const imported = await createExpenseFromFile(file, sourceType);
    onExpenseCreated(imported.expense, [imported.artifact]);
  }

  async function checkEmail() {
    setSyncingEmail(true);
    setStatusMessage("Checking email...");

    try {
      const count = await onSyncEmail();
      setStatusMessage(count === 0 ? "No new email receipts found." : `${count} email receipt${count === 1 ? "" : "s"} added to Inbox.`);
    } catch {
      setStatusMessage("Email sync needs the local AgentMail server.");
    } finally {
      setSyncingEmail(false);
    }
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
          onChange={(event) => void handleFile(event.target.files?.[0], "Camera")}
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
            onChange={(event) => void handleFile(event.target.files?.[0], "Upload")}
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
