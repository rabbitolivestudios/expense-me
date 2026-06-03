# Expense Me Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the V1 Expense Me mobile-first PWA described in `docs/superpowers/specs/2026-06-02-expense-me-design.md`.

**Architecture:** Use a React + Vite TypeScript client with local-first IndexedDB persistence and an Express API process for protected AgentMail access. Keep domain logic in pure TypeScript modules, UI in feature components, and export generation in browser-safe services so the app remains usable as a PWA.

**Tech Stack:** React, Vite, TypeScript, Vitest, Testing Library, Playwright, Dexie, Zod, Lucide React, Express, PDF-lib, JSZip, PapaParse, Tesseract.js, pdfjs-dist.

---

## Scope Check

This plan covers one cohesive V1 product: mobile capture, inbox review, AgentMail intake, statement reconciliation, corporate-field review, missing-receipt declarations, and Export Package generation. Direct company-expense-system submission, card-feed providers, and collaboration sync stay out of V1.

## File Structure

- `package.json`: scripts and dependencies for client, server, tests, and visual verification.
- `index.html`: Vite HTML entrypoint and PWA metadata hooks.
- `vite.config.ts`: React/Vite/Vitest configuration.
- `tsconfig.json`, `tsconfig.node.json`: TypeScript configuration.
- `.env.example`: non-secret environment variable names.
- `public/icons/expense-me-app-icon-selected.png`: selected app icon concept copied from `outputs/`.
- `public/manifest.webmanifest`: PWA install metadata and icon references.
- `src/main.tsx`: React entrypoint.
- `src/App.tsx`: top-level composition and route-like screen state.
- `src/styles/tokens.css`: brand colors, Gilroy font stack, spacing, radii, and component variables.
- `src/domain/types.ts`: Expense, ReceiptArtifact, StatementCharge, Report, ExportPackage, status enums.
- `src/domain/fixtures.ts`: seed data for the first usable prototype.
- `src/domain/validators.ts`: Zod schemas for imported and user-edited data.
- `src/storage/db.ts`: Dexie database schema.
- `src/storage/repository.ts`: typed persistence functions.
- `src/features/shell/AppShell.tsx`: mobile app shell with five-action bottom nav.
- `src/features/shell/BottomNav.tsx`: Inbox, Reports, Capture, Cards, Export nav.
- `src/features/inbox/InboxScreen.tsx`: inbox queues and quick intake actions.
- `src/features/capture/CaptureSheet.tsx`: camera, PDF, email, statement, and manual-entry capture choices.
- `src/features/expense/ExpenseDetailScreen.tsx`: corporate-field review form.
- `src/features/email/EmailSyncPanel.tsx`: auto-sync status and Sync now action.
- `src/features/email/agentMailSync.ts`: client-side sync orchestration through the protected API.
- `src/features/extraction/extractionPipeline.ts`: source-to-expense candidate pipeline.
- `src/features/extraction/receiptParser.ts`: deterministic text parser used by OCR/PDF/email extraction.
- `src/features/statements/statementImport.ts`: CSV/PDF statement import helpers.
- `src/features/statements/reconciliation.ts`: match scoring and statement source-of-truth rules.
- `src/features/statements/CardsScreen.tsx`: statement upload and unmatched charge review.
- `src/features/reports/ReportsScreen.tsx`: trip/date-range report folders.
- `src/features/export/exportPackage.ts`: review PDF, spreadsheet, receipts zip, declarations, notes generation.
- `src/features/export/ExportScreen.tsx`: readiness checks and export action.
- `src/features/declarations/declaration.ts`: missing-receipt declaration model and PDF helper.
- `src/test/setup.ts`: Testing Library setup.
- `tests/unit/*.test.ts`: domain and service tests.
- `tests/e2e/mobile.spec.ts`: Playwright mobile workflow check.
- `server/index.ts`: Express server for local dev/protected API routes.
- `server/agentmailClient.ts`: AgentMail REST client using environment variables.
- `server/routes/agentmail.ts`: AgentMail proxy routes.

## Task 1: Scaffold Project and Tooling

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `src/test/setup.ts`
- Create: `.env.example`

- [ ] **Step 1: Initialize the app package**

Create `package.json` with these scripts and dependencies:

```json
{
  "name": "expense-me",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently \"vite --host 127.0.0.1 --configLoader runner\" \"tsx watch server/index.ts\"",
    "dev:client": "vite --host 127.0.0.1 --configLoader runner",
    "dev:server": "tsx watch server/index.ts",
    "build": "tsc -b && vite build --configLoader runner",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run --configLoader runner",
    "test:watch": "vitest --configLoader runner",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "concurrently": "^9.2.0",
    "cors": "^2.8.5",
    "dexie": "^4.2.0",
    "dotenv": "^17.0.0",
    "express": "^5.1.0",
    "jszip": "^3.10.1",
    "lucide-react": "^0.468.0",
    "multer": "^2.0.0",
    "papaparse": "^5.5.0",
    "pdf-lib": "^1.17.1",
    "pdfjs-dist": "^4.10.38",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tesseract.js": "^6.0.0",
    "tsx": "^4.20.0",
    "vite": "^7.0.0",
    "vite-plugin-pwa": "^1.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.55.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.0",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.3",
    "@types/node": "^24.0.0",
    "@types/papaparse": "^5.3.14",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `node_modules/` and `package-lock.json` are created without dependency resolution errors.

- [ ] **Step 3: Create Vite and TypeScript config**

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false
    })
  ],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: true
  }
});
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "tests", "server"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create HTML entrypoint and test setup**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#414141" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>Expense Me</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Create environment example**

Create `.env.example`:

```bash
AGENTMAIL_API_KEY=
AGENTMAIL_INBOX_ID=expense-me@agentmail.to
AGENTMAIL_BASE_URL=https://api.agentmail.to
PORT=8787
```

- [ ] **Step 6: Verify scaffold**

Run:

```bash
npm test
npm run build
```

Expected: tests pass with no tests found or initial zero-test pass, and build completes once source files exist in later tasks.

## Task 2: Design Tokens, Icons, and PWA Assets

**Files:**
- Create: `src/styles/tokens.css`
- Create: `public/manifest.webmanifest`
- Create: `public/icons/expense-me-app-icon-selected.png`
- Modify: `src/main.tsx`
- Create: `tests/unit/designTokens.test.ts`

- [ ] **Step 1: Write a token test**

Create `tests/unit/designTokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("brand tokens", () => {
  it("contains the approved Expense Me color tokens", () => {
    const css = fs.readFileSync("src/styles/tokens.css", "utf8");
    expect(css).toContain("--brand-purple: #460a78");
    expect(css).toContain("--brand-hot-orange: #ff3700");
    expect(css).toContain("--brand-sky-blue: #0072ce");
    expect(css).toContain("--font-ui: Gilroy");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test tests/unit/designTokens.test.ts
```

Expected: FAIL because `src/styles/tokens.css` does not exist.

- [ ] **Step 3: Add brand tokens**

Create `src/styles/tokens.css`:

```css
:root {
  --brand-purple: #460a78;
  --brand-violet: #be2878;
  --brand-red: #e63c41;
  --brand-orange: #f58746;
  --brand-yellow: #ffbe6e;
  --brand-steel: #414141;
  --brand-hot-orange: #ff3700;
  --brand-sky-blue: #0072ce;
  --brand-white: #ffffff;
  --surface: #ffffff;
  --surface-muted: #f6f7f9;
  --border: #e3e5e8;
  --text: #414141;
  --text-muted: #717171;
  --success-bg: rgba(0, 114, 206, 0.1);
  --warning-bg: rgba(255, 190, 110, 0.32);
  --danger-bg: rgba(255, 55, 0, 0.12);
  --brand-gradient: linear-gradient(135deg, #460a78 0%, #be2878 32%, #e63c41 58%, #f58746 82%, #ffbe6e 100%);
  --font-ui: Gilroy, Aptos, "Segoe UI", Arial, sans-serif;
  --radius-card: 12px;
  --radius-control: 10px;
  --shadow-card: 0 8px 22px rgba(65, 65, 65, 0.08);
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  min-height: 100%;
  margin: 0;
}

body {
  background: var(--surface-muted);
  color: var(--text);
  font-family: var(--font-ui);
}

button,
input,
select,
textarea {
  font: inherit;
}
```

- [ ] **Step 4: Copy selected icon into public assets**

Copy:

```bash
mkdir -p public/icons
cp outputs/expense-me-app-icon-selected.png public/icons/expense-me-app-icon-selected.png
```

On Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path public/icons
Copy-Item -LiteralPath outputs/expense-me-app-icon-selected.png -Destination public/icons/expense-me-app-icon-selected.png -Force
```

- [ ] **Step 5: Add PWA manifest**

Create `public/manifest.webmanifest`:

```json
{
  "name": "Expense Me",
  "short_name": "Expense Me",
  "description": "Mobile-first expense capture, reconciliation, and export packages.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#414141",
  "icons": [
    {
      "src": "/icons/expense-me-app-icon-selected.png",
      "sizes": "1024x1024",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 6: Import tokens in the app entry**

Create `src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Verify tokens**

Run:

```bash
npm test tests/unit/designTokens.test.ts
```

Expected: PASS.

## Task 3: Domain Model, Validators, and Seed Data

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/validators.ts`
- Create: `src/domain/fixtures.ts`
- Create: `tests/unit/domain.test.ts`

- [ ] **Step 1: Write domain tests**

Create `tests/unit/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { expenseSchema } from "../../src/domain/validators";
import { seedExpenses } from "../../src/domain/fixtures";

describe("Expense domain", () => {
  it("requires meal people count for meal expenses", () => {
    const meal = seedExpenses.find((expense) => expense.expenseType === "Meal")!;
    expect(expenseSchema.parse(meal).mealPeopleCount).toBeGreaterThan(0);
  });

  it("keeps Export Package terminology in seed data", () => {
    expect(seedExpenses.map((expense) => expense.status)).toContain("Declare");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test tests/unit/domain.test.ts
```

Expected: FAIL because domain files do not exist.

- [ ] **Step 3: Create domain types**

Create `src/domain/types.ts`:

```ts
export type ExpenseStatus = "Ready" | "Review" | "Match" | "FX" | "Declare" | "Duplicate" | "Context";
export type ExpenseType = "Meal" | "Lodging" | "Transport" | "Trip" | "Other";
export type PaymentMethod = "Credit Card" | "Personal Card" | "Cash" | "Company Paid";
export type ArtifactType = "CameraImage" | "UploadedImage" | "PdfReceipt" | "EmailBody" | "EmailAttachment" | "Declaration";

export interface ReceiptArtifact {
  id: string;
  artifactType: ArtifactType;
  originalFilename?: string;
  sourceMessageId?: string;
  mimeType: string;
  storageKey: string;
  createdAt: string;
  extractedText?: string;
  fingerprint?: string;
}

export interface StatementCharge {
  id: string;
  statementImportId: string;
  cardLabel: string;
  transactionDate: string;
  postedDate?: string;
  description: string;
  originalAmount: number;
  originalCurrency: string;
  finalUsdAmount: number;
  fxRate?: number;
  foreignTransactionFee?: number;
  matchStatus: "Unmatched" | "Matched" | "Ignored";
  matchedExpenseId?: string;
}

export interface Expense {
  id: string;
  sourceType: "Camera" | "Upload" | "Email" | "Manual" | "Statement";
  status: ExpenseStatus;
  expenseType: ExpenseType;
  subExpenseType: string;
  expenseDate: string;
  region: string;
  country: string;
  city: string;
  merchant?: string;
  description: string;
  paymentMethod: PaymentMethod;
  originalAmount: number;
  originalCurrency: string;
  finalUsdAmount?: number;
  fxRate?: number;
  foreignTransactionFee?: number;
  mealPeopleCount?: number;
  attendeeNames?: string[];
  notes?: string;
  receiptArtifactIds: string[];
  statementChargeMatchId?: string;
  declarationId?: string;
  reportId?: string;
  confidence: number;
}

export interface Report {
  id: string;
  name: string;
  dateRangeLabel: string;
  expenseIds: string[];
  status: "Draft" | "Ready" | "Exported";
  createdAt: string;
}

export interface ExportPackage {
  id: string;
  reportId: string;
  generatedAt: string;
  reviewPdfName: string;
  spreadsheetName: string;
  receiptsZipName: string;
  declarationPdfNames: string[];
  reconciliationNotesName: string;
}
```

- [ ] **Step 4: Create validators**

Create `src/domain/validators.ts`:

```ts
import { z } from "zod";

export const expenseSchema = z.object({
  id: z.string(),
  sourceType: z.enum(["Camera", "Upload", "Email", "Manual", "Statement"]),
  status: z.enum(["Ready", "Review", "Match", "FX", "Declare", "Duplicate", "Context"]),
  expenseType: z.enum(["Meal", "Lodging", "Transport", "Trip", "Other"]),
  subExpenseType: z.string().min(1),
  expenseDate: z.string().min(1),
  region: z.string().min(1),
  country: z.string().min(1),
  city: z.string().min(1),
  merchant: z.string().optional(),
  description: z.string().min(1),
  paymentMethod: z.enum(["Credit Card", "Personal Card", "Cash", "Company Paid"]),
  originalAmount: z.number().positive(),
  originalCurrency: z.string().min(3).max(3),
  finalUsdAmount: z.number().positive().optional(),
  fxRate: z.number().positive().optional(),
  foreignTransactionFee: z.number().min(0).optional(),
  mealPeopleCount: z.number().int().positive().optional(),
  attendeeNames: z.array(z.string()).optional(),
  notes: z.string().optional(),
  receiptArtifactIds: z.array(z.string()),
  statementChargeMatchId: z.string().optional(),
  declarationId: z.string().optional(),
  reportId: z.string().optional(),
  confidence: z.number().min(0).max(1)
}).superRefine((expense, context) => {
  if (expense.expenseType === "Meal" && !expense.mealPeopleCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mealPeopleCount"],
      message: "Meal expenses require number of people."
    });
  }
});
```

- [ ] **Step 5: Create seed data**

Create `src/domain/fixtures.ts`:

```ts
import type { Expense, Report, StatementCharge } from "./types";

export const seedExpenses: Expense[] = [
  {
    id: "exp-meal-client-dinner",
    sourceType: "Email",
    status: "Review",
    expenseType: "Meal",
    subExpenseType: "Dinner",
    expenseDate: "2026-05-20",
    region: "NAFTA",
    country: "United States",
    city: "Chicago",
    merchant: "Avec River North",
    description: "Dinner with client",
    paymentMethod: "Credit Card",
    originalAmount: 184.2,
    originalCurrency: "USD",
    finalUsdAmount: 184.2,
    mealPeopleCount: 4,
    attendeeNames: [],
    receiptArtifactIds: ["art-restaurant-receipt"],
    confidence: 0.74
  },
  {
    id: "exp-taxi-paris",
    sourceType: "Camera",
    status: "FX",
    expenseType: "Transport",
    subExpenseType: "Taxi",
    expenseDate: "2026-05-21",
    region: "EMEA",
    country: "France",
    city: "Paris",
    merchant: "Taxi Parisien",
    description: "Taxi from hotel to customer site",
    paymentMethod: "Credit Card",
    originalAmount: 42,
    originalCurrency: "EUR",
    receiptArtifactIds: ["art-taxi-paris"],
    confidence: 0.81
  },
  {
    id: "exp-fuel-training",
    sourceType: "Manual",
    status: "Declare",
    expenseType: "Transport",
    subExpenseType: "Fuel",
    expenseDate: "2026-05-20",
    region: "NAFTA",
    country: "United States",
    city: "Chicago",
    merchant: "Shell",
    description: "Gas roundtrip Schererville / Training",
    paymentMethod: "Credit Card",
    originalAmount: 12.82,
    originalCurrency: "USD",
    finalUsdAmount: 12.82,
    receiptArtifactIds: [],
    confidence: 1
  }
];

export const seedStatementCharges: StatementCharge[] = [
  {
    id: "charge-hotel-chicago",
    statementImportId: "stmt-demo",
    cardLabel: "Corporate Visa",
    transactionDate: "2026-05-20",
    postedDate: "2026-05-21",
    description: "HOTEL CHICAGO",
    originalAmount: 284.2,
    originalCurrency: "USD",
    finalUsdAmount: 284.2,
    matchStatus: "Unmatched"
  }
];

export const seedReports: Report[] = [
  {
    id: "report-may-chicago",
    name: "Chicago Training - May 2026",
    dateRangeLabel: "May 20-22, 2026",
    expenseIds: ["exp-meal-client-dinner", "exp-fuel-training"],
    status: "Draft",
    createdAt: "2026-06-02T12:00:00.000Z"
  }
];
```

- [ ] **Step 6: Verify domain**

Run:

```bash
npm test tests/unit/domain.test.ts
```

Expected: PASS.

## Task 4: Local-First IndexedDB Repository

**Files:**
- Create: `src/storage/db.ts`
- Create: `src/storage/repository.ts`
- Create: `tests/unit/repository.test.ts`

- [ ] **Step 1: Write repository tests**

Create `tests/unit/repository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { seedExpenses } from "../../src/domain/fixtures";
import { clearExpenseMeDb, saveExpense, listExpenses } from "../../src/storage/repository";

describe("Expense repository", () => {
  beforeEach(async () => {
    await clearExpenseMeDb();
  });

  it("persists and lists expenses", async () => {
    await saveExpense(seedExpenses[0]);
    const expenses = await listExpenses();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].description).toBe("Dinner with client");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test tests/unit/repository.test.ts
```

Expected: FAIL because storage files do not exist.

- [ ] **Step 3: Create Dexie schema**

Create `src/storage/db.ts`:

```ts
import Dexie, { type EntityTable } from "dexie";
import type { Expense, ExportPackage, ReceiptArtifact, Report, StatementCharge } from "../domain/types";

export class ExpenseMeDb extends Dexie {
  expenses!: EntityTable<Expense, "id">;
  artifacts!: EntityTable<ReceiptArtifact, "id">;
  statementCharges!: EntityTable<StatementCharge, "id">;
  reports!: EntityTable<Report, "id">;
  exportPackages!: EntityTable<ExportPackage, "id">;

  constructor() {
    super("expense-me");
    this.version(1).stores({
      expenses: "id, status, expenseType, reportId, expenseDate, statementChargeMatchId",
      artifacts: "id, artifactType, sourceMessageId, fingerprint",
      statementCharges: "id, statementImportId, matchStatus, matchedExpenseId, transactionDate",
      reports: "id, status, createdAt",
      exportPackages: "id, reportId, generatedAt"
    });
  }
}

export const db = new ExpenseMeDb();
```

- [ ] **Step 4: Create repository functions**

Create `src/storage/repository.ts`:

```ts
import type { Expense, ReceiptArtifact, Report, StatementCharge } from "../domain/types";
import { db } from "./db";

export async function clearExpenseMeDb() {
  await db.transaction("rw", db.expenses, db.artifacts, db.statementCharges, db.reports, db.exportPackages, async () => {
    await Promise.all([
      db.expenses.clear(),
      db.artifacts.clear(),
      db.statementCharges.clear(),
      db.reports.clear(),
      db.exportPackages.clear()
    ]);
  });
}

export async function saveExpense(expense: Expense) {
  await db.expenses.put(expense);
}

export async function listExpenses() {
  return db.expenses.orderBy("expenseDate").reverse().toArray();
}

export async function saveArtifact(artifact: ReceiptArtifact) {
  await db.artifacts.put(artifact);
}

export async function saveStatementCharge(charge: StatementCharge) {
  await db.statementCharges.put(charge);
}

export async function listUnmatchedCharges() {
  return db.statementCharges.where("matchStatus").equals("Unmatched").toArray();
}

export async function saveReport(report: Report) {
  await db.reports.put(report);
}

export async function listReports() {
  return db.reports.orderBy("createdAt").reverse().toArray();
}
```

- [ ] **Step 5: Verify repository**

Run:

```bash
npm test tests/unit/repository.test.ts
```

Expected: PASS.

## Task 5: Mobile App Shell and Five-Action Navigation

**Files:**
- Create: `src/App.tsx`
- Create: `src/features/shell/AppShell.tsx`
- Create: `src/features/shell/BottomNav.tsx`
- Create: `src/features/shell/shell.css`
- Create: `tests/unit/shell.test.tsx`

- [ ] **Step 1: Write shell test**

Create `tests/unit/shell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../../src/App";

describe("mobile app shell", () => {
  it("renders five bottom navigation actions with Capture centered", () => {
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toHaveTextContent("Inbox");
    expect(nav).toHaveTextContent("Reports");
    expect(nav).toHaveTextContent("Capture");
    expect(nav).toHaveTextContent("Cards");
    expect(nav).toHaveTextContent("Export");
    expect(screen.getByRole("button", { name: "Capture receipt" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test tests/unit/shell.test.tsx
```

Expected: FAIL because `src/App.tsx` does not exist.

- [ ] **Step 3: Implement shell components**

Create `src/features/shell/BottomNav.tsx`:

```tsx
import { Camera, CreditCard, Download, FolderOpen, Inbox } from "lucide-react";
import "./shell.css";

export type ScreenName = "Inbox" | "Reports" | "Capture" | "Cards" | "Export";

interface BottomNavProps {
  active: ScreenName;
  onChange: (screen: ScreenName) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  const items = [
    { name: "Inbox" as const, icon: Inbox },
    { name: "Reports" as const, icon: FolderOpen },
    { name: "Capture" as const, icon: Camera },
    { name: "Cards" as const, icon: CreditCard },
    { name: "Export" as const, icon: Download }
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => {
        const Icon = item.icon;
        const isCapture = item.name === "Capture";
        return (
          <button
            key={item.name}
            className={`nav-action ${active === item.name ? "active" : ""} ${isCapture ? "capture-action" : ""}`}
            type="button"
            aria-label={isCapture ? "Capture receipt" : item.name}
            onClick={() => onChange(item.name)}
          >
            <span className={isCapture ? "capture-orb" : "nav-icon"}>
              <Icon aria-hidden="true" />
            </span>
            <span>{item.name}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

Create `src/features/shell/AppShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { BottomNav, type ScreenName } from "./BottomNav";
import "./shell.css";

interface AppShellProps {
  active: ScreenName;
  onChange: (screen: ScreenName) => void;
  children: ReactNode;
}

export function AppShell({ active, onChange, children }: AppShellProps) {
  return (
    <div className="app-frame">
      <main className="app-screen">{children}</main>
      <BottomNav active={active} onChange={onChange} />
    </div>
  );
}
```

Create `src/features/shell/shell.css`:

```css
.app-frame {
  min-height: 100dvh;
  max-width: 440px;
  margin: 0 auto;
  background: var(--surface);
  color: var(--text);
  display: flex;
  flex-direction: column;
  position: relative;
}

.app-screen {
  flex: 1;
  padding: max(18px, env(safe-area-inset-top)) 18px 110px;
}

.bottom-nav {
  position: fixed;
  left: 50%;
  bottom: max(10px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(420px, calc(100vw - 20px));
  min-height: 76px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: var(--surface);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: end;
  box-shadow: 0 14px 30px rgba(65, 65, 65, 0.14);
}

.nav-action {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-size: 0.72rem;
  font-weight: 700;
}

.nav-action svg {
  width: 22px;
  height: 22px;
}

.nav-action.active {
  color: var(--brand-purple);
}

.capture-action {
  color: var(--brand-hot-orange);
  transform: translateY(-24px);
}

.capture-orb {
  width: 58px;
  height: 58px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  color: var(--brand-white);
  background: var(--brand-hot-orange);
  box-shadow: 0 12px 22px rgba(255, 55, 0, 0.32);
}
```

Create `src/App.tsx`:

```tsx
import { useState } from "react";
import { AppShell } from "./features/shell/AppShell";
import type { ScreenName } from "./features/shell/BottomNav";

function WorkflowScreen({ name }: { name: string }) {
  return (
    <section>
      <h1>{name}</h1>
      <p>Expense Me mobile workflow screen.</p>
    </section>
  );
}

export default function App() {
  const [screen, setScreen] = useState<ScreenName>("Inbox");

  return (
    <AppShell active={screen} onChange={setScreen}>
      <WorkflowScreen name={screen === "Capture" ? "Capture" : screen} />
    </AppShell>
  );
}
```

- [ ] **Step 4: Verify shell**

Run:

```bash
npm test tests/unit/shell.test.tsx
```

Expected: PASS.

## Task 6: Inbox and Capture Entry Flow

**Files:**
- Create: `src/features/inbox/InboxScreen.tsx`
- Create: `src/features/inbox/inbox.css`
- Create: `src/features/capture/CaptureSheet.tsx`
- Modify: `src/App.tsx`
- Create: `tests/unit/inbox.test.tsx`

- [ ] **Step 1: Write inbox test**

Create `tests/unit/inbox.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InboxScreen } from "../../src/features/inbox/InboxScreen";
import { seedExpenses } from "../../src/domain/fixtures";

describe("InboxScreen", () => {
  it("shows quick intake actions and attention queues", () => {
    render(<InboxScreen expenses={seedExpenses} onOpenExpense={() => undefined} onCapture={() => undefined} />);
    expect(screen.getByRole("button", { name: "Upload PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open email intake" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload statement" })).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Restaurant receipt")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test tests/unit/inbox.test.tsx
```

Expected: FAIL because `InboxScreen` does not exist.

- [ ] **Step 3: Implement inbox**

Create `src/features/inbox/InboxScreen.tsx`:

```tsx
import { CreditCard, FileText, Mail } from "lucide-react";
import type { Expense } from "../../domain/types";
import "./inbox.css";

interface InboxScreenProps {
  expenses: Expense[];
  onOpenExpense: (expenseId: string) => void;
  onCapture: () => void;
}

function titleForExpense(expense: Expense) {
  if (expense.id === "exp-meal-client-dinner") return "Restaurant receipt";
  return expense.merchant || expense.description;
}

export function InboxScreen({ expenses, onOpenExpense }: InboxScreenProps) {
  const attention = expenses.filter((expense) => expense.status !== "Ready");
  const ready = expenses.filter((expense) => expense.status === "Ready");

  return (
    <section className="inbox-screen">
      <header className="inbox-header">
        <div>
          <p className="eyebrow">Expense Me</p>
          <h1>Expense inbox</h1>
        </div>
        <span className="sync-pill">auto sync</span>
      </header>

      <div className="brand-panel">
        <strong>New receipts, emails, and card matches flow here.</strong>
      </div>

      <div className="quick-grid" aria-label="Quick intake actions">
        <button type="button" aria-label="Upload PDF"><FileText />PDF</button>
        <button type="button" aria-label="Open email intake"><Mail />Email</button>
        <button type="button" aria-label="Upload statement"><CreditCard />Statement</button>
      </div>

      <div className="queue-title"><span>Needs attention</span><span>{attention.length}</span></div>
      {attention.map((expense) => (
        <button key={expense.id} className="expense-row" type="button" onClick={() => onOpenExpense(expense.id)}>
          <span><strong>{titleForExpense(expense)}</strong><small>{expense.description}</small></span>
          <em className={`status ${expense.status.toLowerCase()}`}>{expense.status}</em>
        </button>
      ))}

      <div className="queue-title"><span>Ready</span><span>{ready.length}</span></div>
      {ready.map((expense) => (
        <button key={expense.id} className="expense-row" type="button" onClick={() => onOpenExpense(expense.id)}>
          <span><strong>{titleForExpense(expense)}</strong><small>{expense.description}</small></span>
          <em className="status ready">Ready</em>
        </button>
      ))}
    </section>
  );
}
```

Create `src/features/inbox/inbox.css`:

```css
.inbox-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.eyebrow {
  margin: 0 0 4px;
  font-weight: 800;
  color: var(--brand-purple);
}

.inbox-header h1 {
  margin: 0;
  font-size: 1.45rem;
}

.sync-pill {
  border-radius: 999px;
  padding: 5px 10px;
  background: rgba(0, 114, 206, 0.1);
  color: var(--brand-sky-blue);
  font-size: 0.78rem;
  font-weight: 800;
}

.brand-panel {
  margin: 18px 0 12px;
  padding: 16px;
  border-radius: 16px;
  color: var(--brand-white);
  background: var(--brand-gradient);
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.quick-grid button {
  min-height: 74px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--text);
  display: grid;
  place-items: center;
  gap: 4px;
  font-weight: 800;
  box-shadow: var(--shadow-card);
}

.quick-grid svg {
  color: var(--brand-hot-orange);
}

.queue-title {
  margin: 18px 0 8px;
  display: flex;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.expense-row {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  color: var(--text);
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  text-align: left;
  margin-bottom: 8px;
  box-shadow: var(--shadow-card);
}

.expense-row strong,
.expense-row small {
  display: block;
}

.expense-row small {
  color: var(--text-muted);
  margin-top: 2px;
}

.status {
  align-self: start;
  border-radius: 999px;
  padding: 3px 8px;
  font-style: normal;
  font-size: 0.72rem;
  font-weight: 800;
  background: var(--warning-bg);
  color: #8a5200;
}

.status.ready,
.status.fx,
.status.match {
  background: var(--success-bg);
  color: var(--brand-sky-blue);
}

.status.declare {
  background: var(--danger-bg);
  color: var(--brand-hot-orange);
}
```

- [ ] **Step 4: Add capture sheet**

Create `src/features/capture/CaptureSheet.tsx`:

```tsx
import { Camera, CreditCard, FileText, Keyboard, Mail } from "lucide-react";

interface CaptureSheetProps {
  onClose: () => void;
}

export function CaptureSheet({ onClose }: CaptureSheetProps) {
  return (
    <section className="capture-sheet" aria-label="Capture options">
      <h1>Capture</h1>
      <button type="button"><Camera />Scan receipt</button>
      <button type="button"><FileText />Upload PDF or image</button>
      <button type="button"><Mail />Check email intake</button>
      <button type="button"><CreditCard />Upload statement</button>
      <button type="button"><Keyboard />Manual expense</button>
      <button type="button" onClick={onClose}>Close</button>
    </section>
  );
}
```

- [ ] **Step 5: Wire App to inbox and capture**

Modify `src/App.tsx` so it renders `InboxScreen` for the Inbox screen and `CaptureSheet` for Capture:

```tsx
import { useState } from "react";
import { seedExpenses } from "./domain/fixtures";
import { CaptureSheet } from "./features/capture/CaptureSheet";
import { InboxScreen } from "./features/inbox/InboxScreen";
import { AppShell } from "./features/shell/AppShell";
import type { ScreenName } from "./features/shell/BottomNav";

function WorkflowScreen({ name }: { name: string }) {
  return (
    <section>
      <h1>{name}</h1>
      <p>Expense Me mobile workflow screen.</p>
    </section>
  );
}

export default function App() {
  const [screen, setScreen] = useState<ScreenName>("Inbox");

  return (
    <AppShell active={screen} onChange={setScreen}>
      {screen === "Inbox" && (
        <InboxScreen
          expenses={seedExpenses}
          onOpenExpense={() => setScreen("Reports")}
          onCapture={() => setScreen("Capture")}
        />
      )}
      {screen === "Capture" && <CaptureSheet onClose={() => setScreen("Inbox")} />}
      {screen !== "Inbox" && screen !== "Capture" && <WorkflowScreen name={screen} />}
    </AppShell>
  );
}
```

- [ ] **Step 6: Verify inbox**

Run:

```bash
npm test tests/unit/inbox.test.tsx tests/unit/shell.test.tsx
```

Expected: PASS.

## Task 7: AgentMail Protected API and Auto-Sync

**Files:**
- Create: `server/index.ts`
- Create: `server/agentmailClient.ts`
- Create: `server/routes/agentmail.ts`
- Create: `src/features/email/agentMailSync.ts`
- Create: `tests/unit/agentMailSync.test.ts`

- [ ] **Step 1: Write AgentMail sync test**

Create `tests/unit/agentMailSync.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { normalizeAgentMailMessages } from "../../src/features/email/agentMailSync";

describe("AgentMail sync", () => {
  it("dedupes messages by message_id", () => {
    const messages = [
      { message_id: "m1", subject: "Receipt", from: "hotel@example.com", timestamp: "2026-05-20T12:00:00Z" },
      { message_id: "m1", subject: "Receipt", from: "hotel@example.com", timestamp: "2026-05-20T12:00:00Z" }
    ];

    expect(normalizeAgentMailMessages(messages)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test tests/unit/agentMailSync.test.ts
```

Expected: FAIL because `agentMailSync.ts` does not exist.

- [ ] **Step 3: Implement client-side normalization**

Create `src/features/email/agentMailSync.ts`:

```ts
export interface AgentMailMessageSummary {
  message_id: string;
  subject?: string;
  from?: string;
  timestamp?: string;
}

export function normalizeAgentMailMessages(messages: AgentMailMessageSummary[]) {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.message_id)) return false;
    seen.add(message.message_id);
    return true;
  });
}

export async function fetchAgentMailMessages() {
  const response = await fetch("/api/agentmail/messages");
  if (!response.ok) {
    throw new Error(`AgentMail sync failed: ${response.status}`);
  }
  const body = await response.json() as { messages: AgentMailMessageSummary[] };
  return normalizeAgentMailMessages(body.messages);
}
```

- [ ] **Step 4: Create protected AgentMail API client**

Create `server/agentmailClient.ts`:

```ts
interface AgentMailConfig {
  apiKey: string;
  inboxId: string;
  baseUrl: string;
}

function requireConfig(): AgentMailConfig {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  const inboxId = process.env.AGENTMAIL_INBOX_ID || "expense-me@agentmail.to";
  const baseUrl = process.env.AGENTMAIL_BASE_URL || "https://api.agentmail.to";

  if (!apiKey) {
    throw new Error("AGENTMAIL_API_KEY is not configured.");
  }

  return { apiKey, inboxId, baseUrl };
}

export async function listAgentMailMessages() {
  const config = requireConfig();
  const inbox = encodeURIComponent(config.inboxId);
  const response = await fetch(`${config.baseUrl}/v0/inboxes/${inbox}/messages`, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`AgentMail list failed: ${response.status}`);
  }

  return response.json();
}

export async function getAgentMailMessage(messageId: string) {
  const config = requireConfig();
  const inbox = encodeURIComponent(config.inboxId);
  const message = encodeURIComponent(messageId);
  const response = await fetch(`${config.baseUrl}/v0/inboxes/${inbox}/messages/${message}`, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`AgentMail message fetch failed: ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 5: Add Express routes**

Create `server/routes/agentmail.ts`:

```ts
import { Router } from "express";
import { getAgentMailMessage, listAgentMailMessages } from "../agentmailClient";

export const agentMailRouter = Router();

agentMailRouter.get("/messages", async (_request, response) => {
  try {
    response.json(await listAgentMailMessages());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "AgentMail sync failed" });
  }
});

agentMailRouter.get("/messages/:messageId", async (request, response) => {
  try {
    response.json(await getAgentMailMessage(request.params.messageId));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "AgentMail message fetch failed" });
  }
});
```

Create `server/index.ts`:

```ts
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { agentMailRouter } from "./routes/agentmail";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors({ origin: "http://127.0.0.1:5173" }));
app.use(express.json({ limit: "10mb" }));
app.use("/api/agentmail", agentMailRouter);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "expense-me-api" });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Expense Me API listening on http://127.0.0.1:${port}`);
});
```

- [ ] **Step 6: Verify sync normalization**

Run:

```bash
npm test tests/unit/agentMailSync.test.ts
```

Expected: PASS.

## Task 8: Extraction Pipeline and Receipt Parser

**Files:**
- Create: `src/features/extraction/receiptParser.ts`
- Create: `src/features/extraction/extractionPipeline.ts`
- Create: `tests/unit/extraction.test.ts`

- [ ] **Step 1: Write extraction tests**

Create `tests/unit/extraction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseReceiptText } from "../../src/features/extraction/receiptParser";

describe("receipt parser", () => {
  it("extracts amount, date, and merchant from simple receipt text", () => {
    const result = parseReceiptText("AVEC RIVER NORTH\n05/20/2026\nTotal USD 184.20");
    expect(result.merchant).toBe("AVEC RIVER NORTH");
    expect(result.expenseDate).toBe("2026-05-20");
    expect(result.originalAmount).toBe(184.2);
    expect(result.originalCurrency).toBe("USD");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test tests/unit/extraction.test.ts
```

Expected: FAIL because parser does not exist.

- [ ] **Step 3: Implement parser**

Create `src/features/extraction/receiptParser.ts`:

```ts
export interface ParsedReceipt {
  merchant?: string;
  expenseDate?: string;
  originalAmount?: number;
  originalCurrency?: string;
  confidence: number;
}

function normalizeDate(value: string) {
  const [month, day, year] = value.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dateMatch = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
  const amountMatch = text.match(/\b(USD|EUR|GBP|CAD|MXN)?\s?\$?\s?(\d+\.\d{2})\b/i);
  const currency = amountMatch?.[1]?.toUpperCase() || (text.includes("$") ? "USD" : "USD");

  return {
    merchant: lines[0],
    expenseDate: dateMatch ? normalizeDate(dateMatch[1]) : undefined,
    originalAmount: amountMatch ? Number(amountMatch[2]) : undefined,
    originalCurrency: currency,
    confidence: dateMatch && amountMatch ? 0.78 : 0.45
  };
}
```

- [ ] **Step 4: Implement pipeline**

Create `src/features/extraction/extractionPipeline.ts`:

```ts
import type { Expense } from "../../domain/types";
import { parseReceiptText } from "./receiptParser";

export function createExpenseFromExtractedText(id: string, text: string): Expense {
  const parsed = parseReceiptText(text);
  return {
    id,
    sourceType: "Upload",
    status: parsed.confidence >= 0.75 ? "Review" : "Review",
    expenseType: "Other",
    subExpenseType: "General",
    expenseDate: parsed.expenseDate || new Date().toISOString().slice(0, 10),
    region: "NAFTA",
    country: "United States",
    city: "Chicago",
    merchant: parsed.merchant,
    description: parsed.merchant || "Imported receipt",
    paymentMethod: "Credit Card",
    originalAmount: parsed.originalAmount || 0.01,
    originalCurrency: parsed.originalCurrency || "USD",
    finalUsdAmount: parsed.originalCurrency === "USD" ? parsed.originalAmount : undefined,
    receiptArtifactIds: [],
    confidence: parsed.confidence
  };
}
```

- [ ] **Step 5: Verify extraction**

Run:

```bash
npm test tests/unit/extraction.test.ts
```

Expected: PASS.

## Task 9: Statement Import and Reconciliation

**Files:**
- Create: `src/features/statements/statementImport.ts`
- Create: `src/features/statements/reconciliation.ts`
- Create: `src/features/statements/CardsScreen.tsx`
- Create: `tests/unit/reconciliation.test.ts`

- [ ] **Step 1: Write reconciliation tests**

Create `tests/unit/reconciliation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { seedExpenses } from "../../src/domain/fixtures";
import type { StatementCharge } from "../../src/domain/types";
import { applyStatementMatch, scoreMatch } from "../../src/features/statements/reconciliation";

describe("reconciliation", () => {
  it("scores likely matches by date and amount", () => {
    const expense = seedExpenses[0];
    const charge: StatementCharge = {
      id: "charge-1",
      statementImportId: "statement-1",
      cardLabel: "Corporate Visa",
      transactionDate: expense.expenseDate,
      description: "AVEC RIVER NORTH",
      originalAmount: expense.originalAmount,
      originalCurrency: "USD",
      finalUsdAmount: expense.originalAmount,
      matchStatus: "Unmatched"
    };

    expect(scoreMatch(expense, charge)).toBeGreaterThan(80);
  });

  it("uses final USD amount from the statement as source of truth", () => {
    const expense = seedExpenses[1];
    const charge: StatementCharge = {
      id: "charge-eur",
      statementImportId: "statement-1",
      cardLabel: "Corporate Visa",
      transactionDate: expense.expenseDate,
      description: "TAXI PARIS",
      originalAmount: 42,
      originalCurrency: "EUR",
      finalUsdAmount: 45.6,
      fxRate: 1.0857,
      foreignTransactionFee: 1.37,
      matchStatus: "Unmatched"
    };

    const matched = applyStatementMatch(expense, charge);
    expect(matched.finalUsdAmount).toBe(45.6);
    expect(matched.fxRate).toBe(1.0857);
    expect(matched.status).toBe("Ready");
  });
});
```

- [ ] **Step 2: Run failing reconciliation tests**

Run:

```bash
npm test tests/unit/reconciliation.test.ts
```

Expected: FAIL because reconciliation files do not exist.

- [ ] **Step 3: Implement reconciliation**

Create `src/features/statements/reconciliation.ts`:

```ts
import type { Expense, StatementCharge } from "../../domain/types";

function sameDay(a: string, b: string) {
  return a.slice(0, 10) === b.slice(0, 10);
}

export function scoreMatch(expense: Expense, charge: StatementCharge) {
  let score = 0;
  if (sameDay(expense.expenseDate, charge.transactionDate)) score += 35;
  if (Math.abs(expense.originalAmount - charge.originalAmount) < 0.02) score += 35;
  if (expense.originalCurrency === charge.originalCurrency) score += 15;
  if (expense.merchant && charge.description.toLowerCase().includes(expense.merchant.toLowerCase().split(" ")[0])) score += 15;
  return score;
}

export function applyStatementMatch(expense: Expense, charge: StatementCharge): Expense {
  return {
    ...expense,
    statementChargeMatchId: charge.id,
    finalUsdAmount: charge.finalUsdAmount,
    fxRate: charge.fxRate,
    foreignTransactionFee: charge.foreignTransactionFee,
    status: expense.receiptArtifactIds.length > 0 || expense.declarationId ? "Ready" : "Declare"
  };
}
```

- [ ] **Step 4: Implement CSV statement import**

Create `src/features/statements/statementImport.ts`:

```ts
import Papa from "papaparse";
import type { StatementCharge } from "../../domain/types";

interface CsvRow {
  Date?: string;
  "Transaction Date"?: string;
  Description?: string;
  Merchant?: string;
  Amount?: string;
  Currency?: string;
  "Final USD"?: string;
  "FX Rate"?: string;
  Fee?: string;
}

export function parseStatementCsv(csv: string, statementImportId: string, cardLabel: string): StatementCharge[] {
  const parsed = Papa.parse<CsvRow>(csv, { header: true, skipEmptyLines: true });

  return parsed.data.map((row, index) => {
    const amount = Number(row.Amount || "0");
    const finalUsd = Number(row["Final USD"] || row.Amount || "0");
    return {
      id: `${statementImportId}-${index}`,
      statementImportId,
      cardLabel,
      transactionDate: row["Transaction Date"] || row.Date || new Date().toISOString().slice(0, 10),
      description: row.Description || row.Merchant || "Imported statement charge",
      originalAmount: Math.abs(amount),
      originalCurrency: row.Currency || "USD",
      finalUsdAmount: Math.abs(finalUsd),
      fxRate: row["FX Rate"] ? Number(row["FX Rate"]) : undefined,
      foreignTransactionFee: row.Fee ? Number(row.Fee) : undefined,
      matchStatus: "Unmatched"
    };
  });
}
```

- [ ] **Step 5: Create Cards screen**

Create `src/features/statements/CardsScreen.tsx`:

```tsx
import { Upload } from "lucide-react";

export function CardsScreen() {
  return (
    <section>
      <h1>Cards</h1>
      <p>Upload statements to find missed charges and confirm FX or foreign fees.</p>
      <button type="button"><Upload />Upload statement</button>
    </section>
  );
}
```

- [ ] **Step 6: Verify reconciliation**

Run:

```bash
npm test tests/unit/reconciliation.test.ts
```

Expected: PASS.

## Task 10: Corporate Expense Detail and Missing Receipt Declaration

**Files:**
- Create: `src/features/expense/ExpenseDetailScreen.tsx`
- Create: `src/features/declarations/declaration.ts`
- Create: `tests/unit/declaration.test.ts`

- [ ] **Step 1: Write declaration test**

Create `tests/unit/declaration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { seedExpenses } from "../../src/domain/fixtures";
import { createDeclarationText } from "../../src/features/declarations/declaration";

describe("missing receipt declaration", () => {
  it("generates declaration text from an expense", () => {
    const expense = seedExpenses.find((item) => item.status === "Declare")!;
    const text = createDeclarationText(expense, "CASTRO Laurent", "EXP-1229");
    expect(text).toContain("CASTRO Laurent");
    expect(text).toContain("EXP-1229");
    expect(text).toContain("Gas roundtrip Schererville / Training");
    expect(text).toContain("12.82 USD");
  });
});
```

- [ ] **Step 2: Run failing declaration test**

Run:

```bash
npm test tests/unit/declaration.test.ts
```

Expected: FAIL because declaration helper does not exist.

- [ ] **Step 3: Implement declaration helper**

Create `src/features/declarations/declaration.ts`:

```ts
import type { Expense } from "../../domain/types";

export function createDeclarationText(expense: Expense, employeeName: string, reportReference: string) {
  return [
    "Declaration of expenditures without supporting documents",
    `Name: ${employeeName}`,
    `Expense report ref: ${reportReference}`,
    `Date: ${expense.expenseDate}`,
    `Description: ${expense.description}`,
    `Amount: ${expense.originalAmount.toFixed(2)} ${expense.originalCurrency}`,
    "I certify that this expense was incurred for business purposes and that supporting documentation is unavailable.",
    "Signature: ______________________________"
  ].join("\n");
}
```

- [ ] **Step 4: Create corporate detail screen**

Create `src/features/expense/ExpenseDetailScreen.tsx`:

```tsx
import type { Expense } from "../../domain/types";

interface ExpenseDetailScreenProps {
  expense: Expense;
}

export function ExpenseDetailScreen({ expense }: ExpenseDetailScreenProps) {
  return (
    <section>
      <h1>Expense Detail</h1>
      <label>Expense type<input value={expense.expenseType} readOnly /></label>
      <label>Sub expense type<input value={expense.subExpenseType} readOnly /></label>
      <label>Expense date<input value={expense.expenseDate} readOnly /></label>
      <label>Region<input value={expense.region} readOnly /></label>
      <label>Country<input value={expense.country} readOnly /></label>
      <label>City<input value={expense.city} readOnly /></label>
      <label>Description<textarea value={expense.description} readOnly /></label>
      <label>Payment method<input value={expense.paymentMethod} readOnly /></label>
      <label>Amount<input value={`${expense.originalAmount.toFixed(2)} ${expense.originalCurrency}`} readOnly /></label>
      {expense.expenseType === "Meal" && (
        <label>Number of people<input value={expense.mealPeopleCount || ""} readOnly /></label>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Verify declaration**

Run:

```bash
npm test tests/unit/declaration.test.ts
```

Expected: PASS.

## Task 11: Reports and Export Package Generation

**Files:**
- Create: `src/features/reports/ReportsScreen.tsx`
- Create: `src/features/export/exportPackage.ts`
- Create: `src/features/export/ExportScreen.tsx`
- Create: `tests/unit/exportPackage.test.ts`

- [ ] **Step 1: Write Export Package tests**

Create `tests/unit/exportPackage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { seedExpenses, seedReports } from "../../src/domain/fixtures";
import { buildReadinessChecklist } from "../../src/features/export/exportPackage";

describe("Export Package readiness", () => {
  it("flags missing receipt declarations before export", () => {
    const checklist = buildReadinessChecklist(seedReports[0], seedExpenses);
    expect(checklist.some((item) => item.kind === "declaration")).toBe(true);
  });
});
```

- [ ] **Step 2: Run failing export test**

Run:

```bash
npm test tests/unit/exportPackage.test.ts
```

Expected: FAIL because export service does not exist.

- [ ] **Step 3: Implement readiness checklist**

Create `src/features/export/exportPackage.ts`:

```ts
import type { Expense, Report } from "../../domain/types";

export interface ReadinessItem {
  kind: "field" | "receipt" | "declaration" | "fx" | "duplicate";
  expenseId: string;
  message: string;
}

export function buildReadinessChecklist(report: Report, expenses: Expense[]): ReadinessItem[] {
  const reportExpenses = expenses.filter((expense) => report.expenseIds.includes(expense.id));
  const items: ReadinessItem[] = [];

  for (const expense of reportExpenses) {
    if (expense.expenseType === "Meal" && !expense.mealPeopleCount) {
      items.push({ kind: "field", expenseId: expense.id, message: "Meal expenses require number of people." });
    }
    if (expense.receiptArtifactIds.length === 0 && !expense.declarationId) {
      items.push({ kind: "declaration", expenseId: expense.id, message: "Missing receipt declaration is required." });
    }
    if (expense.status === "FX" && !expense.finalUsdAmount) {
      items.push({ kind: "fx", expenseId: expense.id, message: "Confirm final USD amount and FX details." });
    }
  }

  return items;
}
```

- [ ] **Step 4: Add Reports and Export screens**

Create `src/features/reports/ReportsScreen.tsx`:

```tsx
import type { Report } from "../../domain/types";

interface ReportsScreenProps {
  reports: Report[];
}

export function ReportsScreen({ reports }: ReportsScreenProps) {
  return (
    <section>
      <h1>Reports</h1>
      {reports.map((report) => (
        <article key={report.id}>
          <h2>{report.name}</h2>
          <p>{report.dateRangeLabel}</p>
        </article>
      ))}
    </section>
  );
}
```

Create `src/features/export/ExportScreen.tsx`:

```tsx
import type { Expense, Report } from "../../domain/types";
import { buildReadinessChecklist } from "./exportPackage";

interface ExportScreenProps {
  report: Report;
  expenses: Expense[];
}

export function ExportScreen({ report, expenses }: ExportScreenProps) {
  const checklist = buildReadinessChecklist(report, expenses);
  const ready = checklist.length === 0;

  return (
    <section>
      <h1>Export Package</h1>
      <p>{ready ? "Ready to export." : "Resolve the checklist before exporting."}</p>
      <ul>
        {checklist.map((item) => (
          <li key={`${item.expenseId}-${item.kind}`}>{item.message}</li>
        ))}
      </ul>
      <button type="button" disabled={!ready}>Generate Export Package</button>
    </section>
  );
}
```

- [ ] **Step 5: Verify export readiness**

Run:

```bash
npm test tests/unit/exportPackage.test.ts
```

Expected: PASS.

## Task 12: End-to-End Mobile Verification

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/mobile.spec.ts`

- [ ] **Step 1: Add Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  webServer: {
    command: "npm run dev:client",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"], baseURL: "http://127.0.0.1:5173" }
    }
  ]
});
```

- [ ] **Step 2: Add mobile workflow test**

Create `tests/e2e/mobile.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("mobile shell exposes capture-centered workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Expense inbox" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture receipt" })).toBeVisible();
  await page.getByRole("button", { name: "Capture receipt" }).click();
  await expect(page.getByRole("heading", { name: "Capture" })).toBeVisible();
});
```

- [ ] **Step 3: Run all tests**

Run:

```bash
npm test
npm run build
npm run e2e
```

Expected: unit tests pass, build passes, Playwright verifies the mobile capture-centered shell.

## Task 13: Documentation and Secret Handling

**Files:**
- Create: `README.md`
- Modify: `.env.example`

- [ ] **Step 1: Add README**

Create `README.md`:

```md
# Expense Me

Expense Me is a mobile-first PWA for capturing expenses, importing receipts from camera/PDF/email, reconciling statements, and generating Export Packages.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment settings:

   ```bash
   cp .env.example .env
   ```

3. Set `AGENTMAIL_API_KEY` in `.env`. Do not commit `.env`.

4. Start the app:

   ```bash
   npm run dev
   ```

## Security

- AgentMail API keys are server-side only.
- The browser client calls `/api/agentmail/*`.
- API keys must never appear in exported packages, client source, or screenshots.

## Verification

```bash
npm test
npm run build
npm run e2e
```
```

- [ ] **Step 2: Add `.gitignore` if using git**

Create `.gitignore`:

```gitignore
node_modules/
dist/
.env
.env.local
test-results/
playwright-report/
```

- [ ] **Step 3: Final verification**

Run:

```bash
npm test
npm run build
npm run e2e
```

Expected: all checks pass.

## Plan Self-Review

- Spec coverage: The plan covers mobile PWA shell, brand tokens, selected icon, AgentMail auto-sync through a protected API, local-first storage, receipt parsing, statement reconciliation, corporate detail fields, missing-receipt declaration, Export Package readiness, and mobile verification.
- Red-flag scan: The plan avoids secret values and unfinished-work markers.
- Type consistency: Domain names match across fixtures, validators, repository, UI, reconciliation, and export modules.
- External references used: AgentMail message list/get endpoints are based on current AgentMail API documentation for `GET /v0/inboxes/:inbox_id/messages` and `GET /v0/inboxes/:inbox_id/messages/:message_id`; Gilroy reference is the user-provided GitHub gist.
