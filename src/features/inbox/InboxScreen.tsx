import {
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  FolderInput,
  MailCheck,
  Moon,
  Pencil,
  ReceiptText,
  RotateCw,
  Sun,
  Trash2,
  X
} from "lucide-react";
import { useRef, useState } from "react";
import type { Expense, Report } from "../../domain/types";
import { ReadyRing } from "../../components/ReadyRing";
import type { ThemeMode } from "../shell/useTheme";
import "./inbox.css";

interface InboxScreenProps {
  expenses: Expense[];
  reports: Report[];
  onOpenExpense: (expenseId: string) => void;
  onDeleteExpense: (expenseId: string) => void;
  onAssignExpenseFolder: (expenseId: string, reportId: string) => void;
  onCreateExpenseFolder: (name: string, dates?: { startDate?: string; endDate?: string }) => Report | undefined;
  onRenameExpense: (expenseId: string, name: string) => void;
  onCapture: () => void;
  onOpenCards: () => void;
  onOpenExport: () => void;
  onSyncEmail: () => Promise<number>;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

function titleForExpense(expense: Expense) {
  return expense.merchant ?? expense.description;
}

function statusClass(status: Expense["status"]) {
  return status.toLowerCase();
}

function statusLabel(status: Expense["status"]) {
  if (status === "Declare") return "No receipt";
  if (status === "FX") return "Check FX";
  if (status === "Match") return "Card match";
  return status;
}

function detailForExpense(expense: Expense) {
  return [expense.city, expense.subExpenseType].filter(Boolean).join(" · ");
}

function folderNameForExpense(expense: Expense, reports: Report[]) {
  return reports.find((report) => report.id === expense.reportId)?.name ?? "No Expense Folder";
}

function usdValue(expense: Expense) {
  return expense.finalUsdAmount ?? expense.originalAmount ?? 0;
}

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function emailSyncErrorMessage(_error: unknown) {
  return "Email sync failed. Try again in a minute.";
}

interface SwipeState {
  expenseId: string;
  startX: number;
}

type RevealedAction = "assign" | "delete";
type InboxFilter = "all" | "attention" | "declare" | "ready";

const filterDefs: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attention", label: "To review" },
  { key: "declare", label: "No receipt" },
  { key: "ready", label: "Ready" }
];

export function InboxScreen({
  expenses,
  reports,
  onOpenExpense,
  onDeleteExpense,
  onAssignExpenseFolder,
  onCreateExpenseFolder,
  onRenameExpense,
  onCapture,
  onOpenCards,
  onOpenExport,
  onSyncEmail,
  theme,
  onToggleTheme
}: InboxScreenProps) {
  const [syncStatus, setSyncStatus] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [revealedExpenseId, setRevealedExpenseId] = useState<string | null>(null);
  const [revealedAction, setRevealedAction] = useState<RevealedAction | null>(null);
  const [confirmingExpenseId, setConfirmingExpenseId] = useState<string | null>(null);
  const [assigningExpenseId, setAssigningExpenseId] = useState<string | null>(null);
  const [assignDraftReportId, setAssignDraftReportId] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [actionMenuExpenseId, setActionMenuExpenseId] = useState<string | null>(null);
  const [renamingExpenseId, setRenamingExpenseId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const swipeState = useRef<SwipeState | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const suppressNextOpen = useRef<string | null>(null);

  const attention = expenses.filter((expense) => expense.status !== "Ready");
  const ready = expenses.filter((expense) => expense.status === "Ready");

  // Active Expense Folder (Export's default) drives the hero ring + readiness band.
  const activeFolder = reports[0];
  const folderExpenses = activeFolder ? expenses.filter((expense) => expense.reportId === activeFolder.id) : [];
  const folderReady = folderExpenses.filter((expense) => expense.status === "Ready").length;
  const folderTotal = folderExpenses.reduce((sum, expense) => sum + usdValue(expense), 0);
  const folderPct = folderExpenses.length > 0 ? Math.round((folderReady / folderExpenses.length) * 100) : 0;

  const counts: Record<InboxFilter, number> = {
    all: expenses.length,
    attention: attention.length,
    declare: expenses.filter((expense) => expense.status === "Declare").length,
    ready: ready.length
  };

  const shown = expenses.filter((expense) => {
    if (filter === "all") return true;
    if (filter === "attention") return expense.status !== "Ready";
    if (filter === "declare") return expense.status === "Declare";
    return expense.status === "Ready";
  });

  async function syncEmail() {
    setSyncing(true);
    setSyncStatus("Checking email...");

    try {
      const count = await onSyncEmail();
      setSyncStatus(count === 0 ? "Email synced. No receipt updates." : `Email synced. ${count} receipt${count === 1 ? "" : "s"} updated.`);
    } catch (error) {
      setSyncStatus(emailSyncErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  function startSwipe(expenseId: string, clientX: number) {
    swipeState.current = { expenseId, startX: clientX };
  }

  function clearLongPressTimer() {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function startLongPress(expenseId: string) {
    clearLongPressTimer();
    longPressTimer.current = window.setTimeout(() => {
      setActionMenuExpenseId(expenseId);
      setRevealedExpenseId(null);
      setRevealedAction(null);
      setConfirmingExpenseId(null);
      setAssigningExpenseId(null);
      suppressNextOpen.current = expenseId;
    }, 600);
  }

  function moveSwipe(expenseId: string, clientX: number) {
    const swipe = swipeState.current;
    if (!swipe || swipe.expenseId !== expenseId) return;

    const deltaX = clientX - swipe.startX;
    if (Math.abs(deltaX) > 10) {
      clearLongPressTimer();
    }

    if (deltaX < -48) {
      setRevealedExpenseId(expenseId);
      setRevealedAction("delete");
      suppressNextOpen.current = expenseId;
    } else if (deltaX > 48) {
      setRevealedExpenseId(expenseId);
      setRevealedAction("assign");
      suppressNextOpen.current = expenseId;
    } else if (deltaX > 28 || deltaX < -28) {
      setRevealedExpenseId(null);
      setRevealedAction(null);
      setConfirmingExpenseId(null);
      setAssigningExpenseId(null);
    }
  }

  function endSwipe() {
    swipeState.current = null;
    clearLongPressTimer();
  }

  function touchClientX(event: React.TouchEvent<HTMLButtonElement>) {
    return event.touches[0]?.clientX ?? event.changedTouches[0]?.clientX;
  }

  function openExpense(expenseId: string) {
    if (suppressNextOpen.current === expenseId) {
      suppressNextOpen.current = null;
      return;
    }

    if (revealedExpenseId === expenseId) {
      setRevealedExpenseId(null);
      setRevealedAction(null);
      setConfirmingExpenseId(null);
      setAssigningExpenseId(null);
      setActionMenuExpenseId(null);
      return;
    }

    onOpenExpense(expenseId);
  }

  function confirmDelete(expenseId: string) {
    onDeleteExpense(expenseId);
    setRevealedExpenseId(null);
    setRevealedAction(null);
    setConfirmingExpenseId(null);
  }

  function openAssignFromActions(expense: Expense) {
    setActionMenuExpenseId(null);
    startAssign(expense);
  }

  function startAssign(expense: Expense) {
    setAssigningExpenseId(expense.id);
    setAssignDraftReportId(expense.reportId ?? reports[0]?.id ?? "");
    setNewFolderName("");
  }

  function confirmAssign(expenseId: string) {
    if (!assignDraftReportId) return;

    onAssignExpenseFolder(expenseId, assignDraftReportId);
    setAssigningExpenseId(null);
    setRevealedExpenseId(null);
    setRevealedAction(null);
    suppressNextOpen.current = null;
  }

  function createAndSelectFolder(expenseDate: string) {
    const report = onCreateExpenseFolder(newFolderName, { startDate: expenseDate, endDate: expenseDate });
    if (!report) return;

    setAssignDraftReportId(report.id);
    setNewFolderName("");
  }

  function startRename(expense: Expense) {
    setActionMenuExpenseId(null);
    setRenamingExpenseId(expense.id);
    setRenameDraft(titleForExpense(expense));
  }

  function confirmRename(expenseId: string) {
    const trimmedName = renameDraft.trim();
    if (!trimmedName) return;

    onRenameExpense(expenseId, trimmedName);
    setRenamingExpenseId(null);
    setRenameDraft("");
    suppressNextOpen.current = null;
  }

  function renderExpense(expense: Expense) {
    const isDeleteRevealed = revealedExpenseId === expense.id && revealedAction === "delete";
    const isAssignRevealed = revealedExpenseId === expense.id && revealedAction === "assign";
    const isConfirming = confirmingExpenseId === expense.id;
    const isAssigning = assigningExpenseId === expense.id;
    const isActionMenuOpen = actionMenuExpenseId === expense.id;
    const isRenaming = renamingExpenseId === expense.id;
    const title = titleForExpense(expense);
    const isForeign = expense.originalCurrency !== "USD";

    return (
      <div className={`swipe-row ${isDeleteRevealed ? "is-delete-revealed" : ""} ${isAssignRevealed ? "is-assign-revealed" : ""}`} key={expense.id}>
        <div className="swipe-assign-actions" aria-hidden={!isAssignRevealed}>
          <button
            className="swipe-assign"
            type="button"
            aria-label={`Assign Expense Folder for ${title}`}
            disabled={!isAssignRevealed}
            tabIndex={isAssignRevealed ? 0 : -1}
            onClick={() => startAssign(expense)}
          >
            <FolderInput aria-hidden="true" />
          </button>
        </div>
        <div className="swipe-actions" aria-hidden={!isDeleteRevealed}>
          <button
            className="swipe-delete"
            type="button"
            aria-label={`Delete ${title}`}
            disabled={!isDeleteRevealed}
            tabIndex={isDeleteRevealed ? 0 : -1}
            onClick={() => setConfirmingExpenseId(expense.id)}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
        <button
          className="expense-card action-card"
          type="button"
          onClick={() => openExpense(expense.id)}
          onPointerDown={(event) => {
            startSwipe(expense.id, event.clientX);
            startLongPress(expense.id);
          }}
          onPointerMove={(event) => moveSwipe(expense.id, event.clientX)}
          onPointerUp={endSwipe}
          onPointerCancel={endSwipe}
          onTouchStart={(event) => {
            const clientX = touchClientX(event);
            if (clientX !== undefined) startSwipe(expense.id, clientX);
          }}
          onTouchMove={(event) => {
            const clientX = touchClientX(event);
            if (clientX !== undefined) moveSwipe(expense.id, clientX);
          }}
          onTouchEnd={endSwipe}
        >
          <span className="expense-main">
            <span className={`status-pill ${statusClass(expense.status)}`}>{statusLabel(expense.status)}</span>
            <strong>{titleForExpense(expense)}</strong>
            <small>{detailForExpense(expense)}</small>
            <small className="folder-line">{folderNameForExpense(expense, reports)}</small>
          </span>
          <span className="expense-amount">
            <strong>{formatMoney(expense.originalAmount, expense.originalCurrency)}</strong>
            <small>
              {isForeign ? `${formatMoney(usdValue(expense), "USD")} · ` : ""}
              {expense.expenseDate}
            </small>
          </span>
        </button>
        {isActionMenuOpen && (
          <div className="expense-action-sheet" role="dialog" aria-label="Expense actions">
            <div>
              <strong>{title}</strong>
              <button type="button" aria-label="Close expense actions" onClick={() => setActionMenuExpenseId(null)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <button type="button" aria-label={`Assign Expense Folder for ${title}`} onClick={() => openAssignFromActions(expense)}>
              <FolderInput aria-hidden="true" />
              Assign Folder
            </button>
            <button type="button" aria-label={`Rename ${title}`} onClick={() => startRename(expense)}>
              <Pencil aria-hidden="true" />
              Rename
            </button>
            <button
              type="button"
              aria-label={`Delete ${title}`}
              onClick={() => {
                setActionMenuExpenseId(null);
                setConfirmingExpenseId(expense.id);
              }}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </button>
          </div>
        )}
        {isRenaming && (
          <div className="expense-rename-panel" role="dialog" aria-label="Rename expense">
            <label>
              <span>Expense name</span>
              <input aria-label="Expense name" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} />
            </label>
            <div>
              <button type="button" onClick={() => setRenamingExpenseId(null)}>
                Cancel
              </button>
              <button className="confirm-rename" type="button" disabled={!renameDraft.trim()} onClick={() => confirmRename(expense.id)}>
                Save Name
              </button>
            </div>
          </div>
        )}
        {isConfirming && (
          <div className="delete-confirmation" role="alertdialog" aria-label="Delete expense">
            <strong>Delete expense?</strong>
            <div>
              <button type="button" onClick={() => setConfirmingExpenseId(null)}>
                Cancel
              </button>
              <button className="confirm-delete" type="button" onClick={() => confirmDelete(expense.id)}>
                Confirm Delete
              </button>
            </div>
          </div>
        )}
        {isAssigning && (
          <div className="folder-assignment" role="dialog" aria-label="Assign Expense Folder">
            <label>
              <span>Expense Folder</span>
              <select
                aria-label="Expense Folder"
                value={assignDraftReportId}
                onChange={(event) => setAssignDraftReportId(event.target.value)}
              >
                {reports.map((report) => (
                  <option key={report.id} value={report.id}>
                    {report.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="folder-quick-create">
              <label>
                <span>New Expense Folder</span>
                <input
                  aria-label="New Expense Folder"
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="Trip, training, customer visit"
                />
              </label>
              <button type="button" disabled={!newFolderName.trim()} onClick={() => createAndSelectFolder(expense.expenseDate)}>
                Create and Select Expense Folder
              </button>
            </div>
            <div className="assignment-actions">
              <button
                type="button"
                onClick={() => {
                  setAssigningExpenseId(null);
                  setNewFolderName("");
                }}
              >
                Cancel
              </button>
              <button className="confirm-assign" type="button" disabled={!assignDraftReportId} onClick={() => confirmAssign(expense.id)}>
                Assign Folder
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="screen-stack inbox-screen" aria-labelledby="screen-title">
      <header className="screen-header has-stats">
        <div className="hero-top">
          <div className="brand-lockup">
            <img src="/icons/expense-me-icon-192.png" alt="Expense Me app icon" />
            <span className="brand-name">Expense Me</span>
          </div>
          <div className="hero-actions">
            <button className="icon-button" type="button" aria-label="Toggle dark mode" onClick={onToggleTheme}>
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
            <button className="icon-button" type="button" aria-label="Sync email now" onClick={() => void syncEmail()} disabled={syncing}>
              <RotateCw aria-hidden="true" />
            </button>
          </div>
        </div>
        <div>
          {activeFolder && <p className="eyebrow">{activeFolder.name}</p>}
          <h1 id="screen-title">Inbox</h1>
        </div>
        <div className="hero-stats">
          <ReadyRing pct={folderPct} />
          <div className="hero-stat">
            <div className="v">{attention.length}</div>
            <div className="l">To review</div>
          </div>
          <div className="hero-stat">
            <div className="v">{ready.length}</div>
            <div className="l">Ready</div>
          </div>
          <div className="hero-stat push">
            <div className="v sm">{formatUsd(folderTotal)}</div>
            <div className="l">In folder</div>
          </div>
        </div>
      </header>

      <button className="readiness-card" type="button" onClick={onOpenExport} aria-label="Open Export Package">
        <span className="readiness-icon">
          <Download aria-hidden="true" />
        </span>
        <span>
          <span className="readiness-title">
            {folderPct === 100 ? "Ready to build package" : `${Math.max(0, folderExpenses.length - folderReady)} to finish`}
          </span>
          <span className="readiness-sub">
            {activeFolder?.name ?? "Expense Folder"} · {folderReady}/{folderExpenses.length} ready
          </span>
          <span className="readiness-bar">
            <span className={folderPct === 100 ? "full" : ""} style={{ width: `${folderPct}%` }} />
          </span>
        </span>
        <ChevronRight aria-hidden="true" />
      </button>

      <div className="sync-strip">
        <MailCheck aria-hidden="true" />
        <span>expense-me@agentmail.to</span>
        <strong>{syncing ? "Syncing" : "Auto sync"}</strong>
      </div>
      {syncStatus && <p className="inline-status">{syncStatus}</p>}

      <div className="quick-row" aria-label="Quick intake actions">
        <button type="button" aria-label="Start receipt capture" onClick={onCapture}>
          <ReceiptText aria-hidden="true" />
          Receipt
        </button>
        <button type="button" aria-label="Upload PDF" onClick={onCapture}>
          <FileText aria-hidden="true" />
          PDF
        </button>
        <button type="button" aria-label="Open email intake" onClick={onCapture}>
          <MailCheck aria-hidden="true" />
          Email
        </button>
        <button type="button" aria-label="Upload statement" onClick={onOpenCards}>
          <CreditCard aria-hidden="true" />
          Statement
        </button>
      </div>

      <div className="filter-chips" role="tablist" aria-label="Filter expenses">
        {filterDefs.map((def) => (
          <button
            key={def.key}
            type="button"
            role="tab"
            aria-selected={filter === def.key}
            className={filter === def.key ? "active" : ""}
            onClick={() => setFilter(def.key)}
          >
            {def.label}
            <span className="count">{counts[def.key]}</span>
          </button>
        ))}
      </div>

      <div className="expense-list">
        {shown.length === 0 && (
          <article className="expense-card empty-state-card">
            <span className="expense-main">
              <span className="status-pill ready">Ready</span>
              <strong>All clear here</strong>
              <small>Nothing matches this filter. Capture a receipt or sync your email.</small>
            </span>
          </article>
        )}
        {shown.map(renderExpense)}
      </div>
    </section>
  );
}
