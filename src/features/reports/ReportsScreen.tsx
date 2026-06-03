import { useState } from "react";
import { ArrowLeft, CheckCircle2, FolderPlus, Pencil, Save, Trash2, X } from "lucide-react";
import { expenseFolderDateRangeLabel } from "../../domain/reportDates";
import type { Report } from "../../domain/types";

interface ExpenseFolderDates {
  startDate?: string;
  endDate?: string;
}

interface ReportsScreenProps {
  reports: Report[];
  onBack: () => void;
  onCreateReport: (name: string, dates?: ExpenseFolderDates) => void;
  onDeleteReport: (reportId: string) => void;
  onRenameReport: (reportId: string, name: string, dates?: ExpenseFolderDates) => void;
}

export function ReportsScreen({ reports, onBack, onCreateReport, onDeleteReport, onRenameReport }: ReportsScreenProps) {
  const [newFolderName, setNewFolderName] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingStartDate, setEditingStartDate] = useState("");
  const [editingEndDate, setEditingEndDate] = useState("");

  function createFolder() {
    const trimmedName = newFolderName.trim();
    if (!trimmedName) return;

    onCreateReport(trimmedName, { startDate: newStartDate, endDate: newEndDate });
    setNewFolderName("");
    setNewStartDate("");
    setNewEndDate("");
  }

  function startRename(report: Report) {
    setEditingReportId(report.id);
    setEditingName(report.name);
    setEditingStartDate(report.startDate ?? "");
    setEditingEndDate(report.endDate ?? "");
  }

  function saveRename(reportId: string) {
    onRenameReport(reportId, editingName, { startDate: editingStartDate, endDate: editingEndDate });
    setEditingReportId(null);
    setEditingName("");
    setEditingStartDate("");
    setEditingEndDate("");
  }

  return (
    <section className="screen-stack" aria-labelledby="reports-title">
      <header className="screen-header">
        <button className="back-button" type="button" aria-label="Back to Inbox" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <p className="eyebrow">Business grouping</p>
          <h1 id="reports-title">Expense Folders</h1>
        </div>
      </header>

      <div className="folder-create">
        <label>
          <span>New Expense Folder</span>
          <input
            aria-label="New Expense Folder"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="Trip, training, customer visit"
          />
        </label>
        <label>
          <span>Start date</span>
          <input
            aria-label="New Expense Folder start date"
            type="date"
            value={newStartDate}
            onChange={(event) => setNewStartDate(event.target.value)}
          />
        </label>
        <label>
          <span>End date</span>
          <input
            aria-label="New Expense Folder end date"
            type="date"
            value={newEndDate}
            onChange={(event) => setNewEndDate(event.target.value)}
          />
        </label>
        <button type="button" onClick={createFolder} disabled={!newFolderName.trim()} aria-label="Create Expense Folder">
          <FolderPlus aria-hidden="true" />
        </button>
      </div>

      {reports.map((report) => {
        const isEditing = editingReportId === report.id;
        const canDelete = reports.length > 1 && report.expenseIds.length === 0;

        return (
          <article className="report-panel" key={report.id}>
            <CheckCircle2 aria-hidden="true" />
            <div>
              {isEditing ? (
                <div className="report-edit">
                  <input
                    aria-label="Expense Folder name"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                  />
                  <input
                    aria-label="Expense Folder start date"
                    type="date"
                    value={editingStartDate}
                    onChange={(event) => setEditingStartDate(event.target.value)}
                  />
                  <input
                    aria-label="Expense Folder end date"
                    type="date"
                    value={editingEndDate}
                    onChange={(event) => setEditingEndDate(event.target.value)}
                  />
                  <div>
                    <button type="button" aria-label="Save Expense Folder name" onClick={() => saveRename(report.id)} disabled={!editingName.trim()}>
                      <Save aria-hidden="true" />
                    </button>
                    <button type="button" aria-label="Cancel Expense Folder rename" onClick={() => setEditingReportId(null)}>
                      <X aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2>{report.name}</h2>
                  <p>{expenseFolderDateRangeLabel(report)}</p>
                </>
              )}
            </div>
            <div className="report-actions">
              <strong>{report.expenseIds.length} items</strong>
              <div>
                <button type="button" aria-label={`Rename Expense Folder ${report.name}`} onClick={() => startRename(report)}>
                  <Pencil aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete Expense Folder ${report.name}`}
                  onClick={() => onDeleteReport(report.id)}
                  disabled={!canDelete}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
