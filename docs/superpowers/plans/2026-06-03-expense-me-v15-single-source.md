# Expense Me V1.5 Single-Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Expense Me V1.5 as a Cloudflare-hosted, login-gated, single-source app at `expense.mac-tbo.com` while leaving the Vercel V1 app at `expense-me-tbo.vercel.app` working as fallback.

**Architecture:** Keep the existing React/Vite UI and product flows, but move durable app data behind Cloudflare Access, Cloudflare Pages Functions, D1, and R2. The browser loads a cloud snapshot, sends mutations through API repository functions, stores only transient UI state locally, and migrates the old V1 localStorage snapshot only after explicit user action.

**Concurrency Contract:** Cloud snapshots include cloud-only `recordVersions` maps keyed by entity id. Existing-record mutation requests must send the expected version from the last loaded snapshot; D1 writes reject stale versions with `VersionConflictError`. This metadata must not be added to the domain `Expense`, `Report`, `ReceiptArtifact`, or `StatementCharge` types.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Cloudflare Pages Functions, Cloudflare Access, D1, R2, Wrangler, jose, JSZip, pdf-lib.

---

## Constraints

- Keep V1 on Vercel available and untouched during V1.5 buildout.
- Work on a `v15-single-source` branch for implementation.
- Do not push runtime changes to `main` until V1.5 is accepted.
- Use free-tier Cloudflare services unless Thiago explicitly approves otherwise.
- Keep product terms: Expense, Expense Folder, Export Package.
- Do not commit credentials, `.env`, generated export packages, screenshots, Wrangler local state, or Cloudflare secrets.
- Run Clawpatch `map`, `review`, and `report` before any implementation commit intended for review or deployment.

## Continuation Status - 2026-06-03

Tasks 1 through 6 have already been implemented and committed on `v15-single-source`:

- `a445d72 chore: scaffold cloudflare v1.5`
- `f3b4c81 feat: add cloudflare access auth`
- `52d26fd refactor: extract cloud snapshot helpers`
- `eaefc7e feat: add cloud data repository`
- `85e46d6 feat: add cloud api entrypoint`
- `8ac0a69 feat: add v1 local snapshot migration`

The branch forked from V1 at `da1ad27`. Production V1 hotfix commit `b6be02e fix: add active expense folder controls` is now on `origin/main` and must be merged into `v15-single-source` before Task 7 so V1.5 does not regress:

- Inbox Active Expense Folder selector and persistence;
- Export Package folder selector behavior;
- localStorage malformed-state recovery used by V1 fallback behavior;
- inbox UI fixes and expanded tests.

Continuation update:

- Task 6A is complete: `origin/main` V1 hotfix commit `b6be02e` was merged into `v15-single-source` and verified.
- Task 7 is complete: `src/client/cloudRepository.ts` and client wrapper tests were added in `c8a3027 feat: add cloud client repository`.
- Task 8 frontend cloud-state wiring is implemented in the working tree: `App` now loads through `useExpenseMeCloudState`, mutations call `CloudRepository`, V1 migration is explicit, active Expense Folder remains a transient local preference, email sync calls `POST /api/email/sync`, and Export Package generation calls the cloud export route.
- Task 9 backend/API work is implemented for Expenses with artifacts, Expense Folder routes, receipt upload, and statement import with reconciliation.
- Task 10 backend/API work is implemented for server-side AgentMail sync through `POST /api/email/sync`, including server-side credentials, idempotent imports, R2-backed email body artifacts, and `sync_runs`.
- Task 10A is complete: signed AgentMail webhook intake through `POST /api/agentmail/webhook` triggers the same idempotent cloud sync without exposing the human Access-protected API.
- Task 11 backend route support is implemented for frontend use: `POST /api/export-packages` creates a cloud Export Package and returns `{ exportPackage, downloadUrl }`, and the authenticated download route returns the R2 ZIP.
- V1 production hotfix `6f39eb6 fix: sync declaration folder membership` is live on `origin/main`; the same declaration membership behavior is carried into the V1.5 `App` changes in the current working tree.
- Export Package evidence has been tightened for company attachment requirements: `entry-spreadsheet.csv` remains the data entry sheet, but receipts, declarations, the readable expense index, and reconciliation notes are generated as PDFs, and package builds fail closed on missing expense or receipt artifact references.

## Target Files

Create:

- `wrangler.toml`
- `migrations/0001_v15_initial.sql`
- `functions/api/[[route]].ts`
- `src/cloudflare/accessAuth.ts`
- `src/cloudflare/apiRouter.ts`
- `src/cloudflare/appSnapshot.ts`
- `src/cloudflare/artifactStore.ts`
- `src/cloudflare/d1Repository.ts`
- `src/cloudflare/http.ts`
- `src/cloudflare/schema.ts`
- `src/cloudflare/serverAgentMail.ts`
- `src/cloudflare/types.ts`
- `src/client/cloudRepository.ts`
- `src/client/localSnapshot.ts`
- `src/app/appState.ts`
- `src/app/useExpenseMeCloudState.ts`
- `tests/unit/cloudAccessAuth.test.ts`
- `tests/unit/cloudApi.test.ts`
- `tests/unit/cloudMigration.test.ts`
- `tests/unit/cloudRecords.test.ts`
- `tests/unit/cloudRepository.test.ts`
- `tests/unit/localSnapshot.test.ts`
- `tests/unit/useExpenseMeCloudState.test.tsx`

Modify:

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `src/App.tsx`
- `src/features/export/ExportScreen.tsx`
- `src/features/export/exportPackage.ts`
- `src/features/inbox/InboxScreen.tsx` only if extra cloud sync state copy is required
- `src/domain/types.ts`
- `src/test/setup.ts`
- `tests/unit/shell.test.tsx`
- `tests/unit/exportPackage.test.ts`
- `tests/unit/agentMailSync.test.ts`
- `README.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`

Keep:

- `api/*`, `server/*`, and `serverless/*` for Vercel V1 during this phase.
- `vercel.json` unchanged unless a verification step proves docs-only metadata is needed.

## Task 1: Branch, Dependencies, And Cloudflare Scaffold

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `wrangler.toml`
- Create: `migrations/0001_v15_initial.sql`
- Modify: `README.md`

- [ ] **Step 1: Create the implementation branch**

Run:

```bash
git checkout -b v15-single-source
```

Expected: new branch `v15-single-source`.

- [ ] **Step 2: Install Cloudflare/runtime dependencies**

Run:

```bash
npm install jose
npm install -D wrangler @cloudflare/workers-types
```

Expected: `package.json` and `package-lock.json` include `jose`, `wrangler`, and `@cloudflare/workers-types`.

- [ ] **Step 3: Add scripts to `package.json`**

Add these scripts without removing existing Vercel/Vite scripts:

```json
{
  "cf:build": "npm run build",
  "cf:dev": "npm run build && wrangler pages dev dist",
  "cf:d1:migrations": "node -e \"const fs=require('fs'); const config=fs.readFileSync('wrangler.toml','utf8'); if (!config.includes('[[d1_databases]]')) { console.error('Create the D1 database and add the EXPENSE_ME_DB binding to wrangler.toml before applying migrations.'); process.exit(1); }\" && wrangler d1 migrations apply EXPENSE_ME_DB --local",
  "cf:d1:migrations:remote": "wrangler d1 migrations apply EXPENSE_ME_DB --remote",
  "cf:deploy": "npm run build && wrangler pages deploy dist --branch v15-single-source --project-name expense-me-v15"
}
```

Expected: existing `dev`, `build`, `test`, `preview`, and Vercel behavior are preserved.

- [ ] **Step 4: Create `wrangler.toml`**

Use this committed starter file. Cloudflare-generated binding IDs and Access values are added after resource setup.

```toml
name = "expense-me-v15"
compatibility_date = "2026-06-03"
pages_build_output_dir = "dist"

[vars]
ENVIRONMENT = "production"
APP_ORIGIN = "https://expense.mac-tbo.com"
```

Do not commit Access JWT audience values or AgentMail credentials.

- [ ] **Step 5: Create the initial migration file**

Create `migrations/0001_v15_initial.sql` with this schema:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expense_folders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  expense_folder_id TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  expense_date TEXT NOT NULL,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expenses_workspace_date ON expenses (workspace_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_folder ON expenses (workspace_id, expense_folder_id);

CREATE TABLE IF NOT EXISTS receipt_artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  source_message_id TEXT,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_receipt_artifacts_source_message ON receipt_artifacts (workspace_id, source_message_id);

CREATE TABLE IF NOT EXISTS statement_charges (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  statement_import_id TEXT NOT NULL,
  match_status TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_statement_charges_workspace_date ON statement_charges (workspace_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_statement_charges_match_status ON statement_charges (workspace_id, match_status);

CREATE TABLE IF NOT EXISTS export_packages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  expense_folder_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  object_key TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source TEXT NOT NULL,
  attempted_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  repaired_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

- [ ] **Step 6: Document Cloudflare setup in `README.md`**

Add a V1.5 section with:

```markdown
## V1.5 Cloudflare Setup

V1 remains on Vercel at `https://expense-me-tbo.vercel.app`.

V1.5 runs at `https://expense.mac-tbo.com` behind Cloudflare Access and uses Cloudflare D1/R2 for shared data.

Required setup:

```bash
npx wrangler login
npx wrangler d1 create expense-me-v15
npx wrangler r2 bucket create expense-me-v15-artifacts
npx wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name expense-me-v15
npx wrangler pages secret put ACCESS_AUD --project-name expense-me-v15
npx wrangler pages secret put ACCESS_ALLOWED_EMAIL --project-name expense-me-v15
npx wrangler pages secret put AGENTMAIL_API_KEY --project-name expense-me-v15
npx wrangler pages secret put AGENTMAIL_INBOX_ID --project-name expense-me-v15
```

After creating the D1 database, add the real `EXPENSE_ME_DB` binding and `EXPENSE_ME_ARTIFACTS` bucket binding to `wrangler.toml`, then apply migrations with `npm run cf:d1:migrations` and `npm run cf:d1:migrations:remote`.

Do not commit secret values or local Wrangler state.
```

- [ ] **Step 7: Verify scaffold**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: tests and build pass; no whitespace errors.

- [ ] **Step 8: Commit**

Run:

```bash
git add package.json package-lock.json wrangler.toml migrations/0001_v15_initial.sql README.md
git commit -m "chore: scaffold cloudflare v1.5"
```

## Task 2: Shared Snapshot And Record Codecs

**Files:**
- Create: `src/cloudflare/types.ts`
- Create: `src/cloudflare/schema.ts`
- Create: `src/cloudflare/appSnapshot.ts`
- Create: `src/app/appState.ts`
- Modify: `src/App.tsx`
- Test: `tests/unit/cloudRecords.test.ts`

- [ ] **Step 1: Extract app-state helpers**

Move the pure helpers currently embedded in `src/App.tsx` into `src/app/appState.ts`:

```ts
import { buildExpenseFolderDateRangeLabel, expenseFolderDateRangeLabel } from "../domain/reportDates";
import type { Expense, Report } from "../domain/types";

export const defaultFolderId = "report-current";

export interface ExpenseFolderDates {
  startDate?: string;
  endDate?: string;
}

export function cloneReports(reports: Report[]) {
  return reports.map((report) => ({ ...report, expenseIds: [...report.expenseIds] }));
}

export function createDefaultReport(expenseIds: string[] = []): Report {
  return {
    id: defaultFolderId,
    name: "Current Expense Folder",
    dateRangeLabel: expenseIds.length > 0 ? "Ready for export package" : "Add expenses to this folder",
    expenseIds,
    status: "Draft",
    createdAt: new Date().toISOString()
  };
}

export function reportForExpense(expense: Expense, reports: Report[]) {
  return reports.find((report) => report.expenseIds.includes(expense.id));
}

export function normalizeExpensesWithReports(expenses: Expense[], reports: Report[]) {
  return expenses.map((expense) => {
    if (expense.reportId && reports.some((report) => report.id === expense.reportId)) return expense;
    const existingReport = reportForExpense(expense, reports);
    if (existingReport) return { ...expense, reportId: existingReport.id };
    return reports.length === 1 ? { ...expense, reportId: reports[0].id } : expense;
  });
}

export function syncReportsWithExpenses(reports: Report[], expenses: Expense[]) {
  return reports.map((report) => {
    const expenseIds = expenses.filter((expense) => expense.reportId === report.id).map((expense) => expense.id);
    return {
      ...report,
      expenseIds,
      dateRangeLabel: expenseIds.length > 0 || report.startDate || report.endDate ? expenseFolderDateRangeLabel(report) : "Add expenses to this folder"
    };
  });
}

export function safeId(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 64) || `${Date.now()}`;
}

export function createExpenseFolderRecord(name: string, dates: ExpenseFolderDates = {}, now = new Date()) {
  const trimmedName = name.trim();
  if (!trimmedName) return undefined;
  const startDate = dates.startDate || undefined;
  const endDate = dates.endDate || startDate;

  return {
    id: `report-${safeId(trimmedName)}-${now.getTime()}`,
    name: trimmedName,
    startDate,
    endDate,
    dateRangeLabel: buildExpenseFolderDateRangeLabel(startDate, endDate),
    expenseIds: [],
    status: "Draft" as const,
    createdAt: now.toISOString()
  };
}
```

Update `src/App.tsx` imports and remove duplicate local definitions.

- [ ] **Step 2: Create cloud shared types**

Create `src/cloudflare/types.ts`:

```ts
import type { AppSnapshot, ExportPackage } from "../domain/types";

export interface CloudflareEnv {
  EXPENSE_ME_DB: D1Database;
  EXPENSE_ME_ARTIFACTS: R2Bucket;
  ENVIRONMENT?: string;
  APP_ORIGIN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_ALLOWED_EMAIL?: string;
  AGENTMAIL_API_KEY?: string;
  AGENTMAIL_INBOX_ID?: string;
  AGENTMAIL_BASE_URL?: string;
}

export interface AccessUser {
  id: string;
  email: string;
  name?: string;
}

export interface WorkspaceContext {
  user: AccessUser;
  workspaceId: string;
}

export interface CloudRecordVersions {
  expenses: Record<string, number>;
  reports: Record<string, number>;
  receiptArtifacts: Record<string, number>;
  statementCharges: Record<string, number>;
  exportPackages: Record<string, number>;
}

export interface CloudSnapshot extends AppSnapshot {
  exportPackages: ExportPackage[];
  recordVersions: CloudRecordVersions;
  workspaceId: string;
  userEmail: string;
}

export interface ApiErrorBody {
  error: string;
}

export interface ApiSnapshotBody {
  snapshot: CloudSnapshot;
}
```

- [ ] **Step 3: Create schema helpers**

Create `src/cloudflare/schema.ts`:

```ts
import type { Expense, ExportPackage, ReceiptArtifact, Report, StatementCharge } from "../domain/types";

export interface Versioned<T> {
  value: T;
  version: number;
  updatedAt: string;
}

export type StoredEntity = Expense | Report | ReceiptArtifact | StatementCharge | ExportPackage;

export function stripArtifactDataUrl(artifact: ReceiptArtifact): ReceiptArtifact {
  const { dataUrl: _dataUrl, ...metadata } = artifact;
  return metadata;
}

export function encodePayload(value: StoredEntity) {
  return JSON.stringify(value);
}

export function decodePayload<T extends StoredEntity>(payload: string): T {
  return JSON.parse(payload) as T;
}

export function nextVersion(version: number | undefined) {
  return (version ?? 0) + 1;
}
```

- [ ] **Step 4: Create snapshot normalization**

Create `src/cloudflare/appSnapshot.ts`:

```ts
import type { AppSnapshot, ExportPackage } from "../domain/types";
import { cloneReports, createDefaultReport, normalizeExpensesWithReports, syncReportsWithExpenses } from "../app/appState";
import type { CloudSnapshot } from "./types";

export function normalizeCloudSnapshot(input: Partial<AppSnapshot> & { exportPackages?: ExportPackage[]; workspaceId: string; userEmail: string }): CloudSnapshot {
  const reports = input.reports?.length ? cloneReports(input.reports) : [createDefaultReport()];
  const expenses = normalizeExpensesWithReports(input.expenses ?? [], reports);

  return {
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    expenses,
    receiptArtifacts: input.receiptArtifacts ?? [],
    reports: syncReportsWithExpenses(reports, expenses),
    statementCharges: input.statementCharges ?? [],
    exportPackages: input.exportPackages ?? []
  };
}
```

- [ ] **Step 5: Add codec tests**

Create `tests/unit/cloudRecords.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ReceiptArtifact } from "../../src/domain/types";
import { decodePayload, encodePayload, nextVersion, stripArtifactDataUrl } from "../../src/cloudflare/schema";
import { normalizeCloudSnapshot } from "../../src/cloudflare/appSnapshot";

describe("cloud record codecs", () => {
  it("strips receipt binary data before D1 metadata storage", () => {
    const artifact: ReceiptArtifact = {
      id: "artifact-1",
      artifactType: "UploadedImage",
      mimeType: "image/png",
      storageKey: "local/artifact-1/receipt.png",
      createdAt: "2026-06-03T12:00:00.000Z",
      dataUrl: "data:image/png;base64,abc"
    };

    expect(stripArtifactDataUrl(artifact)).not.toHaveProperty("dataUrl");
  });

  it("round-trips JSON payloads", () => {
    const payload = { id: "report-current", name: "Current Expense Folder", expenseIds: [], dateRangeLabel: "Add expenses to this folder", status: "Draft", createdAt: "2026-06-03T12:00:00.000Z" } as const;
    expect(decodePayload<typeof payload>(encodePayload(payload))).toEqual(payload);
  });

  it("creates a default Expense Folder when a cloud snapshot is empty", () => {
    const snapshot = normalizeCloudSnapshot({ workspaceId: "workspace-1", userEmail: "user@example.com" });
    expect(snapshot.reports[0].name).toBe("Current Expense Folder");
  });

  it("increments missing and existing versions predictably", () => {
    expect(nextVersion(undefined)).toBe(1);
    expect(nextVersion(4)).toBe(5);
  });
});
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- tests/unit/cloudRecords.test.ts
npm test
npm run build
```

Commit:

```bash
git add src/app/appState.ts src/App.tsx src/cloudflare/types.ts src/cloudflare/schema.ts src/cloudflare/appSnapshot.ts tests/unit/cloudRecords.test.ts
git commit -m "refactor: extract cloud snapshot helpers"
```

## Task 3: Cloudflare Access Authentication

**Files:**
- Create: `src/cloudflare/accessAuth.ts`
- Create: `src/cloudflare/http.ts`
- Test: `tests/unit/cloudAccessAuth.test.ts`

- [ ] **Step 1: Create HTTP helpers**

Create `src/cloudflare/http.ts`:

```ts
import type { ApiErrorBody } from "./types";

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(status: number, error: string) {
  return jsonResponse({ error } satisfies ApiErrorBody, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}
```

- [ ] **Step 2: Create Access authentication helper**

Create `src/cloudflare/accessAuth.ts`:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AccessUser, CloudflareEnv } from "./types";

export interface AccessJwtPayload {
  sub?: string;
  email?: string;
  name?: string;
}

export type AccessJwtVerifier = (jwt: string, env: CloudflareEnv) => Promise<AccessJwtPayload>;

function accessJwtFromRequest(request: Request) {
  return request.headers.get("CF-Access-Jwt-Assertion") || request.headers.get("cf-access-jwt-assertion") || "";
}

export async function verifyAccessJwt(jwt: string, env: CloudflareEnv): Promise<AccessJwtPayload> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new Error("Cloudflare Access is not configured.");
  }

  const issuer = env.ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  const result = await jwtVerify(jwt, jwks, {
    issuer,
    audience: env.ACCESS_AUD
  });

  return result.payload as AccessJwtPayload;
}

export async function requireAccessUser(request: Request, env: CloudflareEnv, verifier: AccessJwtVerifier = verifyAccessJwt): Promise<AccessUser> {
  if (env.ENVIRONMENT === "local") {
    const localEmail = request.headers.get("x-expense-me-local-user");
    if (localEmail) {
      return { id: `local:${localEmail}`, email: localEmail };
    }
  }

  const jwt = accessJwtFromRequest(request);
  if (!jwt) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const payload = await verifier(jwt, env);
  if (!payload.email || !payload.sub) {
    throw new Response("Unauthorized", { status: 401 });
  }

  if (env.ACCESS_ALLOWED_EMAIL && payload.email.toLowerCase() !== env.ACCESS_ALLOWED_EMAIL.toLowerCase()) {
    throw new Response("Forbidden", { status: 403 });
  }

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name
  };
}
```

- [ ] **Step 3: Add Access tests**

Create `tests/unit/cloudAccessAuth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { requireAccessUser } from "../../src/cloudflare/accessAuth";
import type { CloudflareEnv } from "../../src/cloudflare/types";

const env = {
  ACCESS_ALLOWED_EMAIL: "thiago@example.com"
} as CloudflareEnv;

describe("Cloudflare Access auth", () => {
  it("rejects requests without an Access JWT", async () => {
    await expect(requireAccessUser(new Request("https://expense.mac-tbo.com/api/bootstrap"), env, async () => ({ sub: "user-1", email: "thiago@example.com" }))).rejects.toMatchObject({ status: 401 });
  });

  it("accepts the allowed user from a verified JWT", async () => {
    const request = new Request("https://expense.mac-tbo.com/api/bootstrap", {
      headers: { "CF-Access-Jwt-Assertion": "jwt" }
    });

    await expect(requireAccessUser(request, env, async () => ({ sub: "user-1", email: "thiago@example.com" }))).resolves.toEqual({
      id: "user-1",
      email: "thiago@example.com",
      name: undefined
    });
  });

  it("rejects a different verified email", async () => {
    const request = new Request("https://expense.mac-tbo.com/api/bootstrap", {
      headers: { "CF-Access-Jwt-Assertion": "jwt" }
    });

    await expect(requireAccessUser(request, env, async () => ({ sub: "user-2", email: "other@example.com" }))).rejects.toMatchObject({ status: 403 });
  });

  it("allows explicit local test identity only in local mode", async () => {
    const request = new Request("http://localhost/api/bootstrap", {
      headers: { "x-expense-me-local-user": "thiago@example.com" }
    });

    await expect(requireAccessUser(request, { ...env, ENVIRONMENT: "local" } as CloudflareEnv)).resolves.toEqual({
      id: "local:thiago@example.com",
      email: "thiago@example.com"
    });
  });
});
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test -- tests/unit/cloudAccessAuth.test.ts
npm run build
```

Commit:

```bash
git add src/cloudflare/accessAuth.ts src/cloudflare/http.ts tests/unit/cloudAccessAuth.test.ts
git commit -m "feat: add cloudflare access auth"
```

## Task 4: D1 Repository And R2 Artifact Store

**Files:**
- Create: `src/cloudflare/d1Repository.ts`
- Create: `src/cloudflare/artifactStore.ts`
- Test: `tests/unit/cloudRepository.test.ts`

- [ ] **Step 1: Define repository interfaces**

Create `src/cloudflare/d1Repository.ts` with these exports:

The checked-in implementation should use the safer versioned-write variant of this skeleton: `getSnapshot` selects D1 row versions and fills `CloudSnapshot.recordVersions`; existing-row update/delete methods accept optional `WriteOptions` and require the caller's `expectedVersion` unless the caller is an explicitly trusted internal force write; guarded writes must throw `VersionConflictError` on stale versions. `deleteExpenseFolder` must reject folders that still have assigned Expenses before deleting so D1 cannot orphan Expenses.

```ts
import type { Expense, ExportPackage, ReceiptArtifact, Report, StatementCharge } from "../domain/types";
import { normalizeCloudSnapshot } from "./appSnapshot";
import { decodePayload, encodePayload, stripArtifactDataUrl } from "./schema";
import type { AccessUser, CloudSnapshot, CloudflareEnv, WorkspaceContext } from "./types";

export interface MutationResult {
  snapshot: CloudSnapshot;
}

export class VersionConflictError extends Error {
  constructor() {
    super("The cloud record changed. Refresh and try again.");
  }
}

export class D1ExpenseMeRepository {
  constructor(private readonly env: CloudflareEnv) {}

  async getOrCreateWorkspace(user: AccessUser): Promise<WorkspaceContext> {
    const now = new Date().toISOString();
    const userId = `user-${crypto.randomUUID()}`;
    const workspaceId = "workspace-personal";

    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(userId, user.email, user.name ?? null, now, now).run();

    const row = await this.env.EXPENSE_ME_DB.prepare("SELECT id FROM users WHERE email = ?").bind(user.email).first<{ id: string }>();
    const resolvedUserId = row?.id ?? userId;

    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT OR IGNORE INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    ).bind(workspaceId, "Expense Me", now, now).run();

    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)"
    ).bind(workspaceId, resolvedUserId, "owner", now).run();

    return { user: { ...user, id: resolvedUserId }, workspaceId };
  }

  async getSnapshot(context: WorkspaceContext): Promise<CloudSnapshot> {
    const [expenses, folders, artifacts, charges, packages] = await Promise.all([
      this.listPayloads<Expense>("expenses", context.workspaceId, "expense_date DESC"),
      this.listPayloads<Report>("expense_folders", context.workspaceId, "created_at DESC"),
      this.listPayloads<ReceiptArtifact>("receipt_artifacts", context.workspaceId, "created_at DESC"),
      this.listPayloads<StatementCharge>("statement_charges", context.workspaceId, "transaction_date DESC"),
      this.listPayloads<ExportPackage>("export_packages", context.workspaceId, "generated_at DESC")
    ]);

    return normalizeCloudSnapshot({
      workspaceId: context.workspaceId,
      userEmail: context.user.email,
      expenses,
      reports: folders,
      receiptArtifacts: artifacts,
      statementCharges: charges,
      exportPackages: packages
    });
  }

  async listPayloads<T>(table: string, workspaceId: string, orderBy: string): Promise<T[]> {
    const result = await this.env.EXPENSE_ME_DB.prepare(
      `SELECT payload_json FROM ${table} WHERE workspace_id = ? ORDER BY ${orderBy}`
    ).bind(workspaceId).all<{ payload_json: string }>();
    return (result.results ?? []).map((row) => decodePayload<T>(row.payload_json));
  }

  async upsertExpense(context: WorkspaceContext, expense: Expense) {
    const now = new Date().toISOString();
    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT INTO expenses (id, workspace_id, expense_folder_id, payload_json, status, expense_date, source_type, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET expense_folder_id = excluded.expense_folder_id, payload_json = excluded.payload_json, status = excluded.status, expense_date = excluded.expense_date, source_type = excluded.source_type, updated_at = excluded.updated_at, version = expenses.version + 1"
    ).bind(expense.id, context.workspaceId, expense.reportId ?? null, encodePayload(expense), expense.status, expense.expenseDate, expense.sourceType, now, now).run();
    return { snapshot: await this.getSnapshot(context) };
  }

  async deleteExpense(context: WorkspaceContext, expenseId: string) {
    await this.env.EXPENSE_ME_DB.prepare("DELETE FROM expenses WHERE workspace_id = ? AND id = ?").bind(context.workspaceId, expenseId).run();
    return { snapshot: await this.getSnapshot(context) };
  }

  async upsertExpenseFolder(context: WorkspaceContext, report: Report) {
    const now = new Date().toISOString();
    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT INTO expense_folders (id, workspace_id, payload_json, status, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, status = excluded.status, updated_at = excluded.updated_at, version = expense_folders.version + 1"
    ).bind(report.id, context.workspaceId, encodePayload(report), report.status, report.createdAt, now).run();
    return { snapshot: await this.getSnapshot(context) };
  }

  async deleteExpenseFolder(context: WorkspaceContext, reportId: string) {
    await this.env.EXPENSE_ME_DB.prepare("DELETE FROM expense_folders WHERE workspace_id = ? AND id = ?").bind(context.workspaceId, reportId).run();
    return { snapshot: await this.getSnapshot(context) };
  }

  async upsertReceiptArtifact(context: WorkspaceContext, artifact: ReceiptArtifact) {
    const now = new Date().toISOString();
    const metadata = stripArtifactDataUrl(artifact);
    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT INTO receipt_artifacts (id, workspace_id, payload_json, artifact_type, source_message_id, storage_key, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, artifact_type = excluded.artifact_type, source_message_id = excluded.source_message_id, storage_key = excluded.storage_key, updated_at = excluded.updated_at, version = receipt_artifacts.version + 1"
    ).bind(metadata.id, context.workspaceId, encodePayload(metadata), metadata.artifactType, metadata.sourceMessageId ?? null, metadata.storageKey, metadata.createdAt, now).run();
  }

  async upsertStatementCharge(context: WorkspaceContext, charge: StatementCharge) {
    const now = new Date().toISOString();
    await this.env.EXPENSE_ME_DB.prepare(
      "INSERT INTO statement_charges (id, workspace_id, payload_json, statement_import_id, match_status, transaction_date, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, match_status = excluded.match_status, updated_at = excluded.updated_at, version = statement_charges.version + 1"
    ).bind(charge.id, context.workspaceId, encodePayload(charge), charge.statementImportId, charge.matchStatus, charge.transactionDate, now, now).run();
  }
}
```

The remaining write methods are introduced in the migration, AgentMail sync, and export tasks where their callers and tests are added.

- [ ] **Step 2: Create artifact store**

Create `src/cloudflare/artifactStore.ts`:

```ts
import type { ReceiptArtifact } from "../domain/types";
import type { CloudflareEnv, WorkspaceContext } from "./types";

export function dataUrlToBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  const metadata = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mimeType = metadata.match(/^data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, mimeType };
}

export function artifactObjectKey(context: WorkspaceContext, artifact: ReceiptArtifact) {
  return `${context.workspaceId}/artifacts/${artifact.id}`;
}

export async function storeArtifactData(env: CloudflareEnv, context: WorkspaceContext, artifact: ReceiptArtifact) {
  if (!artifact.dataUrl) return artifact.storageKey;
  const { bytes, mimeType } = dataUrlToBytes(artifact.dataUrl);
  const key = artifactObjectKey(context, artifact);
  await env.EXPENSE_ME_ARTIFACTS.put(key, bytes, {
    httpMetadata: { contentType: artifact.mimeType || mimeType }
  });
  return key;
}

export async function loadArtifactDataUrl(env: CloudflareEnv, artifact: ReceiptArtifact) {
  const object = await env.EXPENSE_ME_ARTIFACTS.get(artifact.storageKey);
  if (!object) return undefined;
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${artifact.mimeType};base64,${btoa(binary)}`;
}
```

- [ ] **Step 3: Add repository tests with a fake D1 binding**

Create `tests/unit/cloudRepository.test.ts` with a minimal fake D1 binding that records SQL calls and verifies:

```ts
import { describe, expect, it, vi } from "vitest";
import { D1ExpenseMeRepository } from "../../src/cloudflare/d1Repository";
import type { CloudflareEnv } from "../../src/cloudflare/types";

function fakeStatement() {
  return {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    first: vi.fn().mockResolvedValue({ id: "user-1" }),
    all: vi.fn().mockResolvedValue({ results: [] })
  };
}

describe("D1 Expense Me repository", () => {
  it("creates a personal workspace for the authenticated user", async () => {
    const statements = [fakeStatement(), fakeStatement(), fakeStatement(), fakeStatement(), fakeStatement(), fakeStatement(), fakeStatement(), fakeStatement()];
    const db = { prepare: vi.fn(() => statements.shift() ?? fakeStatement()) };
    const repo = new D1ExpenseMeRepository({ EXPENSE_ME_DB: db } as unknown as CloudflareEnv);

    const context = await repo.getOrCreateWorkspace({ id: "access-user", email: "thiago@example.com" });

    expect(context.workspaceId).toBe("workspace-personal");
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT OR IGNORE INTO users"));
  });
});
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test -- tests/unit/cloudRepository.test.ts
npm run build
```

Commit:

```bash
git add src/cloudflare/d1Repository.ts src/cloudflare/artifactStore.ts tests/unit/cloudRepository.test.ts
git commit -m "feat: add cloud data repository"
```

## Task 5: API Router And Pages Function Entrypoint

**Files:**
- Create: `src/cloudflare/apiRouter.ts`
- Create: `functions/api/[[route]].ts`
- Test: `tests/unit/cloudApi.test.ts`

- [ ] **Step 1: Create API router skeleton**

Create `src/cloudflare/apiRouter.ts`:

```ts
import { requireAccessUser } from "./accessAuth";
import { D1ExpenseMeRepository } from "./d1Repository";
import { errorResponse, jsonResponse, readJson } from "./http";
import type { ApiSnapshotBody, CloudflareEnv } from "./types";

interface RouteDeps {
  repository?: D1ExpenseMeRepository;
}

export async function handleApiRequest(request: Request, env: CloudflareEnv, deps: RouteDeps = {}) {
  try {
    const url = new URL(request.url);
    const user = await requireAccessUser(request, env);
    const repository = deps.repository ?? new D1ExpenseMeRepository(env);
    const context = await repository.getOrCreateWorkspace(user);

    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      const snapshot = await repository.getSnapshot(context);
      return jsonResponse({ snapshot } satisfies ApiSnapshotBody);
    }

    if (request.method === "POST" && url.pathname === "/api/expenses") {
      const body = await readJson<{ expense: import("../domain/types").Expense; expectedVersion?: number }>(request);
      const result = await repository.upsertExpense(context, body.expense, { expectedVersion: body.expectedVersion });
      return jsonResponse(result);
    }

    const expenseDelete = url.pathname.match(/^\/api\/expenses\/([^/]+)$/);
    if (request.method === "DELETE" && expenseDelete) {
      const expectedVersionParam = url.searchParams.get("expectedVersion");
      const expectedVersion = expectedVersionParam ? Number(expectedVersionParam) : undefined;
      const result = await repository.deleteExpense(context, decodeURIComponent(expenseDelete[1]), {
        expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : undefined
      });
      return jsonResponse(result);
    }

    return errorResponse(404, "API route not found.");
  } catch (error) {
    if (error instanceof Response) return errorResponse(error.status, error.status === 403 ? "Forbidden." : "Unauthorized.");
    console.error("Expense Me API failed", error);
    return errorResponse(500, "Expense Me API failed.");
  }
}
```

Expand this router in later tasks for migration, Expense Folders, statements, AgentMail, receipts, and Export Packages. Keep error bodies stable and generic.

- [ ] **Step 2: Add Pages Function entrypoint**

Create `functions/api/[[route]].ts`:

```ts
import { handleApiRequest } from "../../src/cloudflare/apiRouter";
import type { CloudflareEnv } from "../../src/cloudflare/types";

export const onRequest: PagesFunction<CloudflareEnv> = async (context) => {
  return handleApiRequest(context.request, context.env);
};
```

- [ ] **Step 3: Add API router tests**

Create `tests/unit/cloudApi.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "../../src/cloudflare/apiRouter";
import type { CloudflareEnv } from "../../src/cloudflare/types";

const env = {
  ENVIRONMENT: "local"
} as CloudflareEnv;

describe("cloud API router", () => {
  it("rejects unauthenticated API calls", async () => {
    const response = await handleApiRequest(new Request("https://expense.mac-tbo.com/api/bootstrap"), env);
    expect(response.status).toBe(401);
  });

  it("returns the bootstrap snapshot for an authenticated local user", async () => {
    const repository = {
      getOrCreateWorkspace: vi.fn().mockResolvedValue({ user: { id: "user-1", email: "thiago@example.com" }, workspaceId: "workspace-personal" }),
      getSnapshot: vi.fn().mockResolvedValue({ workspaceId: "workspace-personal", userEmail: "thiago@example.com", expenses: [], reports: [], receiptArtifacts: [], statementCharges: [], exportPackages: [] })
    };

    const response = await handleApiRequest(
      new Request("https://expense.mac-tbo.com/api/bootstrap", { headers: { "x-expense-me-local-user": "thiago@example.com" } }),
      env,
      { repository: repository as never }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toHaveProperty("snapshot.workspaceId", "workspace-personal");
  });
});
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test -- tests/unit/cloudApi.test.ts
npm run build
```

Commit:

```bash
git add src/cloudflare/apiRouter.ts functions/api/[[route]].ts tests/unit/cloudApi.test.ts
git commit -m "feat: add cloud api entrypoint"
```

## Task 6: Local Snapshot Migration

**Files:**
- Create: `src/client/localSnapshot.ts`
- Modify: `src/cloudflare/d1Repository.ts`
- Modify: `src/cloudflare/apiRouter.ts`
- Test: `tests/unit/localSnapshot.test.ts`
- Test: `tests/unit/cloudMigration.test.ts`

- [ ] **Step 1: Create local snapshot reader**

Create `src/client/localSnapshot.ts`:

```ts
import type { AppSnapshot } from "../domain/types";

export const v1LocalStorageKey = "expense-me-v1-live-state";
export const v15MigrationMarkerKey = "expense-me-v15-cloud-migration";

export function readV1LocalSnapshot(storage: Storage = window.localStorage): AppSnapshot | undefined {
  try {
    const raw = storage.getItem(v1LocalStorageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<AppSnapshot>;
    if (!Array.isArray(parsed.expenses) || !Array.isArray(parsed.receiptArtifacts) || !Array.isArray(parsed.reports) || !Array.isArray(parsed.statementCharges)) {
      return undefined;
    }
    return {
      expenses: parsed.expenses,
      receiptArtifacts: parsed.receiptArtifacts,
      reports: parsed.reports,
      statementCharges: parsed.statementCharges
    };
  } catch {
    return undefined;
  }
}

export function hasMigrationMarker(storage: Storage = window.localStorage) {
  return storage.getItem(v15MigrationMarkerKey) === "complete";
}

export function markMigrationComplete(storage: Storage = window.localStorage) {
  storage.setItem(v15MigrationMarkerKey, "complete");
}
```

- [ ] **Step 2: Add migration repository method**

Add to `D1ExpenseMeRepository`:

```ts
async replaceFromMigration(context: WorkspaceContext, snapshot: import("../domain/types").AppSnapshot) {
  await this.env.EXPENSE_ME_DB.batch([
    this.env.EXPENSE_ME_DB.prepare("DELETE FROM expenses WHERE workspace_id = ?").bind(context.workspaceId),
    this.env.EXPENSE_ME_DB.prepare("DELETE FROM expense_folders WHERE workspace_id = ?").bind(context.workspaceId),
    this.env.EXPENSE_ME_DB.prepare("DELETE FROM receipt_artifacts WHERE workspace_id = ?").bind(context.workspaceId),
    this.env.EXPENSE_ME_DB.prepare("DELETE FROM statement_charges WHERE workspace_id = ?").bind(context.workspaceId)
  ]);

  for (const report of snapshot.reports) await this.upsertExpenseFolder(context, report);
  for (const expense of snapshot.expenses) await this.upsertExpense(context, expense);
  for (const artifact of snapshot.receiptArtifacts) await this.upsertReceiptArtifact(context, artifact);
  for (const charge of snapshot.statementCharges) await this.upsertStatementCharge(context, charge);

  return { snapshot: await this.getSnapshot(context) };
}
```

- [ ] **Step 3: Add migration API route**

Add to `handleApiRequest` before 404:

```ts
if (request.method === "POST" && url.pathname === "/api/migrate-local-snapshot") {
  const body = await readJson<{ snapshot: import("../domain/types").AppSnapshot }>(request);
  const result = await repository.replaceFromMigration(context, body.snapshot);
  return jsonResponse(result);
}
```

- [ ] **Step 4: Add tests**

Create `tests/unit/localSnapshot.test.ts` verifying valid read, invalid JSON, missing arrays, and marker behavior.

Create `tests/unit/cloudMigration.test.ts` verifying `/api/migrate-local-snapshot` calls `replaceFromMigration` and returns the snapshot.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test -- tests/unit/localSnapshot.test.ts tests/unit/cloudMigration.test.ts
npm test
npm run build
```

Commit:

```bash
git add src/client/localSnapshot.ts src/cloudflare/d1Repository.ts src/cloudflare/apiRouter.ts tests/unit/localSnapshot.test.ts tests/unit/cloudMigration.test.ts
git commit -m "feat: add v1 local snapshot migration"
```

## Task 6A: Merge V1 Hotfix Into V1.5 Branch

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/app/appState.ts`
- Modify: `src/features/inbox/InboxScreen.tsx`
- Modify: `src/features/inbox/inbox.css`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/inbox.test.tsx`
- Modify: `tests/unit/shell.test.tsx`
- Modify: `README.md`
- Modify: `docs/DECISIONS.md`

- [x] **Step 1: Merge the V1 hotfix line**

Run:

```bash
git merge origin/main --no-edit
```

Expected: conflicts are likely in `src/App.tsx`, `src/app/appState.ts`, `README.md`, `docs/DECISIONS.md`, `tests/unit/inbox.test.tsx`, and `tests/unit/shell.test.tsx`.

- [x] **Step 2: Resolve conflicts preserving both sides**

Keep all V1.5 Cloudflare files and cloud contracts from this branch. Also keep the V1 hotfix behavior from `origin/main`:

- `activeReportId` and `currentActiveReportId` drive new capture, email sync, and statement-created expenses;
- Inbox receives `activeReportId` and `onActiveReportChange`;
- Export still receives all reports and chooses its own Expense Folder;
- malformed V1 localStorage recovery behavior remains available until Task 8 replaces durable V1.5 state;
- duplicate Expense Folder ids are prevented by collision-resistant id generation;
- missing `statementCharges` and missing `reports` V1 snapshots migrate without erasing local data.

The resolved `src/app/appState.ts` must contain reusable helpers for `reportLabelForExpenseIds`, active-folder-safe normalization, and collision-resistant Expense Folder creation so Task 8 can reuse them from the cloud hook.

- [x] **Step 3: Verify the merge**

Run:

```bash
npm test -- tests/unit/inbox.test.tsx tests/unit/shell.test.tsx tests/unit/localSnapshot.test.ts tests/unit/cloudMigration.test.ts
npm test
npm run build
git diff --check
```

Expected: V1 hotfix tests and V1.5 migration/cloud tests all pass.

- [x] **Step 4: Commit the merge**

Run:

```bash
git add README.md docs/DECISIONS.md src/App.tsx src/app/appState.ts src/features/inbox/InboxScreen.tsx src/features/inbox/inbox.css src/styles/app.css tests/unit/inbox.test.tsx tests/unit/shell.test.tsx
git commit
```

Expected: merge commit records `origin/main` hotfix integration into `v15-single-source`.

## Task 7: Client Cloud Repository

**Files:**
- Create: `src/client/cloudRepository.ts`
- Test: `tests/unit/cloudRepository.test.ts`

- [ ] **Step 1: Create client API wrapper**

Create `src/client/cloudRepository.ts`:

```ts
import type { AppSnapshot, Expense, ReceiptArtifact, Report, StatementCharge } from "../domain/types";
import type { ApiSnapshotBody, CloudSnapshot } from "../cloudflare/types";

async function readApiJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `Request failed: ${response.status}` }));
    throw new Error(typeof body.error === "string" ? body.error : `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export class CloudRepository {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async bootstrap() {
    const body = await readApiJson<ApiSnapshotBody>(await this.fetcher("/api/bootstrap"));
    return body.snapshot;
  }

  async migrateLocalSnapshot(snapshot: AppSnapshot) {
    return this.snapshotFromMutation("/api/migrate-local-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot })
    });
  }

  async saveExpense(expense: Expense, artifacts: ReceiptArtifact[] = [], expectedVersion?: number) {
    return this.snapshotFromMutation("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expense, artifacts, expectedVersion })
    });
  }

  async deleteExpense(expenseId: string, expectedVersion?: number) {
    const query = expectedVersion === undefined ? "" : `?expectedVersion=${encodeURIComponent(String(expectedVersion))}`;
    return this.snapshotFromMutation(`/api/expenses/${encodeURIComponent(expenseId)}${query}`, { method: "DELETE" });
  }

  async saveExpenseFolder(report: Report, expectedVersion?: number) {
    return this.snapshotFromMutation("/api/expense-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report, expectedVersion })
    });
  }

  async deleteExpenseFolder(reportId: string, expectedVersion?: number) {
    const query = expectedVersion === undefined ? "" : `?expectedVersion=${encodeURIComponent(String(expectedVersion))}`;
    return this.snapshotFromMutation(`/api/expense-folders/${encodeURIComponent(reportId)}${query}`, { method: "DELETE" });
  }

  async importStatementCharges(charges: StatementCharge[]) {
    return this.snapshotFromMutation("/api/statements/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ charges })
    });
  }

  async syncEmail() {
    return this.snapshotFromMutation("/api/email/sync", { method: "POST" });
  }

  private async snapshotFromMutation(input: string, init: RequestInit): Promise<CloudSnapshot> {
    const body = await readApiJson<{ snapshot: CloudSnapshot }>(await this.fetcher(input, init));
    return body.snapshot;
  }
}
```

- [ ] **Step 2: Add tests**

Extend `tests/unit/cloudRepository.test.ts` or create `tests/unit/clientCloudRepository.test.ts` to verify:

- bootstrap calls `/api/bootstrap`;
- failed response throws generic API error;
- saveExpense sends expense and artifacts;
- deleteExpense encodes the ID;
- syncEmail calls `POST /api/email/sync`.

- [ ] **Step 3: Verify and commit**

Run:

```bash
npm test -- tests/unit/cloudRepository.test.ts
npm run build
```

Commit:

```bash
git add src/client/cloudRepository.ts tests/unit/cloudRepository.test.ts
git commit -m "feat: add cloud client repository"
```

## Task 8: Frontend Cloud State Hook

**Files:**
- Create: `src/app/useExpenseMeCloudState.ts`
- Modify: `src/App.tsx`
- Test: `tests/unit/useExpenseMeCloudState.test.tsx`
- Test: `tests/unit/shell.test.tsx`

- [x] **Step 1: Create hook shell**

Create `src/app/useExpenseMeCloudState.ts` with:

```ts
import { useEffect, useMemo, useState } from "react";
import { CloudRepository } from "../client/cloudRepository";
import { hasMigrationMarker, markMigrationComplete, readV1LocalSnapshot } from "../client/localSnapshot";
import type { AppSnapshot, Expense, ReceiptArtifact, Report, StatementCharge } from "../domain/types";
import type { CloudSnapshot } from "../cloudflare/types";
import { createDefaultReport, normalizeExpensesWithReports, syncReportsWithExpenses } from "./appState";

export interface CloudState {
  loading: boolean;
  error: string | null;
  snapshot: CloudSnapshot;
  localSnapshotForMigration?: AppSnapshot;
  migrateLocalSnapshot: () => Promise<void>;
  setSnapshot: (snapshot: CloudSnapshot) => void;
  saveExpense: (expense: Expense, artifacts?: ReceiptArtifact[]) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
  saveExpenseFolder: (report: Report) => Promise<void>;
  deleteExpenseFolder: (reportId: string) => Promise<void>;
  importStatementCharges: (charges: StatementCharge[]) => Promise<CloudSnapshot>;
  syncEmail: () => Promise<CloudSnapshot>;
}

function emptySnapshot(): CloudSnapshot {
  const reports = [createDefaultReport()];
  return {
    workspaceId: "",
    userEmail: "",
    expenses: normalizeExpensesWithReports([], reports),
    receiptArtifacts: [],
    reports: syncReportsWithExpenses(reports, []),
    statementCharges: [],
    exportPackages: [],
    recordVersions: {
      expenses: {},
      reports: {},
      receiptArtifacts: {},
      statementCharges: {},
      exportPackages: {}
    }
  };
}

export function useExpenseMeCloudState(repository = new CloudRepository()): CloudState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CloudSnapshot>(() => emptySnapshot());
  const [localSnapshotForMigration, setLocalSnapshotForMigration] = useState<AppSnapshot | undefined>();

  useEffect(() => {
    let cancelled = false;
    repository.bootstrap()
      .then((nextSnapshot) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
        const localSnapshot = readV1LocalSnapshot();
        const cloudHasData = nextSnapshot.expenses.length > 0 || nextSnapshot.receiptArtifacts.length > 0 || nextSnapshot.statementCharges.length > 0;
        if (!cloudHasData && localSnapshot && !hasMigrationMarker()) setLocalSnapshotForMigration(localSnapshot);
      })
      .catch((nextError: Error) => {
        if (!cancelled) setError(nextError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  return useMemo(() => ({
    loading,
    error,
    snapshot,
    localSnapshotForMigration,
    setSnapshot,
    migrateLocalSnapshot: async () => {
      if (!localSnapshotForMigration) return;
      const nextSnapshot = await repository.migrateLocalSnapshot(localSnapshotForMigration);
      setSnapshot(nextSnapshot);
      markMigrationComplete();
      setLocalSnapshotForMigration(undefined);
    },
    saveExpense: async (expense, artifacts = []) =>
      setSnapshot(await repository.saveExpense(expense, artifacts, snapshot.recordVersions.expenses[expense.id])),
    deleteExpense: async (expenseId) =>
      setSnapshot(await repository.deleteExpense(expenseId, snapshot.recordVersions.expenses[expenseId])),
    saveExpenseFolder: async (report) =>
      setSnapshot(await repository.saveExpenseFolder(report, snapshot.recordVersions.reports[report.id])),
    deleteExpenseFolder: async (reportId) =>
      setSnapshot(await repository.deleteExpenseFolder(reportId, snapshot.recordVersions.reports[reportId])),
    importStatementCharges: async (charges) => {
      const nextSnapshot = await repository.importStatementCharges(charges);
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    },
    syncEmail: async () => {
      const nextSnapshot = await repository.syncEmail();
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    }
  }), [error, loading, localSnapshotForMigration, repository, snapshot]);
}
```

- [x] **Step 2: Refactor `src/App.tsx`**

Replace local durable state and `persistState` calls with `useExpenseMeCloudState`.

Preserve these local-only states:

- `screen`
- `selectedExpenseId`
- theme state through `useTheme`
- `emailSyncPromiseRef`

All handlers that used `setExpenses`, `setReports`, `setReceiptArtifacts`, and `setStatementCharges` must call hook methods and then read the returned snapshot.

- [x] **Step 3: Add migration banner**

In `App.tsx`, render a small non-card banner only when `localSnapshotForMigration` exists:

```tsx
{cloudState.localSnapshotForMigration && (
  <div className="migration-banner" role="status">
    <span>Local V1 data is available.</span>
    <button type="button" onClick={cloudState.migrateLocalSnapshot}>Import to V1.5 cloud data</button>
  </div>
)}
```

Style in `src/styles/app.css`. Keep the copy short and do not use instructional paragraphs.

- [x] **Step 4: Add hook tests**

Create `tests/unit/useExpenseMeCloudState.test.tsx` using React Testing Library `renderHook` if available; otherwise create a tiny test component. Verify:

- bootstrap populates snapshot;
- bootstrap failure shows error;
- empty cloud plus local V1 data exposes migration action;
- migration posts snapshot and hides the migration action;
- saveExpense updates the snapshot returned by the repository.

- [x] **Step 5: Verify existing flows**

Run:

```bash
npm test -- tests/unit/useExpenseMeCloudState.test.tsx tests/unit/shell.test.tsx
npm test
npm run build
```

Commit:

```bash
git add src/app/useExpenseMeCloudState.ts src/App.tsx src/styles/app.css tests/unit/useExpenseMeCloudState.test.tsx tests/unit/shell.test.tsx
git commit -m "feat: load app state from cloud snapshot"
```

Verification completed on 2026-06-03 before commit:

```bash
npm test -- tests/unit/shell.test.tsx
npm test -- tests/unit/shell.test.tsx tests/unit/useExpenseMeCloudState.test.tsx tests/unit/localSnapshot.test.ts tests/unit/clientCloudRepository.test.ts tests/unit/cloudApi.test.ts
npm test
npm run build
```

Results: shell suite 27 passed, focused suite 65 passed, full suite 203 passed, and build/typecheck passed.

## Task 9: Cloud Mutation Routes For Expenses, Folders, Artifacts, And Statements

**Files:**
- Modify: `src/cloudflare/apiRouter.ts`
- Modify: `src/cloudflare/d1Repository.ts`
- Modify: `src/cloudflare/artifactStore.ts`
- Modify: `src/client/cloudRepository.ts`
- Test: `tests/unit/cloudApi.test.ts`
- Test: `tests/unit/shell.test.tsx`

- [ ] **Step 1: Implement `POST /api/expenses` with artifacts**

The route body is:

```ts
{
  expense: Expense;
  artifacts?: ReceiptArtifact[];
}
```

For each artifact:

1. write binary content to R2 when `dataUrl` exists;
2. replace `storageKey` with the R2 key;
3. strip `dataUrl` before D1 write;
4. upsert artifact metadata;
5. upsert the Expense.

- [ ] **Step 2: Implement Expense Folder routes**

Add:

- `POST /api/expense-folders`
- `PATCH /api/expense-folders/:expenseFolderId`
- `DELETE /api/expense-folders/:expenseFolderId`

Delete must reject non-empty folders with:

```json
{ "error": "Expense Folder has expenses and cannot be deleted." }
```

- [ ] **Step 3: Implement statement import route**

Add `POST /api/statements/import`:

1. read `charges`;
2. load current snapshot;
3. run `reconcileStatementCharges(snapshot.expenses, charges)`;
4. upsert reconciled expenses;
5. upsert statement charges;
6. return the new snapshot.

- [ ] **Step 4: Add API tests**

Extend `tests/unit/cloudApi.test.ts` with:

- saving an Expense returns a snapshot;
- saving an Expense with artifact calls artifact storage and strips `dataUrl`;
- deleting a non-empty Expense Folder returns 409;
- statement import route calls reconciliation path and returns snapshot.

- [ ] **Step 5: Verify UI flows**

Run:

```bash
npm test -- tests/unit/cloudApi.test.ts tests/unit/shell.test.tsx tests/unit/capture.test.tsx tests/unit/cards.test.tsx
npm test
npm run build
```

Commit:

```bash
git add src/cloudflare/apiRouter.ts src/cloudflare/d1Repository.ts src/cloudflare/artifactStore.ts src/client/cloudRepository.ts tests/unit/cloudApi.test.ts tests/unit/shell.test.tsx
git commit -m "feat: persist app mutations through cloud api"
```

## Task 10: Server-Side AgentMail Sync For V1.5

**Files:**
- Create: `src/cloudflare/serverAgentMail.ts`
- Modify: `src/cloudflare/apiRouter.ts`
- Modify: `src/cloudflare/d1Repository.ts`
- Modify: `src/client/cloudRepository.ts`
- Test: `tests/unit/agentMailSync.test.ts`
- Test: `tests/unit/cloudApi.test.ts`

- [ ] **Step 1: Create Worker-compatible AgentMail client**

Create `src/cloudflare/serverAgentMail.ts`:

```ts
import type { AgentMailMessageSummary } from "../features/email/agentMailSync";
import type { CloudflareEnv } from "./types";

function requireAgentMailConfig(env: CloudflareEnv) {
  if (!env.AGENTMAIL_API_KEY) throw new Error("AgentMail is not configured.");
  return {
    apiKey: env.AGENTMAIL_API_KEY,
    inboxId: env.AGENTMAIL_INBOX_ID || "expense-me@agentmail.to",
    baseUrl: env.AGENTMAIL_BASE_URL || "https://api.agentmail.to"
  };
}

async function agentMailRequest<T>(env: CloudflareEnv, path: string) {
  const config = requireAgentMailConfig(env);
  const response = await fetch(`${config.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` }
  });

  if (!response.ok) {
    throw new Error(`AgentMail request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function listServerAgentMailMessages(env: CloudflareEnv) {
  const config = requireAgentMailConfig(env);
  const inbox = encodeURIComponent(config.inboxId);
  const body = await agentMailRequest<{ messages?: AgentMailMessageSummary[] } | AgentMailMessageSummary[]>(env, `/v0/inboxes/${inbox}/messages`);
  return Array.isArray(body) ? body : body.messages ?? [];
}

export async function getServerAgentMailMessage(env: CloudflareEnv, messageId: string) {
  const config = requireAgentMailConfig(env);
  const inbox = encodeURIComponent(config.inboxId);
  const message = encodeURIComponent(messageId);
  return agentMailRequest<AgentMailMessageSummary>(env, `/v0/inboxes/${inbox}/messages/${message}`);
}
```

- [ ] **Step 2: Implement `POST /api/email/sync`**

Route flow:

1. list AgentMail summaries;
2. fetch detail for each summary when `message_id` exists;
3. call `createExpenseFromEmailMessage`;
4. compare against existing Expense IDs;
5. use `shouldRepairEmailExpense` and `mergeEmailExpenseRepair`;
6. write new/repaired Expenses and artifacts;
7. insert a `sync_runs` row;
8. return the new snapshot.

Keep error responses generic:

```json
{ "error": "Email sync failed." }
```

- [ ] **Step 3: Remove browser-side AgentMail detail dependency for V1.5**

Keep `src/features/email/agentMailSync.ts` tests for V1 behavior, but `syncEmail` in V1.5 should call `CloudRepository.syncEmail()` instead of fetching `/api/agentmail/messages` directly.

- [ ] **Step 4: Add tests**

Extend `tests/unit/cloudApi.test.ts` to verify:

- unauthenticated `POST /api/email/sync` returns 401;
- authenticated sync imports one message;
- second sync does not duplicate the same Expense ID;
- thrown upstream errors return stable public text.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test -- tests/unit/cloudApi.test.ts tests/unit/agentMailSync.test.ts tests/unit/extraction.test.ts
npm test
npm run build
```

Commit:

```bash
git add src/cloudflare/serverAgentMail.ts src/cloudflare/apiRouter.ts src/cloudflare/d1Repository.ts src/client/cloudRepository.ts tests/unit/cloudApi.test.ts tests/unit/agentMailSync.test.ts
git commit -m "feat: sync agentmail into cloud data"
```

## Task 11: Cloud Export Package Generation

**Files:**
- Modify: `src/features/export/exportPackage.ts`
- Modify: `src/features/export/ExportScreen.tsx`
- Modify: `src/cloudflare/apiRouter.ts`
- Modify: `src/cloudflare/d1Repository.ts`
- Modify: `src/client/cloudRepository.ts`
- Test: `tests/unit/exportPackage.test.ts`
- Test: `tests/unit/cloudApi.test.ts`

- [ ] **Step 1: Expose a server-safe export builder**

In `src/features/export/exportPackage.ts`, keep the existing browser export behavior and add a named helper:

```ts
export async function buildExportPackageBlob(input: ExportPackageInput) {
  const files = buildExportPackageFiles(input);
  const archive = await buildExportZip(files);
  return { files, archive };
}
```

Do not change readiness rules except where cloud artifact loading requires metadata normalization.

- [ ] **Step 2: Add cloud export route**

Add `POST /api/export-packages`:

1. read `{ reportId }`;
2. load snapshot;
3. find the Expense Folder by `reportId`;
4. load R2 `dataUrl` content for artifacts needed by the selected folder;
5. build the Export Package zip;
6. store the zip in R2 under `${workspaceId}/export-packages/${packageId}.zip`;
7. insert export metadata in D1;
8. return `{ exportPackage, downloadUrl }`.

Add `GET /api/export-packages/:exportPackageId/download`:

1. verify authenticated workspace;
2. fetch object from R2;
3. return `application/zip`.

- [ ] **Step 3: Update `ExportScreen`**

Add an optional prop:

```ts
onGenerateExportPackage?: (reportId: string) => Promise<void>;
```

When present, `ExportScreen` calls it instead of building/downloading locally. Keep the local builder as fallback for V1 tests and any Vercel-only runtime.

- [ ] **Step 4: Add tests**

Update tests to verify:

- existing local export still works;
- cloud export route returns a download URL;
- cloud route rejects missing Expense Folder;
- downloaded object has `Content-Type: application/zip`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test -- tests/unit/exportPackage.test.ts tests/unit/cloudApi.test.ts
npm test
npm run build
```

Commit:

```bash
git add src/features/export/exportPackage.ts src/features/export/ExportScreen.tsx src/cloudflare/apiRouter.ts src/cloudflare/d1Repository.ts src/client/cloudRepository.ts tests/unit/exportPackage.test.ts tests/unit/cloudApi.test.ts
git commit -m "feat: generate export packages from cloud data"
```

## Task 12: Cloudflare Resource Setup And Protected Deployment

**Files:**
- Modify: `wrangler.toml`
- Modify: `README.md`
- Modify: `docs/DECISIONS.md`

- [ ] **Step 1: Authenticate Wrangler**

Run:

```bash
npx wrangler login
```

If auth is required, ask Thiago to approve Cloudflare auth from the Mac.

- [ ] **Step 2: Create D1 and R2 resources**

Run:

```bash
npx wrangler d1 create expense-me-v15
npx wrangler r2 bucket create expense-me-v15-artifacts
```

Patch `wrangler.toml` with the real D1 UUID printed by Wrangler.

Add the `EXPENSE_ME_DB` D1 binding and `EXPENSE_ME_ARTIFACTS` R2 binding using the real names and IDs printed by Wrangler. Do not commit example IDs.

- [ ] **Step 3: Apply migrations locally and remotely**

Run:

```bash
npm run cf:d1:migrations
npm run cf:d1:migrations:remote
```

Expected: migration `0001_v15_initial.sql` applied.

- [ ] **Step 4: Set secrets**

Run:

```bash
npx wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name expense-me-v15
npx wrangler pages secret put ACCESS_AUD --project-name expense-me-v15
npx wrangler pages secret put ACCESS_ALLOWED_EMAIL --project-name expense-me-v15
npx wrangler pages secret put AGENTMAIL_API_KEY --project-name expense-me-v15
npx wrangler pages secret put AGENTMAIL_INBOX_ID --project-name expense-me-v15
```

Do not echo secret values into terminal output, docs, or commits.

- [ ] **Step 5: Configure Cloudflare Access**

In Cloudflare Zero Trust:

- application hostname: `expense.mac-tbo.com`;
- protect the full app path;
- allow only Thiago's email identity;
- make sure `/api/*` is included;
- copy the Access audience value into the Wrangler secret.

- [ ] **Step 6: Deploy V1.5**

Run:

```bash
npm run cf:deploy
```

Expected: Cloudflare Pages deployment for `expense-me-v15` succeeds.

- [ ] **Step 7: Attach the custom hostname**

Use Cloudflare dashboard or Wrangler-supported Pages domain command to attach:

```text
expense.mac-tbo.com
```

Verify DNS is proxied through Cloudflare and Access prompts before the app loads.

- [ ] **Step 8: Verify Vercel V1 still loads**

Run:

```bash
curl -I https://expense-me-tbo.vercel.app
```

Expected: HTTP 200 or 3xx to the Vercel app, not a Cloudflare Access response.

- [ ] **Step 9: Commit deployment metadata only**

Run a secret scan first:

```bash
git diff | rg -n "(TOKEN|SECRET|PASSWORD|PRIVATE KEY|BEGIN [A-Z ]*PRIVATE|AGENTMAIL_API_KEY|CLOUDFLARE_API_TOKEN|sk-[A-Za-z0-9])"
```

Expected: no matches.

Commit:

```bash
git add wrangler.toml README.md docs/DECISIONS.md
git commit -m "docs: document v1.5 cloudflare deployment"
```

## Task 13: End-To-End Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `README.md`
- Create or update: `docs/browser-harness.md`

- [ ] **Step 1: Run local verification**

Run:

```bash
npm test
npm run build
npm run cf:dev
```

Expected:

- tests pass;
- build passes;
- local Cloudflare Pages runtime starts;
- authenticated local header path can hit `/api/bootstrap`.

- [ ] **Step 2: Run Clawpatch gate**

Run:

```bash
npx clawpatch map --source heuristic
npx clawpatch review --since origin/main --include-dirty
npx clawpatch report
```

Expected:

- no new untriaged blocker for V1.5;
- existing localStorage and AgentMail auth findings are resolved or explicitly replaced by V1.5 cloud architecture findings.

- [ ] **Step 3: Browser verify V1.5**

Use the Browser or Chrome plugin after deployment:

- open `https://expense.mac-tbo.com`;
- verify Cloudflare Access login appears;
- complete allowed-user login;
- verify Inbox, Capture, Detail, Cards, Reports, and Export render on a mobile viewport around 402 by 874;
- verify no console errors;
- verify bottom nav clears the iOS home indicator area.

- [ ] **Step 4: Verify shared data**

Use Mac browser and iPhone browser:

1. create a test Expense Folder on Mac;
2. refresh iPhone and confirm the Expense Folder appears;
3. sync `expense-me@agentmail.to` from iPhone;
4. refresh Mac and confirm imported Expenses appear;
5. edit one Expense on Mac;
6. refresh iPhone and confirm the edit appears;
7. generate an Export Package and download it.

- [ ] **Step 5: Verify migration**

On a browser with V1 localStorage data:

1. open V1.5 after Access login;
2. confirm the import action appears only when cloud data is empty;
3. import local V1 data;
4. refresh and confirm data persists from cloud;
5. confirm V1 local data was not deleted.

- [ ] **Step 6: Verify V1 fallback**

Open:

```text
https://expense-me-tbo.vercel.app
```

Expected:

- app loads independently;
- it is not protected by Cloudflare Access;
- existing V1 local browser behavior remains usable.

- [ ] **Step 7: Final docs update**

Update:

- `README.md`: V1 and V1.5 URLs, Cloudflare setup, validation commands.
- `docs/DECISIONS.md`: actual deployment host and final source-of-truth decision.
- `docs/ROADMAP.md`: mark V1.5 shared-data milestone as delivered only after live verification passes.

- [ ] **Step 8: Final secret scan**

Run:

```bash
git status --short
git diff | rg -n "(TOKEN|SECRET|PASSWORD|PRIVATE KEY|BEGIN [A-Z ]*PRIVATE|AGENTMAIL_API_KEY|CLOUDFLARE_API_TOKEN|sk-[A-Za-z0-9])"
git ls-files | rg "(\\.env$|\\.env\\.|\\.wrangler|dist/|screenshots/|export-package|\\.zip$)"
```

Expected:

- no secret matches in diff;
- no ignored runtime artifacts staged;
- only intended source/docs/config files changed.

- [ ] **Step 9: Final commit**

Run:

```bash
git add README.md docs/DECISIONS.md docs/ROADMAP.md docs/browser-harness.md
git commit -m "docs: record v1.5 verification"
```

## Task 14: Delivery Report

**Files:**
- No code file edits unless verification reveals a defect.

- [ ] **Step 1: Summarize shipped state**

Report:

- V1 URL and status;
- V1.5 URL and status;
- Cloudflare Access status;
- D1/R2 source-of-truth status;
- migration result;
- AgentMail sync result;
- shared-data Mac/iPhone result;
- Export Package result.

- [ ] **Step 2: Include command verification**

Report exact status for:

- `npm test`;
- `npm run build`;
- Clawpatch `map`;
- Clawpatch `review`;
- Clawpatch `report`;
- deployed browser verification;
- Vercel V1 smoke check.

- [ ] **Step 3: State residual risks**

At minimum, call out:

- Cloudflare free-tier usage should be watched after real receipt volume;
- team deployment remains deferred;
- full offline writes remain out of scope for V1.5.

- [ ] **Step 4: Ask before replacing V1**

Do not replace or redirect the Vercel V1 URL. Ask Thiago before any production cutover beyond `expense.mac-tbo.com`.

## Self-Review Checklist

Before starting implementation:

- [ ] Every task preserves V1 on Vercel until explicit acceptance.
- [ ] Every durable mutation goes through the Cloudflare API in V1.5.
- [ ] No V1.5 AgentMail route is unauthenticated.
- [ ] D1 stores structured metadata and R2 stores binary artifacts.
- [ ] LocalStorage is only theme, migration marker, or transient cache.
- [ ] Migration is explicit and does not delete V1 local data.
- [ ] Expense, Expense Folder, and Export Package terminology is preserved.
- [ ] Docs are updated alongside behavior changes.
- [ ] Tests and Clawpatch are part of the delivery gate.
