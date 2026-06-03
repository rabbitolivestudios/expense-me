# Expense Me V1 Design Spec

## Summary

Expense Me is a mobile-first expense report PWA for capturing work expenses, reconciling them against card statements, and producing an Export Package that another person can use to enter expenses into the company expense system.

V1 focuses on a complete, useful workflow:

1. Capture or import receipts.
2. Extract expense details automatically.
3. Reconcile card charges and currency conversion.
4. Review only missing or low-confidence information.
5. Build a polished Export Package.

The app must work well on a phone first. Desktop is a convenience for review and export, not the primary interaction model.

## Product Name

The app is named **Expense Me**.

## Primary User

The primary user is a traveler or employee who needs to collect receipts and prepare a clean expense handoff. The app assumes the user is often in a restaurant, hotel, taxi, airport, or between meetings, so the first screen must make capture fast and the review queue calm.

## V1 Goals

- Installable mobile web app/PWA.
- Camera-first receipt capture.
- PDF/image upload.
- Automatic inbound email intake from `expense-me@agentmail.to` through AgentMail.
- Manual entry fallback.
- Manual upload of credit card statement CSV/PDF files.
- Reconciliation between expenses and statement charges.
- Multiple currency support with USD as default.
- Card statement final amount, FX rate, and foreign fee used as source of truth when available.
- User-confirmed estimate/manual correction when statement data is unavailable.
- Corporate expense fields that mirror the company system.
- Meal headcount required, attendee names optional.
- Missing-receipt declaration generation.
- Export Package containing PDF report, spreadsheet, receipts/evidence files, declarations, and reconciliation notes.

## V2 Goals

- Direct connection to the company expense report system.
- Optional card feed integrations where possible.
- Expanded cloud sync and multi-device collaboration.
- More automatic background processing when the app is not open.

## Non-Goals for V1

- Direct submission into the company expense report system.
- Full card-account connection through Plaid, Finicity, or similar providers.
- Replacing the company expense system.
- Multi-user approval workflow.
- Fully autonomous expense submission without user review.

## Mobile App Shell

V1 uses a five-action bottom navigation bar:

- Inbox
- Reports
- Capture
- Cards
- Export

Capture is the raised center action and the main mobile function. Tapping Capture opens the camera by default. Secondary capture options include PDF upload, email sync status, statement upload, and manual entry.

## Main Screens

### Inbox

The Inbox is the home screen. It shows all captured, imported, unmatched, and incomplete items grouped by status.

Inbox responsibilities:

- Show the camera-first capture path.
- Show quick intake actions for PDF, Email, and Statement.
- Surface auto-synced email receipts.
- Group items into attention queues such as Needs attention and Ready.
- Let the user open an Expense Detail screen.
- Let the user assign ready expenses to a Report.

Mobile statuses:

- Ready: complete and exportable.
- Review: needs field confirmation or correction.
- Match: waiting for card statement reconciliation.
- FX: no statement source; user confirms USD amount, FX rate, or fees.
- Declare: no receipt; missing-receipt declaration required.
- Duplicate: likely duplicate evidence or charge.
- Context: useful trip context, not an expense yet.

### Capture

Capture opens camera capture first. The user can take a receipt photo and create an expense candidate.

Capture also provides secondary intake options:

- Upload PDF/image.
- Paste or upload email content when needed.
- Check AgentMail sync.
- Upload statement.
- Create manual expense.

The capture result enters the same extraction pipeline regardless of source.

### Expense Detail

Expense Detail is a focused mobile form, not a dense desktop panel. It mirrors corporate fields and shows evidence plus confidence status.

Required core fields:

- Expense type
- Sub expense type
- Expense date
- Region
- Country
- City
- Expense description
- Payment method
- Amount
- Currency

Meal-specific fields:

- Number of people is required.
- Attendee names are optional.

Supporting fields:

- Merchant
- Original amount and currency
- Final USD amount
- FX rate
- Foreign transaction fee
- Statement match reference
- Receipt/evidence attachment
- Missing-receipt declaration status
- Notes
- Confidence flags

### Cards

Cards is the statement reconciliation area.

V1 supports manual statement upload:

- CSV statements.
- PDF statements where parsing is possible.
- Corporate and personal card statements.

Reconciliation responsibilities:

- Import statement charges.
- Detect charges that do not have expenses.
- Match statement charges to existing expense candidates.
- Use the statement final USD amount, FX rate, and foreign fee as source of truth.
- Mark unresolved charges as unmatched.
- Preserve match audit notes for export.

### Reports

Reports are trip or date-range folders that collect expenses from the Inbox.

Report responsibilities:

- Create trip/date-range reports.
- Add or remove expenses.
- Show completion checks.
- Show totals by currency and USD.
- Track missing receipts/declarations.
- Prepare the Export Package.

### Export

Export builds the final Export Package. The UI and spec use the name **Export Package** for this final handoff feature.

Export Package contents:

- Review PDF with transaction details and receipt images/copies.
- Entry spreadsheet with corporate fields in row format.
- Receipt/evidence folder or zip.
- Missing-receipt declaration PDFs.
- Statement reconciliation notes and unmatched charge audit.

Readiness checks before export:

- Required corporate fields complete.
- Amount/currency present.
- Meal headcount present for meal expenses.
- Receipt attached or declaration generated.
- Statement match complete or FX/manual amount explicitly confirmed.
- Duplicates resolved or acknowledged.

## Inbound Email

V1 includes AgentMail inbound email intake using:

`expense-me@agentmail.to`

The AgentMail API token is intentionally not stored in this spec. It must be stored only as a protected server/app setting and must never appear in client-side code, exported reports, screenshots, or generated packages.

Email sync behavior:

- Auto-sync while the app is open.
- Sync on app launch.
- Sync after reconnecting from offline.
- Provide a visible Sync now action as a fallback.
- Show last successful sync time.
- Show a calm failure banner if sync fails.

Email ingestion flow:

1. Fetch AgentMail messages.
2. Store AgentMail message IDs for idempotency.
3. Extract sender, subject, body text, timestamps, and attachments.
4. Fingerprint attachments to prevent duplicates.
5. Route PDFs and images into the same OCR/document pipeline as camera captures.
6. Classify the result as an expense, supporting evidence for an existing expense, or trip context.

## Data Model

### Expense

An Expense contains corporate fields, monetary values, currency information, review state, report assignment, and attached evidence.

Key attributes:

- ID
- Source type
- Status
- Expense type
- Sub expense type
- Date
- Region
- Country
- City
- Merchant
- Description
- Payment method
- Original amount
- Original currency
- Final USD amount
- FX rate
- Foreign transaction fee
- Meal people count
- Optional attendee names
- Notes
- Receipt artifact IDs
- Statement charge match ID
- Declaration ID
- Report ID
- Confidence scores/flags

### Receipt Artifact

A Receipt Artifact is evidence attached to an expense candidate or final expense.

Artifact types:

- Camera image
- Uploaded image
- PDF receipt
- Email body
- Email attachment
- Missing-receipt declaration

Key attributes:

- ID
- Artifact type
- Original filename
- Source message ID when applicable
- Storage path
- MIME type
- Created timestamp
- OCR/extraction result
- Attachment fingerprint

### Statement Charge

A Statement Charge is imported from a card statement.

Key attributes:

- ID
- Statement import ID
- Card/account label
- Transaction date
- Posted date
- Merchant/description
- Original amount
- Original currency
- Final USD amount
- FX rate
- Foreign transaction fee
- Match status
- Matched expense ID

### Report

A Report is a trip or date-range package of expenses.

Key attributes:

- ID
- Name
- Trip/date range
- Expense IDs
- Export readiness status
- Totals by currency
- USD total
- Generated package artifacts

### Export Package

An Export Package is the generated handoff bundle.

Key attributes:

- ID
- Report ID
- Generated timestamp
- Review PDF path
- Spreadsheet path
- Receipt folder/zip path
- Declaration PDF paths
- Reconciliation notes path

## Automation Pipeline

Every source enters the same product pipeline:

1. Source: camera receipt, PDF, uploaded image, email, manual entry, or statement row.
2. Extract: merchant, date, amount, currency, location, expense type, sub-type, and notes.
3. Normalize: map extracted values into corporate fields.
4. Reconcile: match to statement charges and apply final USD/FX/fee source-of-truth rules.
5. Review: ask for confirmation only when confidence is low or required fields are missing.
6. Package: export complete report artifacts.

## Currency Rules

- Default currency is USD.
- When a card statement match exists, the statement final USD amount is the source of truth.
- Statement-provided FX rate and foreign transaction fee must be captured when present.
- If no statement match exists, the app may estimate FX from a public exchange-rate source and ask the user to confirm or correct the final USD amount and fees.
- Export should preserve original currency, original amount, final USD amount, FX rate source, and fee source.

## Missing Receipt Declarations

If an expense has no supporting receipt, V1 generates a declaration form using the expense data.

Declaration fields should include:

- Employee/traveler name when available.
- Report reference when available.
- Date.
- Expense description.
- Amount.
- Currency.
- Signature field and signing status.
- Statement that the expense was incurred and supporting documentation is unavailable.

The declaration becomes a Receipt Artifact and appears in the Export Package.

## Brand and Visual Design

### Palette

Use the supplied brand colors:

- Purple: `#460a78`
- Violet: `#be2878`
- Red: `#e63c41`
- Orange: `#f58746`
- Yellow: `#ffbe6e`
- Dark steel grey: `#414141`
- Hot orange: `#ff3700`
- Sky blue: `#0072ce`
- White: `#ffffff`

Gradient direction:

`#460a78 -> #be2878 -> #e63c41 -> #f58746 -> #ffbe6e`

Usage:

- Hot orange is the primary Capture action.
- Sky blue is used for sync, FX, and card-match utility states.
- Dark steel grey is used for primary text and device-frame contrast.
- White is the dominant surface color.
- The gradient is used as a brand accent, hero panel, and app-icon background.

### Typography

Use Gilroy for product UI. The user-provided reference is the GitHub gist at:

https://gist.github.com/mfd/09b70eb47474836f25a21660282ce0fd

The gist includes Gilroy font files in multiple weights. For production, the app should self-host approved/licensed font files instead of relying on a gist hotlink. Fallback stack:

`Gilroy, Aptos, Segoe UI, Arial, sans-serif`

### Icons

Use simple line icons with consistent stroke weight for:

- Camera capture
- PDF intake
- Email intake
- Statement/card import
- Inbox
- Reports
- Cards
- Export
- Missing receipt/declaration

The Capture icon appears as the raised center action in the bottom navigation.

### App Icon

The selected app icon direction is saved at:

`outputs/expense-me-app-icon-selected.png`

It uses:

- Rounded-square app icon shape.
- Brand gradient background.
- White receipt/document silhouette.
- Camera aperture signal.
- Downward/export arrow.
- Sky blue accent.

Implementation should create PWA icon assets from this direction:

- 192x192 icon.
- 512x512 icon.
- Maskable icon.
- Favicon.

## Storage and Sync

The product is local-first with optional encrypted sync/backup.

V1 implementation should support:

- Local data persistence for expenses, reports, artifacts, statements, and generated packages.
- Offline capture with later sync.
- Protected settings for secrets.
- Optional encrypted cloud backup/sync path.

No API tokens or sensitive keys may be embedded in client-side code or exported packages.

## Error Handling

### Capture/OCR Errors

- If OCR or parsing fails, create a Review item with the receipt attached.
- The user can manually fill the required fields.

### Email Sync Errors

- Show last successful sync time.
- Show a visible but calm retry banner.
- Keep existing imported messages untouched.
- Sync now should retry manually.

### Statement Import Errors

- Preserve the uploaded statement file.
- Show parsing errors with a suggested format if CSV/PDF cannot be read.
- Allow manual charge entry if needed.

### Reconciliation Ambiguity

- When multiple charges could match one expense, ask the user to choose.
- When one charge appears to match multiple expenses, flag as Duplicate or Split review.

### Export Errors

- Export must fail with a readiness checklist rather than generating an incomplete package silently.
- Generated artifacts should be individually visible so a failed declaration or missing receipt can be corrected.

## Testing Strategy

The implementation plan should include tests for:

- Expense creation from camera/upload/manual source.
- Email sync dedupe by AgentMail message ID.
- Attachment fingerprint dedupe.
- PDF/image artifact attachment.
- Statement import and unmatched charge detection.
- Statement match applying final USD amount/FX/fee.
- No-statement FX/manual confirmation path.
- Meal headcount requirement.
- Missing-receipt declaration generation.
- Export readiness checks.
- Export Package artifact creation.
- Mobile navigation shell and center Capture action.

## Open Implementation Decisions

These are implementation choices, not product-design blockers:

- Exact OCR/document extraction provider.
- Exact public FX-rate provider for no-statement estimates.
- Local database choice.
- Optional encrypted sync provider.
- Production licensing/source for Gilroy font files.
- Whether the first prototype exports ZIP directly or writes package files into a folder first.

## Approved Design Decisions

- V1 is a mobile-first PWA.
- The app is named Expense Me.
- The home screen is the Inbox.
- The core journey is Inbox -> Corporate Detail Review -> Export Package.
- The bottom navigation has five actions: Inbox, Reports, Capture, Cards, Export.
- Capture is the raised center action.
- Inbound email through `expense-me@agentmail.to` is in V1.
- Email sync is automatic while open, on launch, and after reconnecting, with Sync now fallback.
- V1 uses manual statement upload.
- Card statement final USD/FX/fee is source of truth when matched.
- If no statement match exists, user can confirm/correct estimated USD/FX/fees.
- Corporate detail fields match the company expense screen.
- Meals require number of people and allow optional names.
- Missing-receipt declarations are generated in V1.
- The final handoff feature is called Export Package.
- The selected app icon is `outputs/expense-me-app-icon-selected.png`.
