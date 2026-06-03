import { ArrowLeft, CheckCircle2, Clock3, PackageCheck } from "lucide-react";
import { useState } from "react";
import type { Expense, ReceiptArtifact, Report } from "../../domain/types";
import { buildExportPackageZip, buildReadinessChecklist } from "./exportPackage";
import "./export.css";

interface ExportScreenProps {
  report: Report;
  expenses: Expense[];
  receiptArtifacts: ReceiptArtifact[];
  onBack: () => void;
}

export function ExportScreen({ report, expenses, receiptArtifacts, onBack }: ExportScreenProps) {
  const [statusMessage, setStatusMessage] = useState("");
  const checklist = buildReadinessChecklist(report, expenses);
  const hasExpenses = report.expenseIds.length > 0;
  const ready = hasExpenses && checklist.length === 0;

  async function generatePackage() {
    setStatusMessage("Generating Export Package...");
    const archive = await buildExportPackageZip({
      report,
      expenses,
      receiptArtifacts,
      employeeName: "Employee name not set",
      reportReference: report.id
    });
    const blob = new Blob([archive as BlobPart], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `Expense-Me-${report.name.replace(/[^a-z0-9]+/gi, "-")}.zip`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Export Package downloaded.");
  }

  return (
    <section className="screen-stack" aria-labelledby="export-title">
      <header className="screen-header">
        <button className="back-button" type="button" aria-label="Back to Inbox" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <p className="eyebrow">Handoff</p>
          <h1 id="export-title">Export Package</h1>
        </div>
      </header>

      <div className="export-state">
        <PackageCheck aria-hidden="true" />
        <div>
          <h2>{report.name}</h2>
          <p>{report.dateRangeLabel}</p>
        </div>
      </div>

      <div className="export-checklist" aria-label="Export readiness">
        {ready && (
          <p>
            <CheckCircle2 aria-hidden="true" />
            Ready
          </p>
        )}
        {!hasExpenses && (
          <p>
            <Clock3 aria-hidden="true" />
            Add expenses before generating an Export Package.
          </p>
        )}
        {!ready &&
          hasExpenses &&
          checklist.map((item) => (
            <p key={`${item.expenseId}-${item.kind}`}>
              <Clock3 aria-hidden="true" />
              {item.message}
            </p>
          ))}
      </div>

      {statusMessage && <p className="export-status">{statusMessage}</p>}

      <button className="primary-action" type="button" disabled={!ready} onClick={() => void generatePackage()}>
        Generate Export Package
      </button>
    </section>
  );
}
