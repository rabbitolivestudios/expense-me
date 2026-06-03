import { ArrowLeft, CheckCircle2, Clock3, PackageCheck } from "lucide-react";
import { useState } from "react";
import { expenseFolderDateRangeLabel } from "../../domain/reportDates";
import type { Expense, ReceiptArtifact, Report } from "../../domain/types";
import { buildExportPackageZip, buildReadinessChecklist } from "./exportPackage";
import "./export.css";

interface ExportScreenProps {
  reports: Report[];
  expenses: Expense[];
  receiptArtifacts: ReceiptArtifact[];
  onBack: () => void;
  onGenerateExportPackage?: (reportId: string) => Promise<void>;
}

export function ExportScreen({ reports, expenses, receiptArtifacts, onBack, onGenerateExportPackage }: ExportScreenProps) {
  const [selectedReportId, setSelectedReportId] = useState(reports[0]?.id ?? "");
  const [statusMessage, setStatusMessage] = useState("");
  const report = reports.find((item) => item.id === selectedReportId) ?? reports[0];
  if (!report) {
    return (
      <main className="screen export-screen">
        <header className="screen-header">
          <button type="button" aria-label="Back to inbox" onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
          </button>
          <span>Export Package</span>
        </header>
        <div className="export-empty">
          <PackageCheck aria-hidden="true" />
          <h2>Create an Expense Folder first</h2>
          <p>Each Export Package needs one Expense Folder with its expenses and receipt evidence.</p>
        </div>
      </main>
    );
  }

  const checklist = buildReadinessChecklist(report, expenses);
  const hasExpenses = report.expenseIds.length > 0;
  const ready = hasExpenses && checklist.length === 0;

  async function generatePackage() {
    setStatusMessage("Generating Export Package...");
    if (onGenerateExportPackage) {
      await onGenerateExportPackage(report.id);
      setStatusMessage("Export Package downloaded.");
      return;
    }

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
          <p>{expenseFolderDateRangeLabel(report)}</p>
        </div>
      </div>

      <label className="export-folder-select">
        <span>Expense Folder</span>
        <select
          aria-label="Export Package Expense Folder"
          value={report.id}
          onChange={(event) => {
            setSelectedReportId(event.target.value);
            setStatusMessage("");
          }}
        >
          {reports.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

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
