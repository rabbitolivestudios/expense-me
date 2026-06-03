# Expense Me V1.5 Single-Source Design

## Status

Planning spec. Do not implement until Thiago approves the written spec and implementation plan.

## Decision

V1 remains live and working on Vercel at:

`https://expense-me-tbo.vercel.app`

V1.5 adds a separate Cloudflare-hosted shared-data version under Thiago's Cloudflare-managed `mac-tbo.com` domain. The working hostname is:

`https://expense.mac-tbo.com`

The exact hostname can change before implementation, but V1.5 must not break, overwrite, or replace the Vercel V1 app until the shared-data version is verified.

## Goal

Create one authoritative app data source so every signed-in instance of Expense Me sees the same Expenses, Expense Folders, statement charges, receipt artifacts, and Export Package state.

## Non-Goals

- Do not replace the company expense system.
- Do not add paid services.
- Do not add team collaboration workflows yet.
- Do not build a full offline conflict-resolution system in V1.5.
- Do not change product terminology: Expense, Expense Folder, Export Package.
- Do not migrate the Vercel V1 production URL until V1.5 is separately verified.

## Current State

The production V1 app persists durable state in browser storage:

- `src/App.tsx` reads and writes `expense-me-v1-live-state` from `window.localStorage`.
- `expenses`, `receiptArtifacts`, `reports`, and `statementCharges` are held in React state.
- AgentMail sync calls the Vercel API and then writes imported Expenses into the local browser state.
- Dexie/IndexedDB scaffolding exists in `src/storage/db.ts` and `src/storage/repository.ts`, but it is not the current authority.

That means the iPhone, Mac, and any other browser can diverge.

## Recommended Architecture

Use Cloudflare as the shared-data boundary for V1.5:

- Cloudflare Access protects the V1.5 app and API on `expense.mac-tbo.com`.
- Cloudflare Pages or Workers static assets host the React/Vite frontend.
- Cloudflare Worker or Pages Functions expose the app API.
- Cloudflare D1 stores structured app records.
- Cloudflare R2 stores binary receipt artifacts, email body artifacts, generated receipt bundles, and generated Export Package files.
- Browser storage is retained only for theme preference, transient UI state, and optional cache metadata.

Vercel remains the V1 deployment during V1.5 buildout.

## Authentication

V1.5 is single-user first.

Access policy:

- Allow Thiago's email identity.
- Block all other identities.
- Protect both the app and `/api/*`.

The API must validate Cloudflare Access identity on every non-public request and derive the active user/workspace from that identity. It must not trust a client-provided user ID or workspace ID.

Future team deployment is supported by adding more rows to `workspace_members`; it does not require changing core Expense records.

## Data Model

D1 is the source of truth.

Tables:

- `users`: one row per authenticated identity.
- `workspaces`: one row for the personal Expense Me workspace in V1.5.
- `workspace_members`: user-to-workspace membership and role.
- `expenses`: structured Expense records.
- `expense_folders`: current `Report` concept renamed at the storage/API boundary to match product language.
- `receipt_artifacts`: metadata for receipts, declarations, email bodies, and uploaded files.
- `statement_charges`: imported card statement charges and match status.
- `export_packages`: generated package metadata and R2 object keys.
- `sync_runs`: AgentMail sync attempts, counts, and errors.
- `audit_events`: create/update/delete/export events for traceability.

Every mutable business record must include:

- `id`
- `workspace_id`
- `created_at`
- `updated_at`
- `version`

The `version` field supports optimistic updates. V1.5 can use "server wins, client refreshes" conflict handling, but failed updates must be visible to the user instead of silently overwriting.

## Artifact Storage

R2 stores file-like data:

- uploaded receipt images;
- PDF receipts;
- email body text or HTML snapshots when needed for evidence;
- missing-receipt declaration PDFs;
- generated Export Package files.

D1 stores metadata and R2 object keys only. R2 objects are private. Downloads go through the API or short-lived signed URLs.

## API Surface

Expected API endpoints:

- `GET /api/bootstrap`
  - returns the authenticated user's active workspace snapshot.
- `POST /api/migrate-local-snapshot`
  - imports a browser-local V1 snapshot once.
- `POST /api/expenses`
- `PATCH /api/expenses/:expenseId`
- `DELETE /api/expenses/:expenseId`
- `POST /api/expense-folders`
- `PATCH /api/expense-folders/:expenseFolderId`
- `DELETE /api/expense-folders/:expenseFolderId`
- `POST /api/receipts/upload`
- `POST /api/statements/import`
- `POST /api/email/sync`
- `POST /api/export-packages`
- `GET /api/export-packages/:exportPackageId/download`

The frontend should call these endpoints through a small repository layer rather than mutating React state directly throughout `App.tsx`.

## Migration

V1.5 must not auto-delete local data.

First authenticated launch behavior:

1. Load cloud snapshot from `/api/bootstrap`.
2. Check for `expense-me-v1-live-state` in localStorage.
3. If cloud has no imported data and localStorage contains V1 data, show a one-time import action.
4. On import, post the local snapshot to `/api/migrate-local-snapshot`.
5. The API validates and writes data to D1/R2.
6. The app reloads from cloud data.
7. The app records local migration metadata so the import prompt does not repeat.

If both cloud data and local V1 data exist, the app must not merge automatically. It should tell the user cloud data is active and keep V1 local data untouched.

## AgentMail Sync

AgentMail credentials stay server-side.

V1.5 sync flow:

1. User taps the existing Inbox sync control.
2. Frontend calls `POST /api/email/sync`.
3. Worker fetches AgentMail messages with server-side credentials.
4. Existing deterministic parsing logic is reused where possible.
5. New or repaired Expenses are written to D1.
6. Receipt/email artifacts are written to R2 when needed.
7. A `sync_runs` row records attempted count, imported count, repaired count, skipped count, and error message if any.
8. Frontend reloads the shared snapshot.

The current V1 Vercel AgentMail route may remain in place for V1 while V1.5 is built, but V1.5 must not expose unauthenticated AgentMail API routes.

## Frontend State

The React app should keep the existing screens and product behavior, but data ownership changes:

- Initial data loads from `/api/bootstrap`.
- Mutations call repository functions that persist to the API first.
- Successful mutations update local React state from the API response.
- Failed mutations show user-visible errors.
- `localStorage` is no longer a durable source for Expenses, Expense Folders, artifacts, reports, or statement charges.

Keep local state for:

- selected screen;
- selected Expense;
- theme;
- pending form fields;
- transient sync/loading/error states.

## Deployment Strategy

Keep two live environments:

- V1: `https://expense-me-tbo.vercel.app`
- V1.5: `https://expense.mac-tbo.com`

Implementation must avoid changing the Vercel deployment until V1.5 is accepted.

Recommended rollout:

1. Create Cloudflare app/API scaffold while Vercel remains unchanged.
2. Add D1 migrations and R2 bucket bindings.
3. Protect `expense.mac-tbo.com` with Cloudflare Access.
4. Deploy V1.5 preview.
5. Import V1 local data from the iPhone/Mac once.
6. Verify iPhone and Mac see the same data.
7. Keep Vercel as fallback until V1.5 is stable.

## Testing

Unit tests:

- API identity extraction rejects unauthenticated requests.
- D1 repository maps Expense, Expense Folder, receipt artifact, statement charge, and Export Package rows correctly.
- Migration validates malformed snapshots and preserves product terminology.
- AgentMail sync writes new Expenses idempotently.
- Optimistic update rejects stale versions.

Integration tests:

- bootstrap returns a full workspace snapshot.
- create/edit/delete Expense persists through reload.
- Expense Folder create/assign persists through reload.
- statement import persists and reconciliation survives reload.
- Export Package generation reads cloud data and stores output metadata.

Browser verification:

- iPhone-sized viewport on `expense.mac-tbo.com`.
- Cloudflare Access login gate.
- Inbox, Detail, Cards, Reports, Export, and Capture render.
- Email sync from one device appears on another after refresh.
- Vercel V1 URL still loads independently.

Review gate:

- `npm test`
- `npm run build`
- Clawpatch `map`, `review`, and `report`
- no secrets in git diff

## Acceptance Criteria

- V1 remains available at `https://expense-me-tbo.vercel.app`.
- V1.5 is available behind Cloudflare Access at `https://expense.mac-tbo.com`.
- Only the allowed user can access V1.5 app/API.
- V1.5 uses D1/R2 as the durable source of truth.
- iPhone and Mac show the same shared data after refresh.
- Email sync writes into the shared cloud dataset.
- Existing Expense, Expense Folder, Export Package terminology is preserved.
- Existing V1 flows still work in V1.5: capture, assign, rename, delete, declare, reconcile, export.
- Docs reflect the new architecture and deployment split.
- Tests, build, Clawpatch, and deployed browser checks pass before calling V1.5 complete.

## Open Implementation Assumptions

- `expense.mac-tbo.com` is the chosen V1.5 hostname.
- `mac-tbo.com` is already managed by Cloudflare.
- The current GitHub repo remains `rabbitolivestudios/expense-me`.
- The Cloudflare free tier is the cost boundary unless Thiago explicitly approves a paid change.
