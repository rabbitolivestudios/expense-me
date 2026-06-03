# Expense Me V1 Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Expense Me closer to V1 readiness with mobile inbox actions, stronger Expense Folder flow, clearer Export Package readiness, intake categorization improvements, and review gates.

**Architecture:** Keep the existing React/Vite app structure. Use app-level handlers in `src/App.tsx` for persisted expense/folder state, feature components for UI, and focused domain helpers for export and intake behavior.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, JSZip, lucide-react, Vercel, Clawpatch where available.

---

### Task 1: Inbox Long-Press Action Sheet

**Files:**
- Modify: `src/features/inbox/InboxScreen.tsx`
- Modify: `src/features/inbox/inbox.css`
- Modify: `src/App.tsx`
- Test: `tests/unit/inbox.test.tsx`
- Test: `tests/unit/shell.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests that long-pressing an expense opens an `Expense actions` dialog with assign, rename, and delete buttons; rename updates the expense title; delete still requires confirmation; tap and swipe behaviors still work.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/unit/inbox.test.tsx tests/unit/shell.test.tsx`

Expected: long-press/rename tests fail because the action sheet does not exist yet.

- [ ] **Step 3: Implement minimal behavior**

Add a long-press timer in `InboxScreen`, expose `onRenameExpense`, render the mobile action sheet, and update `App.tsx` to rename `merchant` when present or `description` otherwise.

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/unit/inbox.test.tsx tests/unit/shell.test.tsx`

Expected: tests pass and existing swipe/tap tests remain green.

### Task 2: Expense Folder Quick Create

**Files:**
- Modify: `src/features/inbox/InboxScreen.tsx`
- Modify: `src/features/expense/ExpenseDetailScreen.tsx`
- Modify: `src/App.tsx`
- Test: `tests/unit/shell.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests that a new folder can be created from Inbox assignment and Expense Detail, then selected for the current expense.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/unit/shell.test.tsx`

Expected: quick-create tests fail because only the Folders screen can create folders.

- [ ] **Step 3: Implement quick create**

Return the created folder from `createExpenseFolder`, add `onCreateExpenseFolder`, and wire compact quick-create controls into Inbox assignment and Expense Detail.

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/unit/shell.test.tsx`

Expected: folder quick-create tests pass.

### Task 3: Export Package V1 Quality

**Files:**
- Modify: `src/features/export/ExportScreen.tsx`
- Modify: `src/features/export/exportPackage.ts`
- Modify: `src/App.tsx`
- Modify: `src/features/export/export.css`
- Test: `tests/unit/exportPackage.test.ts`
- Test: `tests/unit/shell.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests that Export lets the user select an Expense Folder, readiness messages include an expense label, and CSV includes company-style evidence details.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/unit/exportPackage.test.ts tests/unit/shell.test.tsx`

Expected: tests fail because Export is fixed to the first folder and readiness messages are vague.

- [ ] **Step 3: Implement export selection and clearer readiness**

Pass all folders into `ExportScreen`, add folder selector, update readiness messages to include expense title/date, and enrich CSV evidence labels.

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/unit/exportPackage.test.ts tests/unit/shell.test.tsx`

Expected: export tests pass.

### Task 4: Intake Intelligence Foundation

**Files:**
- Modify: `src/features/extraction/extractionPipeline.ts`
- Modify: `src/features/statements/reconciliation.ts`
- Test: `tests/unit/extraction.test.ts`
- Test: `tests/unit/reconciliation.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for rail/train, room service/laundry/minibar, toll, tips, registration/training, and drinks/snacks categorization.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/unit/extraction.test.ts tests/unit/reconciliation.test.ts`

Expected: new categorization tests fail.

- [ ] **Step 3: Implement deterministic categories**

Expand keyword classifiers without adding OCR or LLM calls. Keep API keys out of browser code.

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/unit/extraction.test.ts tests/unit/reconciliation.test.ts`

Expected: categorization tests pass.

### Task 5: Review, QA, Commit, Push, Deploy

**Files:**
- Inspect: all modified files
- Possible generated review state: Clawpatch local files, only commit if appropriate and non-secret.

- [ ] **Step 1: Full validation**

Run: `npm test` and `npm run build`.

- [ ] **Step 2: Browser QA**

Use the Browser plugin or local Playwright fallback to verify mobile Inbox long press, folder creation, Export selection, and no runtime errors.

- [ ] **Step 3: Clawpatch review**

Run Clawpatch if available: map, review, report. Manually inspect findings and fix only real V1-scope issues.

- [ ] **Step 4: Final validation**

Re-run `npm test` and `npm run build`.

- [ ] **Step 5: Commit, push, deploy**

Commit with Rabbit Olive Studios author, push to `rabbitolivestudios/expense-me`, deploy production to `https://expense-me-tbo.vercel.app`, and report what changed.
