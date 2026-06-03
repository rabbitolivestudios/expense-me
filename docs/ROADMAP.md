# Expense Me Roadmap

## V1 Goal

Build a mobile-first expense companion that captures work expenses, catches missed card charges, and creates a clean Export Package for manual entry into the company expense system.

## V1 Scope

- Mobile PWA experience with Inbox, Capture, Cards, Reports, and Export.
- Camera/image/PDF/manual intake.
- AgentMail email intake for `expense-me@agentmail.to`, using full message detail instead of summary-only subject/from parsing.
- Company-aligned fields:
  - expense type;
  - sub-expense type;
  - expense date;
  - region;
  - country;
  - city;
  - payment method;
  - amount and currency;
  - meal people count.
- Card statement import and reconciliation.
- Multiple currency fields, final USD amount, FX rate, and foreign transaction fee capture.
- Missing receipt declaration support.
- Export Package generation with an entry spreadsheet plus PDF expense index, PDF receipt copies, PDF reconciliation notes, and PDF declarations.
- Expense deletion from Inbox swipe-left and Expense Detail.
- Browser-local OCR for camera/image receipts.
- PDF embedded-text extraction with scanned-PDF OCR fallback.

## V1 Next Milestones

1. Add image preprocessing before OCR: crop, rotate, contrast, resize, sharpen.
2. Move shared app data behind a proper user session on a free-tier cloud stack, with single-user support first and team workspace support deferred.
3. Add optional low-cost LLM extraction behind a server API.
4. Add confidence warnings for OCR/parsed fields.
5. Add duplicate receipt detection across OCR text, merchant/date/amount, and card matches.
6. Improve receipt review UX with side-by-side image/PDF preview and extracted fields.
7. Move large receipt binaries out of localStorage into IndexedDB-backed artifact storage.

## V2 Goal

Reduce or remove the manual secretary/company-app entry step.

## V2 Scope Candidates

- Direct integration with the company expense system if supported.
- Browser-assisted entry into the company app when no official API is available.
- Better card provider integrations.
- Per-user settings for employee name, default region/country, preferred card, and common folders.
- Approval workflow or secretary handoff status.
- Audit trail for generated Export Packages and submitted expenses.

## Deferred Until Needed

- Multi-user collaboration.
- Full accounting-system replacement.
- Payroll, reimbursement, or payment workflows.
- Complex policy enforcement beyond export-readiness checks.
