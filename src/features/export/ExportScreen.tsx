import { ArrowLeft, CheckCircle2, Clock3, Download, Mail, PackageCheck } from "lucide-react";
import { useState } from "react";
import { expenseFolderDateRangeLabel } from "../../domain/reportDates";
import type { Expense, ReceiptArtifact, Report } from "../../domain/types";
import { buildExportPackageZip, buildReadinessChecklist } from "./exportPackage";
import { shareOrDownloadZip } from "./shareExportPackage";
import "./export.css";

interface ExportScreenProps {
  reports: Report[];
  expenses: Expense[];
  receiptArtifacts: ReceiptArtifact[];
  onBack: () => void;
  onGenerateExportPackage?: (reportId: string) => Promise<void>;
  onEmailExportPackage?: (reportId: string) => Promise<string | undefined>;
}

export function ExportScreen({
  reports,
  expenses,
  receiptArtifacts,
  onBack,
  onGenerateExportPackage,
  onEmailExportPackage
}: ExportScreenProps) {
  const [selectedReportId, setSelectedReportId] = useState(reports[0]?.id ?? "");
  const [statusMessage, setStatusMessage] = useState("");
  const [showDeliveryActions, setShowDeliveryActions] = useState(false);
  const [busyAction, setBusyAction] = useState<"save" | "email" | null>(null);
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

  const checklist = buildReadinessChecklist(report, expenses, receiptArtifacts);
  const hasExpenses = report.expenseIds.length > 0;
  const ready = hasExpenses && checklist.length === 0;

  function revealDeliveryActions() {
    setShowDeliveryActions(true);
    setStatusMessage("");
  }

  async function savePackage() {
    setBusyAction("save");
    setStatusMessage("Preparing Export Package...");
    try {
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
      await shareOrDownloadZip(blob, `Expense-Me-${report.name.replace(/[^a-z0-9]+/gi, "-")}.zip`);
      setStatusMessage("Export Package downloaded.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Export Package failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function emailPackage() {
    if (!onEmailExportPackage) return;

    setBusyAction("email");
    setStatusMessage("Sending Export Package...");
    try {
      const recipient = await onEmailExportPackage(report.id);
      setStatusMessage(`Export Package emailed to ${recipient ?? "work email"}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Export Package email failed.");
    } finally {
      setBusyAction(null);
    }
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
            setShowDeliveryActions(false);
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

      <button className="primary-action" type="button" disabled={!ready || busyAction !== null} onClick={revealDeliveryActions}>
        Generate Export Package
      </button>

      {showDeliveryActions && ready && (
        <div className="export-delivery-actions" role="group" aria-label="Export Package delivery options">
          <button className="export-delivery-action" type="button" disabled={busyAction !== null} onClick={() => void savePackage()}>
            <Download aria-hidden="true" />
            {busyAction === "save" ? "Saving..." : "Save to Device"}
          </button>
          {onEmailExportPackage && (
            <button className="export-delivery-action" type="button" disabled={busyAction !== null} onClick={() => void emailPackage()}>
              <Mail aria-hidden="true" />
              {busyAction === "email" ? "Sending..." : "Email to Work"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
