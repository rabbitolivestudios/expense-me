# Expense Me Roadmap

## V1 Goal

Build a mobile-first expense companion that captures work expenses, catches missed card charges, and creates a clean Export Package for manual entry into the company expense system.

## V1 Scope

- Mobile PWA experience with Inbox, Capture, Cards, Reports, and Export.
- Camera/image/PDF/manual intake.
- AgentMail email intake for `expense-me@agentmail.to`.
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
- Export Package generation with spreadsheet, review notes, receipt copies, and declarations.
- Expense deletion from Inbox swipe-left and Expense Detail.

## V1 Next Milestones

1. Add Expense Folders as mandatory business grouping.
2. Add Inbox swipe-right assignment to Expense Folder.
3. Add Expense Detail folder dropdown and quick-create folder flow.
4. Make Export Package generation folder-based.
5. Improve readiness messages so each blocker names the affected expense and folder.
6. Wire OCR for camera images and scanned receipts.
7. Improve PDF/email attachment extraction.
8. Add optional low-cost LLM extraction behind a server API.

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
