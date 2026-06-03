import { CreditCard, FileText, MailCheck, ReceiptText, RotateCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import type { Expense } from "../../domain/types";
import "./inbox.css";

interface InboxScreenProps {
  expenses: Expense[];
  onOpenExpense: (expenseId: string) => void;
  onDeleteExpense: (expenseId: string) => void;
  onCapture: () => void;
  onOpenCards: () => void;
  onSyncEmail: () => Promise<number>;
}

function titleForExpense(expense: Expense) {
  return expense.merchant ?? expense.description;
}

function statusClass(status: Expense["status"]) {
  return status.toLowerCase();
}

function detailForExpense(expense: Expense) {
  return [expense.city, expense.subExpenseType].filter(Boolean).join(" · ");
}

interface SwipeState {
  expenseId: string;
  startX: number;
}

export function InboxScreen({ expenses, onOpenExpense, onDeleteExpense, onCapture, onOpenCards, onSyncEmail }: InboxScreenProps) {
  const [syncStatus, setSyncStatus] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [revealedExpenseId, setRevealedExpenseId] = useState<string | null>(null);
  const [confirmingExpenseId, setConfirmingExpenseId] = useState<string | null>(null);
  const swipeState = useRef<SwipeState | null>(null);
  const suppressNextOpen = useRef<string | null>(null);
  const attention = expenses.filter((expense) => expense.status !== "Ready");
  const ready = expenses.filter((expense) => expense.status === "Ready");

  async function syncEmail() {
    setSyncing(true);
    setSyncStatus("Checking email...");

    try {
      const count = await onSyncEmail();
      setSyncStatus(count === 0 ? "Email synced. No new receipts." : `Email synced. ${count} new receipt${count === 1 ? "" : "s"}.`);
    } catch {
      setSyncStatus("Email sync needs the local AgentMail server.");
    } finally {
      setSyncing(false);
    }
  }

  function titleForDelete(expense: Expense) {
    return titleForExpense(expense);
  }

  function startSwipe(expenseId: string, clientX: number) {
    swipeState.current = { expenseId, startX: clientX };
  }

  function moveSwipe(expenseId: string, clientX: number) {
    const swipe = swipeState.current;
    if (!swipe || swipe.expenseId !== expenseId) return;

    const deltaX = clientX - swipe.startX;
    if (deltaX < -48) {
      setRevealedExpenseId(expenseId);
      suppressNextOpen.current = expenseId;
    } else if (deltaX > 28) {
      setRevealedExpenseId(null);
      setConfirmingExpenseId(null);
    }
  }

  function endSwipe() {
    swipeState.current = null;
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
      setConfirmingExpenseId(null);
      return;
    }

    onOpenExpense(expenseId);
  }

  function confirmDelete(expenseId: string) {
    onDeleteExpense(expenseId);
    setRevealedExpenseId(null);
    setConfirmingExpenseId(null);
  }

  function renderExpense(expense: Expense) {
    const isRevealed = revealedExpenseId === expense.id;
    const isConfirming = confirmingExpenseId === expense.id;
    const title = titleForDelete(expense);

    return (
      <div className={`swipe-row ${isRevealed ? "is-revealed" : ""}`} key={expense.id}>
        <div className="swipe-actions" aria-hidden={!isRevealed}>
          <button
            className="swipe-delete"
            type="button"
            aria-label={`Delete ${title}`}
            disabled={!isRevealed}
            tabIndex={isRevealed ? 0 : -1}
            onClick={() => setConfirmingExpenseId(expense.id)}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
        <button
          className="expense-card action-card"
          type="button"
          onClick={() => openExpense(expense.id)}
          onPointerDown={(event) => startSwipe(expense.id, event.clientX)}
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
            <span className={`status-pill ${statusClass(expense.status)}`}>{expense.status}</span>
            <strong>{titleForExpense(expense)}</strong>
            <small>{detailForExpense(expense)}</small>
          </span>
          <span className="expense-amount">
            <strong>
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: expense.originalCurrency,
                maximumFractionDigits: 2
              }).format(expense.originalAmount)}
            </strong>
            <small>{expense.expenseDate}</small>
          </span>
        </button>
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
      </div>
    );
  }

  return (
    <section className="screen-stack inbox-screen" aria-labelledby="screen-title">
      <header className="screen-header">
        <div>
          <div className="brand-lockup">
            <img src="/icons/expense-me-icon-192.png" alt="Expense Me app icon" />
            <span className="brand-name">Expense Me</span>
          </div>
          <h1 id="screen-title">Inbox</h1>
        </div>
        <button className="icon-button" type="button" aria-label="Sync email now" onClick={() => void syncEmail()} disabled={syncing}>
          <RotateCw aria-hidden="true" />
        </button>
      </header>

      <div className="sync-strip">
        <MailCheck aria-hidden="true" />
        <span>expense-me@agentmail.to</span>
        <strong>{syncing ? "Syncing" : "Auto sync"}</strong>
      </div>
      {syncStatus && <p className="inline-status">{syncStatus}</p>}

      <div className="metric-grid" aria-label="Expense summary">
        <div className="metric-panel">
          <span>{attention.length}</span>
          <p>Needs review</p>
        </div>
        <div className="metric-panel accent">
          <span>{ready.length}</span>
          <p>Ready</p>
        </div>
      </div>

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

      <div className="section-head">
        <h2>Needs attention</h2>
        <span>{attention.length}</span>
      </div>

      <div className="expense-list">
        {attention.length === 0 && (
          <article className="expense-card">
            <span className="expense-main">
              <span className="status-pill ready">Ready</span>
              <strong>No expenses yet</strong>
              <small>Capture a receipt, upload a PDF, sync email, or import a statement.</small>
            </span>
          </article>
        )}
        {attention.map(renderExpense)}
      </div>

      {ready.length > 0 && (
        <>
          <div className="section-head compact">
            <h2>Ready</h2>
            <span>{ready.length}</span>
          </div>
          <div className="expense-list">
            {ready.map(renderExpense)}
          </div>
        </>
      )}
    </section>
  );
}
