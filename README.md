# Expense Me

Mobile-first expense intake and export app for work expenses.

Expense Me helps capture receipts from camera uploads, PDFs/images, email intake, manual entries, and card statements. It keeps company-required expense fields aligned with the current expense-reporting workflow, reconciles card charges, and generates an export package with transaction details and supporting evidence.

## Live App

https://expense-me-tbo.vercel.app

## Product Shape

Expense Me is designed around three layers:

- **Expense**: one receipt, card charge, or manual item.
- **Expense Folder**: the required business grouping for related expenses, such as a trip, training, customer visit, or monthly batch.
- **Export Package**: the generated handoff file for one Expense Folder, including the entry spreadsheet, review notes, receipt copies, and missing-receipt declarations.

The current app has the first V1 implementation of expenses, card reconciliation, Expense Folders, browser-local receipt OCR/PDF extraction, and export packages.

## Current Capabilities

- Mobile-first inbox, capture, cards, reports, and export screens
- Camera/image/PDF/manual intake with browser-local OCR and PDF text extraction
- AgentMail inbox sync for `expense-me@agentmail.to`, including full message detail parsing and repair of older summary-only imports
- Company-style expense type, sub-expense type, region, and country fields
- Meal attendee count support
- Card statement import and matching
- Swipe-left and detail-screen expense deletion with confirmation
- Export package generation with receipts/declarations and review files

## Documentation

- [Decisions](docs/DECISIONS.md)
- [V1/V2 Roadmap](docs/ROADMAP.md)
- [Browser Harness Notes](docs/browser-harness.md)
- [Original Product Spec](docs/superpowers/specs/2026-06-02-expense-me-design.md)

## Local Setup

```bash
npm install
npm run dev
```

Create a local `.env` file from `.env.example` when testing AgentMail sync.

## Email Sync

On the Inbox screen, tap the `expense-me@agentmail.to` sync strip or the refresh icon in the header. The address is displayed as plain app text; it should not open a mail compose sheet.

## Validation

```bash
npm test
npm run build
```

Before committing app changes, also run the Clawpatch review gate:

```bash
npx clawpatch map --source heuristic
npx clawpatch review --since <base-ref> --include-dirty
npx clawpatch report
```

## Deployment

The production app is deployed on Vercel at `expense-me-tbo.vercel.app`. AgentMail credentials are configured as Vercel environment variables and must not be committed to the repository. Shared app data and login should stay on free-tier infrastructure unless the product requirement changes.
