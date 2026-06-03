# Expense Me Decisions

This file records product and technical decisions that should remain stable unless we intentionally revise them.

## Naming

- **App name**: Expense Me.
- **Business grouping name**: Expense Folder.
- **Output name**: Export Package.

Expense Folder is preferred over Project because the grouping may be a trip, training, customer visit, month-end batch, or one-off business purpose. Export Package is reserved for the generated handoff bundle sent for entry into the company expense system.

## V1 Product Boundary

V1 is a mobile-first companion app that prepares clean handoff packages. It does not replace the company expense system yet.

V1 should:

- capture receipts by camera/image/PDF/manual entry;
- sync receipts from `expense-me@agentmail.to`;
- reconcile card statements to find missed charges;
- mirror company-required fields and dropdowns;
- require missing-receipt declarations when evidence is absent;
- generate an Export Package with transaction details and receipt/declaration evidence.

## Expense Folder Requirement

Every expense should belong to one Expense Folder. The folder assignment should become mandatory for new captured/imported expenses and required before export.

Expected UI:

- assign from Inbox with a swipe-right action;
- assign or change from the Expense Detail screen with a dropdown;
- create a new Expense Folder when no suitable folder exists;
- generate each Export Package from one selected Expense Folder.

## Intake Intelligence

Current intake uses browser-local text extraction plus deterministic parsing and keyword categorization. Camera/image uploads run OCR in the browser with Tesseract.js. PDFs use embedded PDF text first and fall back to OCR for scanned pages.

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

## Deployment

Production URL: `https://expense-me-tbo.vercel.app`

GitHub repository: `rabbitolivestudios/expense-me`
