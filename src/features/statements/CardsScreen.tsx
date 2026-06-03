import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Upload } from "lucide-react";
import type { StatementCharge } from "../../domain/types";
import { parseStatementCsv } from "./statementImport";

interface StatementImportSummary {
  importedCount: number;
  matchedCount: number;
  createdCount: number;
}

interface CardsScreenProps {
  cardLabel?: string;
  statementCharges?: StatementCharge[];
  onStatementImported?: (charges: StatementCharge[]) => StatementImportSummary | void;
  onBack: () => void;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(amount);
}

function importId() {
  return `statement-${Date.now()}`;
}

function readFileText(file: File) {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(new Error("Statement CSV import failed. Check the file and try again.")));
    reader.readAsText(file);
  });
}

export function CardsScreen({
  cardLabel = "Corporate Visa",
  statementCharges = [],
  onStatementImported,
  onBack
}: CardsScreenProps) {
  const [statusMessage, setStatusMessage] = useState("");
  const charges = statementCharges;
  const unmatched = useMemo(() => charges.filter((charge) => charge.matchStatus === "Unmatched"), [charges]);
  const matched = useMemo(() => charges.filter((charge) => charge.matchStatus === "Matched"), [charges]);

  async function handleStatementUpload(file?: File, input?: HTMLInputElement) {
    if (!file) return;

    try {
      const csv = await readFileText(file);
      const parsedCharges = parseStatementCsv(csv, importId(), cardLabel);
      const summary = onStatementImported?.(parsedCharges);

      if (summary) {
        setStatusMessage(
          `${summary.importedCount} charges imported. ${summary.matchedCount} updated, ${summary.createdCount} added to Inbox.`
        );
      } else {
        setStatusMessage(`${parsedCharges.length} charges imported.`);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Statement CSV import failed. Check the file and try again.");
    } finally {
      if (input) input.value = "";
    }
  }

  return (
    <section className="screen-stack" aria-labelledby="cards-title">
      <header className="screen-header">
        <button className="back-button" type="button" aria-label="Back to Inbox" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <p className="eyebrow">Statements</p>
          <h1 id="cards-title">Cards</h1>
        </div>
        <label className="icon-button" aria-label="Upload statement">
          <Upload aria-hidden="true" />
          <input
            accept=".csv,text/csv"
            aria-label="Statement CSV file"
            className="visually-hidden"
            type="file"
            onChange={(event) => void handleStatementUpload(event.currentTarget.files?.[0], event.currentTarget)}
          />
        </label>
      </header>

      <div className="section-head">
        <h2>Unmatched Charges</h2>
        <span>{unmatched.length}</span>
      </div>

      {statusMessage && <p className="statement-status">{statusMessage}</p>}

      {unmatched.map((charge) => (
        <article className="expense-card" key={charge.id}>
          <div className="expense-main">
            <span className="status-pill match">Match</span>
            <h3>{charge.description}</h3>
            <p>
              {charge.originalAmount.toFixed(2)} {charge.originalCurrency}
              {charge.fxRate ? ` at ${charge.fxRate}` : ""}
              {charge.foreignTransactionFee ? ` + ${formatAmount(charge.foreignTransactionFee)} fee` : ""}
            </p>
          </div>
          <div className="expense-amount">
            <strong>{formatAmount(charge.finalUsdAmount)}</strong>
            <span>{charge.transactionDate}</span>
          </div>
        </article>
      ))}

      {unmatched.length === 0 && (
        <article className="expense-card">
          <div className="expense-main">
            <span className="status-pill ready">
              <CheckCircle2 aria-hidden="true" />
              Ready
            </span>
            <h3>No unmatched card charges</h3>
            <p>{charges.length === 0 ? "Upload a CSV statement to find missed charges." : "Statement imports are reconciled."}</p>
          </div>
        </article>
      )}

      {matched.length > 0 && (
        <>
          <div className="section-head compact">
            <h2>Matched Charges</h2>
            <span>{matched.length}</span>
          </div>

          {matched.slice(0, 4).map((charge) => (
            <article className="expense-card" key={charge.id}>
              <div className="expense-main">
                <span className="status-pill ready">Matched</span>
                <h3>{charge.description}</h3>
                <p>{charge.matchedExpenseId ? `Linked to ${charge.matchedExpenseId}` : "Linked to expense"}</p>
              </div>
              <div className="expense-amount">
                <strong>{formatAmount(charge.finalUsdAmount)}</strong>
                <span>{charge.transactionDate}</span>
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
