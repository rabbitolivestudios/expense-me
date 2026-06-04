# Expense Me

Mobile-first expense intake and export app for work expenses.

Expense Me helps capture receipts from camera uploads, PDFs/images, email intake, manual entries, and card statements. It keeps company-required expense fields aligned with the current expense-reporting workflow, reconciles card charges, and generates an export package with transaction details and supporting evidence.

## Live App

https://expense-me-tbo.vercel.app

## Product Shape

Expense Me is designed around three layers:

- **Expense**: one receipt, card charge, or manual item.
- **Expense Folder**: the required business grouping for related expenses, such as a trip, training, customer visit, or monthly batch.
- **Export Package**: the generated handoff file for one Expense Folder, including the entry spreadsheet plus PDF review notes, PDF receipt copies, and PDF missing-receipt declarations.

The current app has the first V1 implementation of expenses, card reconciliation, Expense Folders, browser-local receipt OCR/PDF extraction, and export packages.

## Current Capabilities

- Mobile-first inbox, capture, cards, reports, and export screens, with week/year separators for the visible expense list
- Active Expense Folder selector on Inbox for the default capture/email/statement assignment, plus an Export Package folder selector for choosing what to export
- Camera/image/PDF/manual intake with browser-local OCR and PDF text extraction
- AgentMail inbox sync for `expense-me@agentmail.to`, including full message detail parsing, Uber pickup/dropoff descriptions, stored HTML email receipts, and repair of older summary-only imports
- V1.5 AgentMail webhook intake for automatic received-message sync after Cloudflare deployment
- AgentMail sync recovers partial prior imports where an email artifact was written before its matching Expense
- Company-style expense type, sub-expense type, region, and country fields
- Meal attendee count support
- Card statement import and matching for CSV, QBO/OFX, and XLSX exports, including statement-provided merchant city/country when available
- Swipe-left and detail-screen expense deletion with confirmation
- Export package generation with the entry spreadsheet plus PDF receipt copies, PDF declarations, PDF reconciliation notes, and a PDF expense index. When `GOTENBERG_URL` is configured, HTML email receipts are printed through Chromium so the exported receipt PDF preserves the original email formatting. V1.5 can either save the ZIP to the device or email it through AgentMail to the configured work address.

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

On the Inbox screen, tap the `expense-me@agentmail.to` sync strip or the refresh icon in the header. The address is displayed as plain app text; it should not open a mail compose sheet. New synced email expenses are assigned to the selected Active Expense Folder.

## Local Persistence

V1 stores app state in browser localStorage under `expense-me-v1-live-state`. If a malformed saved payload is recovered by later user changes, the original raw payload is first copied to `expense-me-v1-live-state:recovery`.

V1.5 stores durable app state through the Cloudflare API/D1/R2 source of truth. Browser localStorage is limited to transient UI preferences such as theme, the active Expense Folder selector, and the V1 migration marker.

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

## V1.5 Cloudflare Setup

V1 remains live on Vercel at `expense-me-tbo.vercel.app` as the fallback production app. V1.5 runs separately at `expense.mac-tbo.com` behind Cloudflare Access, with shared app data stored in Cloudflare D1 and binary artifacts stored in Cloudflare R2.

### V1.5 Operational Notes

- 2026-06-03 mobile hotfix: the browser client calls `globalThis.fetch` through a wrapper for the default CloudRepository fetcher. This prevents iOS Safari/Chrome from invoking `fetch` with the repository instance as `this`, which surfaced as `Can only call Window.fetch on instances of Window` and also caused Inbox email sync to fail from the phone.
- Cloudflare Access is fail-closed for V1.5 single-user mode: `ACCESS_ALLOWED_EMAIL` must be configured, or verified Access users are rejected instead of sharing the single workspace.
- If a phone still shows that old fetch error after deployment, close/reopen the tab or hard-refresh the PWA so the service worker picks up the current bundle.
- iOS Home Screen icons use the root `apple-touch-icon*.png` files and public Pages-hosted `apple-touch-icon` links. Keep those icon links off the Access-protected `expense.mac-tbo.com` host so iOS can fetch the icon while creating the Home Screen web clip.
- Cloud Export Package downloads fetch the zip bytes and save a Blob named after the selected Expense Folder. The PWA service worker must denylist `/api/*` navigations so API download routes cannot be served as cached app-shell HTML.
- iPhone export should use the browser file-share sheet when available so the generated zip can be sent to Mail or saved elsewhere. Download remains the fallback for browsers without file sharing. V1.5 also supports server-side Export Package email delivery: `POST /api/export-packages/email` creates the ZIP, attaches it to an AgentMail outbound message, and sends it to `EXPORT_PACKAGE_EMAIL_TO`.
- Export Package zip entries use short receipt filenames and omit standalone folder entries for better iOS extraction compatibility.
- Email receipt artifacts store the original AgentMail HTML when available. Re-syncing AgentMail upgrades older text-only email artifacts to HTML without duplicating the Expense, and Export Package generation can also fetch AgentMail detail on demand for older text-only email artifacts before printing them. Configure `GOTENBERG_URL` to print those HTML receipts into browser-rendered PDFs during Export Package generation.
- If AgentMail sync is interrupted after storing an email artifact but before creating the matching Expense, the next sync updates that existing artifact by version and creates the missing Expense instead of returning a stale-record 502.

Required Wrangler setup commands:

```bash
npx wrangler login
npx wrangler d1 create expense-me-v15
npx wrangler r2 bucket create expense-me-v15-artifacts
npx wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name expense-me-v15
npx wrangler pages secret put ACCESS_AUD --project-name expense-me-v15
npx wrangler pages secret put ACCESS_ALLOWED_EMAIL --project-name expense-me-v15
npx wrangler pages secret put AGENTMAIL_API_KEY --project-name expense-me-v15
npx wrangler pages secret put AGENTMAIL_INBOX_ID --project-name expense-me-v15
npx wrangler pages secret put AGENTMAIL_WEBHOOK_SECRET --project-name expense-me-v15
npx wrangler pages secret put EXPORT_PACKAGE_EMAIL_TO --project-name expense-me-v15
npx wrangler pages secret put GOTENBERG_URL --project-name expense-me-v15
```

For branch deployments such as `v15-single-source`, mirror runtime secrets that affect live behavior into the Pages preview environment as well:

```bash
npx wrangler pages secret put EXPORT_PACKAGE_EMAIL_TO --project-name expense-me-v15 --env preview
```

Optional Gotenberg protection secrets:

```bash
npx wrangler pages secret put GOTENBERG_BEARER_TOKEN --project-name expense-me-v15
npx wrangler pages secret put GOTENBERG_ACCESS_CLIENT_ID --project-name expense-me-v15
npx wrangler pages secret put GOTENBERG_ACCESS_CLIENT_SECRET --project-name expense-me-v15
```

`GOTENBERG_URL` should point to a self-hosted Gotenberg service, for example a Docker container on the Mac exposed through a Cloudflare Tunnel. The current V1.5 renderer is `gotenberg.mac-tbo.com`, protected by Cloudflare Access Service Auth. Expense Me posts `index.html` to `/forms/chromium/convert/html` and expects a PDF response. Set `GOTENBERG_ACCESS_CLIENT_ID` and `GOTENBERG_ACCESS_CLIENT_SECRET` Pages secrets when the renderer is behind Access; do not leave the renderer public.

Current Mac renderer runtime:

```bash
colima status
colima start
docker start expense-me-gotenberg
```

The Colima LaunchAgent is loaded through `brew services start colima` so Colima starts at login. The container is bound to `127.0.0.1:3000` and is exposed only through the Cloudflare Tunnel ingress for `gotenberg.mac-tbo.com`.

After creating the D1 database, add the real `EXPENSE_ME_DB` binding and `EXPENSE_ME_ARTIFACTS` bucket binding to `wrangler.toml`, then apply migrations with `npm run cf:d1:migrations` and `npm run cf:d1:migrations:remote`.

AgentMail automatic sync uses `POST /api/agentmail/webhook`. In the AgentMail dashboard, create a webhook endpoint only after the Cloudflare Pages deploy exists, subscribe to `message.received`, and copy the endpoint signing secret into `AGENTMAIL_WEBHOOK_SECRET`. If the endpoint uses `expense.mac-tbo.com`, configure Cloudflare Access to bypass only `/api/agentmail/webhook`; all human app/API routes remain Access-protected. Until that bypass exists, the same function can receive signed webhooks at the Pages default domain.

Do not commit secret values, Cloudflare Access JWT audience values, AgentMail credentials, `.env` files, or local Wrangler state.
