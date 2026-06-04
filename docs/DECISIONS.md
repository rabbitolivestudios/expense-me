# Expense Me Decisions

This file records product and technical decisions that should remain stable unless we intentionally revise them.

## Naming

- **App name**: Expense Me.
- **Business grouping name**: Expense Folder.
- **Output name**: Export Package.

Expense Folder is preferred because the grouping may be a trip, training, customer visit, month-end batch, or one-off business purpose. Export Package is reserved for the generated handoff bundle sent for entry into the company expense system.

## V1 Product Boundary

V1 is a mobile-first companion app that prepares clean handoff packages. It does not replace the company expense system yet.

V1 should:

- capture receipts by camera/image/PDF/manual entry;
- sync receipts from `expense-me@agentmail.to`;
- reconcile card statements to find missed charges, including CSV, QBO/OFX, and XLSX statement exports;
- mirror company-required fields and dropdowns;
- require missing-receipt declarations when evidence is absent;
- generate an Export Package with transaction details and PDF receipt/declaration evidence.

## Expense Folder Requirement

Every expense should belong to one Expense Folder. The folder assignment should become mandatory for new captured/imported expenses and required before export.

Expected UI:

- choose the Active Expense Folder from Inbox so new capture, email sync, and statement-created expenses land in the intended folder by default;
- assign from Inbox with a swipe-right action;
- assign or change from the Expense Detail screen with a dropdown;
- create a new Expense Folder when no suitable folder exists;
- generate each Export Package from one selected Expense Folder, independent of the current Active Expense Folder.

## Inbox Chronology

The Inbox keeps the current visible expense order and inserts compact week/year separators when adjacent visible expenses cross into a different week. These separators are scan aids only; they should not change filtering, expense ordering, assignment, or export behavior.

## Intake Intelligence

Current intake uses browser-local text extraction plus deterministic parsing and keyword categorization. Camera/image uploads run OCR in the browser with Tesseract.js. PDFs use embedded PDF text first and fall back to OCR for scanned pages.

AgentMail intake must parse full message detail (`text`, `html`, `extracted_text`, or `extracted_html`) rather than list summaries. When HTML is available, the receipt artifact stores that original HTML for export-time printing. Summary-only imports are allowed to be repaired only when the new parse is at least as confident and has concrete receipt fields, so a low-confidence reparse cannot overwrite existing financial data. Re-sync may still upgrade an older text-only email artifact to stored HTML without duplicating or changing the Expense. Export Package generation may fetch AgentMail detail on demand for older text-only email artifacts so they can still be printed from HTML when AgentMail still has the message. Uber receipt imports should keep merchant as `Uber` and, when the receipt includes pickup/dropoff places in the trip details block, use those places in the expense description.

When a receipt or card statement exposes a usable city/country, the app should prefill the editable Expense location fields. BofA statement exports sometimes put phone numbers in the merchant city column; those must not be treated as cities.

Target design:

- extract local text first from PDF/email/body;
- run OCR for camera images and scanned PDFs;
- use a low-cost server-side LLM call only when local extraction is incomplete or low-confidence;
- validate extracted categories against company dropdown options;
- keep low-confidence items in Review.

## Security And Privacy

- API keys stay in local `.env` or Vercel environment variables.
- Do not commit `.env`, Vercel local state, build output, screenshots, or generated export packages.
- OpenAI API usage, if added, should run server-side only so keys are never exposed in the browser.
- AgentMail route errors should return stable public messages only; raw upstream errors stay server-side.
- Current production AgentMail sync is intentionally single-user/prototype scope. It must move behind a real login-backed access boundary when shared cloud data replaces browser-local storage.
- Future shared-data infrastructure should use free-tier services where possible; Cloudflare Workers/Pages, D1, R2, KV, and Access are preferred candidates before adding paid services.
- V1.5 may expose only the AgentMail webhook path without a human Access JWT. That path must verify AgentMail/Svix webhook signatures with `AGENTMAIL_WEBHOOK_SECRET`, accept only `message.received` as a sync trigger, and keep manual `/api/email/sync` behind Cloudflare Access.

## V1.5 Shared Data Boundary

V1 stays live on Vercel at `https://expense-me-tbo.vercel.app` while V1.5 is built separately under the Cloudflare-managed `mac-tbo.com` domain. The planned V1.5 hostname is `https://expense.mac-tbo.com`.

V1.5 should use Cloudflare Access for the single-user login gate, Cloudflare D1 as the structured source of truth, and Cloudflare R2 for receipt/export artifacts. Browser storage should no longer be the durable source for Expenses, Expense Folders, statement charges, receipt artifacts, or Export Packages.

Cloud snapshots carry cloud-only row version metadata in `recordVersions`. Existing-record mutation requests must send the expected version from the last loaded snapshot so V1.5 does not silently overwrite fresher data from another browser/device. Internal server workflows such as first migration and trusted sync repairs may use explicit force writes after loading current cloud state.

AgentMail automatic intake should use the same idempotent server sync path as the Inbox button. The webhook only wakes the sync after a new received message; the app still fetches the full AgentMail message detail through the server-side API key before writing D1/R2 records.

## Export Package Evidence Format

The company expense report system requires attachable artifacts in PDF form. Export Packages may keep `entry-spreadsheet.csv` for entry data, but every supporting artifact intended for attachment must be a PDF:

- email receipts are printed into generated PDF copies; HTML email receipts should use a Chromium renderer such as self-hosted Gotenberg when configured so the PDF preserves the original email formatting;
- camera/image/scanned receipt artifacts are wrapped in generated PDFs;
- missing-receipt declarations are generated as PDFs;
- the readable expense index and reconciliation notes are generated as PDFs.

The export builder must fail closed when an Expense Folder references a missing expense or receipt artifact, rather than generating a package with dropped evidence.

Mobile export should prefer the browser file-share sheet for the generated zip when supported, so iPhone users can send the Export Package through Mail. The fallback is a direct zip download. Zip entries should stay simple and short, without standalone folder entries, to keep iOS extraction reliable.

For V1.5, the production HTML email renderer is a self-hosted Gotenberg container running on the Mac and exposed as `gotenberg.mac-tbo.com` through Cloudflare Tunnel. The hostname must stay protected by Cloudflare Access Service Auth; Expense Me calls it with `CF-Access-Client-Id` and `CF-Access-Client-Secret` stored as Cloudflare Pages secrets.

## Review Gate

Code changes should include app documentation updates when behavior changes. Run Clawpatch (`map`, `review`, `report`) before final commit/deploy and triage findings against V1 scope.

## Deployment

V1 production URL: `https://expense-me-tbo.vercel.app`

V1.5 production URL: `https://expense.mac-tbo.com`

GitHub repository: `rabbitolivestudios/expense-me`
