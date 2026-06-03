import { useEffect, useState } from "react";
import { ArrowLeft, FileSignature, Save, Trash2 } from "lucide-react";
import {
  expenseTypeOptions,
  getCountryOptions,
  getDefaultSubExpenseType,
  getSubExpenseTypeOptions,
  isMealExpenseType,
  regionOptions
} from "../../domain/options";
import type { Expense, ExpenseType, PaymentMethod, Region, Report } from "../../domain/types";
import "./expense.css";

interface ExpenseDetailScreenProps {
  expense: Expense;
  onBack: () => void;
  onCreateDeclaration: (expense: Expense) => void;
  onCreateExpenseFolder: (name: string, dates?: { startDate?: string; endDate?: string }) => Report | undefined;
  onDelete: (expenseId: string) => void;
  reports: Report[];
  onSave: (expense: Expense) => void;
}

const paymentMethods: PaymentMethod[] = ["Credit Card", "Personal Card", "Cash", "Company Paid"];
type DetailFieldKey =
  | "reportId"
  | "subExpenseType"
  | "expenseDate"
  | "country"
  | "city"
  | "paymentMethod"
  | "originalAmount"
  | "originalCurrency"
  | "description"
  | "mealPeopleCount";

type DetailFieldErrors = Partial<Record<DetailFieldKey, string>>;

function updateNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function FieldLabel({ children, required = true }: { children: string; required?: boolean }) {
  return <span className={required ? "field-label is-required" : "field-label"}>{children}</span>;
}

function getValidationErrors(expense: Expense): DetailFieldErrors {
  const errors: DetailFieldErrors = {};

  if (!expense.reportId) errors.reportId = "Choose an Expense Folder.";
  if (!expense.subExpenseType) errors.subExpenseType = "Choose a sub expense type.";
  if (!expense.expenseDate) errors.expenseDate = "Choose an expense date.";
  if (!expense.country) errors.country = "Choose a country.";
  if (!expense.city.trim()) errors.city = "Enter a city.";
  if (!expense.paymentMethod) errors.paymentMethod = "Choose a payment method.";
  if (!Number.isFinite(expense.originalAmount) || expense.originalAmount <= 0) {
    errors.originalAmount = "Enter an amount greater than zero.";
  }
  if (!/^[A-Z]{3}$/.test(expense.originalCurrency)) {
    errors.originalCurrency = "Use a 3-letter currency code.";
  }
  if (!expense.description.trim()) errors.description = "Enter an expense description.";
  if (isMealExpenseType(expense.expenseType) && (!expense.mealPeopleCount || expense.mealPeopleCount <= 0)) {
    errors.mealPeopleCount = "Enter the number of people.";
  }

  return errors;
}

export function ExpenseDetailScreen({ expense, onBack, onCreateDeclaration, onCreateExpenseFolder, onDelete, reports, onSave }: ExpenseDetailScreenProps) {
  const [draft, setDraft] = useState<Expense>(expense);
  const [showValidation, setShowValidation] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    setDraft(expense);
    setShowValidation(false);
    setConfirmingDelete(false);
    setNewFolderName("");
  }, [expense]);

  const needsDeclaration = draft.receiptArtifactIds.length === 0 && !draft.declarationId;

  function update<K extends keyof Expense>(key: K, value: Expense[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateExpenseType(expenseType: ExpenseType) {
    setDraft((current) => {
      const subExpenseTypeOptions = getSubExpenseTypeOptions(expenseType);
      const repeatsParentOnly = subExpenseTypeOptions.length === 1 && subExpenseTypeOptions[0] === expenseType;
      let subExpenseType = current.subExpenseType || getDefaultSubExpenseType(expenseType);

      if (repeatsParentOnly) {
        subExpenseType = expenseType;
      } else if (current.expenseType !== expenseType || !subExpenseTypeOptions.includes(current.subExpenseType)) {
        subExpenseType = "";
      }

      return {
        ...current,
        expenseType,
        subExpenseType,
        mealPeopleCount: isMealExpenseType(expenseType) ? current.mealPeopleCount : undefined,
        attendeeNames: isMealExpenseType(expenseType) ? current.attendeeNames : undefined
      };
    });
  }

  function updateRegion(region: Region) {
    setDraft((current) => {
      const countryOptions = getCountryOptions(region);
      return {
        ...current,
        region,
        country: countryOptions.includes(current.country) ? current.country : ""
      };
    });
  }

  function saveDraft() {
    const nextErrors = getValidationErrors(draft);
    if (Object.keys(nextErrors).length > 0) {
      setShowValidation(true);
      return;
    }

    const saved: Expense = {
      ...draft,
      status: draft.receiptArtifactIds.length > 0 || draft.declarationId ? "Ready" : draft.status
    };
    onSave(saved);
  }

  function createAndSelectFolder() {
    const report = onCreateExpenseFolder(newFolderName, { startDate: draft.expenseDate, endDate: draft.expenseDate });
    if (!report) return;

    setDraft((current) => ({ ...current, reportId: report.id }));
    setNewFolderName("");
  }

  const subExpenseTypeOptions = getSubExpenseTypeOptions(draft.expenseType);
  const subExpenseSelectValue = subExpenseTypeOptions.includes(draft.subExpenseType) ? draft.subExpenseType : "";
  const repeatsParentOnly = subExpenseTypeOptions.length === 1 && subExpenseTypeOptions[0] === draft.expenseType;
  const countryOptions = getCountryOptions(draft.region);
  const countrySelectValue = countryOptions.includes(draft.country) ? draft.country : "";
  const validationErrors = getValidationErrors(draft);
  const visibleErrors = showValidation ? validationErrors : {};
  const reportSelectValue = reports.some((report) => report.id === draft.reportId) ? draft.reportId ?? "" : "";

  function errorFor(field: DetailFieldKey) {
    return visibleErrors[field];
  }

  function fieldClass(field?: DetailFieldKey) {
    return field && errorFor(field) ? "detail-field has-error" : "detail-field";
  }

  function describedBy(field: DetailFieldKey) {
    return errorFor(field) ? `${field}-error` : undefined;
  }

  function FieldError({ field }: { field: DetailFieldKey }) {
    const message = errorFor(field);
    return message ? (
      <small className="field-error" id={`${field}-error`}>
        {message}
      </small>
    ) : null;
  }

  return (
    <section className="screen-stack" aria-labelledby="detail-title">
      <header className="screen-header">
        <button className="back-button" type="button" aria-label="Back to Inbox" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <p className="eyebrow">Corporate details</p>
          <h1 id="detail-title">Expense Detail</h1>
        </div>
      </header>

      <div className="detail-grid">
        <label className={fieldClass("reportId")}>
          <FieldLabel>Expense Folder</FieldLabel>
          <select
            aria-label="Expense Folder"
            value={reportSelectValue}
            onChange={(event) => update("reportId", event.target.value)}
            aria-invalid={Boolean(errorFor("reportId"))}
            aria-describedby={describedBy("reportId")}
          >
            <option value="" disabled>
              Select Expense Folder
            </option>
            {reports.map((report) => (
              <option key={report.id} value={report.id}>
                {report.name}
              </option>
            ))}
          </select>
          <FieldError field="reportId" />
        </label>
        <div className="detail-folder-create">
          <label>
            <span>New Expense Folder</span>
            <input
              aria-label="New Expense Folder"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="Trip, training, customer visit"
            />
          </label>
          <button type="button" disabled={!newFolderName.trim()} onClick={createAndSelectFolder}>
            Create and Select Expense Folder
          </button>
        </div>
        <label className="detail-field">
          <FieldLabel>Expense type</FieldLabel>
          <select
            aria-label="Expense type"
            value={draft.expenseType}
            onChange={(event) => updateExpenseType(event.target.value as ExpenseType)}
          >
            {expenseTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldClass("subExpenseType")}>
          <FieldLabel>Sub expense type</FieldLabel>
          {subExpenseTypeOptions.length > 0 ? (
            <select
              aria-label="Sub expense type"
              value={subExpenseSelectValue}
              onChange={(event) => update("subExpenseType", event.target.value)}
              aria-invalid={Boolean(errorFor("subExpenseType"))}
              aria-describedby={describedBy("subExpenseType")}
            >
              {!repeatsParentOnly && (
                <option value="" disabled>
                  Select Sub expense type
                </option>
              )}
              {subExpenseTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label="Sub expense type"
              value={draft.subExpenseType}
              onChange={(event) => update("subExpenseType", event.target.value)}
              aria-invalid={Boolean(errorFor("subExpenseType"))}
              aria-describedby={describedBy("subExpenseType")}
            />
          )}
          <FieldError field="subExpenseType" />
        </label>
        <label className={fieldClass("expenseDate")}>
          <FieldLabel>Expense date</FieldLabel>
          <input
            aria-label="Expense date"
            type="date"
            value={draft.expenseDate}
            onChange={(event) => update("expenseDate", event.target.value)}
            aria-invalid={Boolean(errorFor("expenseDate"))}
            aria-describedby={describedBy("expenseDate")}
          />
          <FieldError field="expenseDate" />
        </label>
        <label className="detail-field">
          <FieldLabel>Region</FieldLabel>
          <select aria-label="Region" value={draft.region} onChange={(event) => updateRegion(event.target.value as Region)}>
            {regionOptions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldClass("country")}>
          <FieldLabel>Country</FieldLabel>
          <select
            aria-label="Country"
            value={countrySelectValue}
            onChange={(event) => update("country", event.target.value)}
            aria-invalid={Boolean(errorFor("country"))}
            aria-describedby={describedBy("country")}
          >
            <option value="" disabled>
              Select Country
            </option>
            {countryOptions.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
          <FieldError field="country" />
        </label>
        <label className={fieldClass("city")}>
          <FieldLabel>City</FieldLabel>
          <input
            aria-label="City"
            value={draft.city}
            onChange={(event) => update("city", event.target.value)}
            aria-invalid={Boolean(errorFor("city"))}
            aria-describedby={describedBy("city")}
          />
          <FieldError field="city" />
        </label>
        <label className={fieldClass("paymentMethod")}>
          <FieldLabel>Payment method</FieldLabel>
          <select
            aria-label="Payment method"
            value={draft.paymentMethod}
            onChange={(event) => update("paymentMethod", event.target.value as PaymentMethod)}
            aria-invalid={Boolean(errorFor("paymentMethod"))}
            aria-describedby={describedBy("paymentMethod")}
          >
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
          <FieldError field="paymentMethod" />
        </label>
        <label className={fieldClass("originalAmount")}>
          <FieldLabel>Amount</FieldLabel>
          <input
            aria-label="Amount"
            inputMode="decimal"
            type="number"
            value={draft.originalAmount}
            onChange={(event) => update("originalAmount", updateNumber(event.target.value))}
            aria-invalid={Boolean(errorFor("originalAmount"))}
            aria-describedby={describedBy("originalAmount")}
          />
          <FieldError field="originalAmount" />
        </label>
        <label className={fieldClass("originalCurrency")}>
          <FieldLabel>Currency</FieldLabel>
          <input
            aria-label="Currency"
            maxLength={3}
            value={draft.originalCurrency}
            onChange={(event) => update("originalCurrency", event.target.value.toUpperCase())}
            aria-invalid={Boolean(errorFor("originalCurrency"))}
            aria-describedby={describedBy("originalCurrency")}
          />
          <FieldError field="originalCurrency" />
        </label>
        <label className="detail-field">
          <FieldLabel required={false}>Final USD</FieldLabel>
          <input
            aria-label="Final USD"
            inputMode="decimal"
            type="number"
            value={draft.finalUsdAmount ?? ""}
            onChange={(event) => update("finalUsdAmount", event.target.value ? updateNumber(event.target.value) : undefined)}
          />
        </label>
        {isMealExpenseType(draft.expenseType) && (
          <label className={fieldClass("mealPeopleCount")}>
            <FieldLabel>Number of people</FieldLabel>
            <input
              aria-label="Number of people"
              inputMode="numeric"
              type="number"
              value={draft.mealPeopleCount ?? ""}
              onChange={(event) => update("mealPeopleCount", event.target.value ? updateNumber(event.target.value) : undefined)}
              aria-invalid={Boolean(errorFor("mealPeopleCount"))}
              aria-describedby={describedBy("mealPeopleCount")}
            />
            <FieldError field="mealPeopleCount" />
          </label>
        )}
        <label className={`${fieldClass("description")} span-full`}>
          <FieldLabel>Expense Description</FieldLabel>
          <textarea
            aria-label="Expense Description"
            value={draft.description}
            onChange={(event) => update("description", event.target.value)}
            aria-invalid={Boolean(errorFor("description"))}
            aria-describedby={describedBy("description")}
          />
          <FieldError field="description" />
        </label>
      </div>

      <div className="detail-actions">
        {showValidation && Object.keys(validationErrors).length > 0 && (
          <div className="detail-validation" role="alert">
            <strong>Review required fields</strong>
            <span>Complete the highlighted fields before saving.</span>
          </div>
        )}
        {needsDeclaration && (
          <button className="secondary-action" type="button" onClick={() => onCreateDeclaration(draft)}>
            <FileSignature aria-hidden="true" />
            Create Declaration
          </button>
        )}
        <button className="primary-action" type="button" onClick={saveDraft}>
          <Save aria-hidden="true" />
          Save Expense
        </button>
        <button className="danger-action" type="button" onClick={() => setConfirmingDelete(true)}>
          <Trash2 aria-hidden="true" />
          Delete Expense
        </button>
        {confirmingDelete && (
          <div className="delete-confirmation detail-delete-confirmation" role="alertdialog" aria-label="Delete expense">
            <strong>Delete expense?</strong>
            <div>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
              <button className="confirm-delete" type="button" onClick={() => onDelete(expense.id)}>
                Confirm Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
