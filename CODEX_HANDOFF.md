# Codex handoff — finish the Expense Me "Spectrum" build

You are picking up the **Expense Me** app (React 18 + TypeScript + Vite). A design pass called **Spectrum** has already been applied to the source in this repo. Your job is to get it building, passing tests, and running cleanly — then sanity-check the design changes in a real browser.

## What Spectrum changed (already in the code)
A design-layer + light structural pass. Product logic, domain types, storage, extraction, reconciliation, routing and product terms (**Expense → Expense Folder → Export Package**) are unchanged. See `SPECTRUM_CHANGELOG.md` for the full list. Highlights:

- `src/styles/tokens.css` — Manrope (UI) + Geist Mono (figures) + Gilroy (display); Spectrum radii (14/18/22/30px); soft shadows; **light + dark** themes (auto via `prefers-color-scheme`, or `data-theme="dark"|"light"` on `<html>`); themed status hues. All original token names preserved.
- `src/styles/app.css` — full-bleed **gradient hero headers** (`.screen-header`), float cards, filled status chips, plus new structural classes: `.hero-stats`, `.ready-ring`, `.readiness-card`, `.filter-chips`, `.detail-summary`.
- `src/features/shell/shell.css` — frosted-glass floating bottom nav, raised gradient Capture orb, `env(safe-area-inset-*)` edge-to-edge.
- `src/features/inbox/InboxScreen.tsx` — hero now has the readiness **ring + stats**, a **theme toggle**, a **readiness float-card** (calls new `onOpenExport` prop), and **filter chips** over a single filtered list. All prior behavior kept (swipe assign/delete, long-press action sheet, rename, quick folder-create). New props: `onOpenExport`, `theme`, `onToggleTheme`.
- `src/features/expense/ExpenseDetailScreen.tsx` — **Currency is a `<select>`** (ISO codes); **Final USD is read-only and derived** = `originalAmount * fxRate + foreignTransactionFee`; **FX rate** + **Foreign transaction fee** inputs show only for non-USD and clear when USD is chosen; added a **summary hero card**. Validation now requires an FX rate (not a manual Final USD) for foreign expenses.
- `src/components/ReadyRing.tsx` (new), `src/features/shell/useTheme.ts` (new).
- `src/App.tsx` — mounts `useTheme()`, passes `onOpenExport` + `theme` + `onToggleTheme` to `InboxScreen`.
- `src/features/statements/CardsScreen.tsx` — clearer "Unmatched" chip label + `cards-screen` class for mono figures.
- Tests updated: `tests/unit/expenseDetail.test.tsx` (FX-rate-required + derived Final USD = 46.80 for the Paris taxi fixture), `tests/unit/designTokens.test.ts` (now asserts `--font-display: "Gilroy"`).

## Tasks for you
1. **Install & build.** `npm install`, then `npm run dev` (or the repo's dev script). Fix any TypeScript/Vite errors introduced by the edits — likely candidates: the new `onOpenExport`/`theme`/`onToggleTheme` props on `InboxScreen`, the new imports (`./components/ReadyRing`, `./features/shell/useTheme`), and the `ExpenseDetailScreen` changes (currency select, derived `finalUsdAmount`, new `fxRate`/`foreignTransactionFee` inputs). All referenced fields already exist on the `Expense` type.
2. **Run tests.** `npm test`. Make the suite green. The two updated tests above reflect intended new behavior — keep that behavior; fix the code if a test reveals a real bug, otherwise align tests to the new contract only where the requirement legitimately changed.
3. **Type-check.** `tsc --noEmit` (or the repo's typecheck script) must pass. Watch for: unused imports, the `DetailFieldKey` union now including `"fxRate"`, and prop-type mismatches between `App.tsx` and `InboxScreen`.
4. **Fonts.** `tokens.css` imports Gilroy (CDN `@font-face`) + Manrope/Geist Mono (Google Fonts) via `@import` at the top. If you self-host or need offline builds, replace those two `@import`s with local `@font-face` rules and drop the font files in `public/`. Do not change `--font-display` away from Gilroy (a token test asserts it).
5. **Verify in a real browser, mobile viewport (~402×874):**
   - Inbox: gradient hero with readiness ring + "To review / Ready / In folder" stats; theme toggle flips light/dark and persists; readiness card opens Export; filter chips filter the list; swipe/long-press still work.
   - Detail: summary hero card; Currency dropdown; Final USD read-only and updates live as amount/FX/fee change; FX + fee fields hide when Currency = USD.
   - Cards / Export / Reports: gradient hero; Cards shows mono amounts + "Unmatched"/"Matched" chips; Export shows named readiness blockers with a status accent.
   - Check both light and dark, and that the bottom nav clears the iOS home indicator (safe-area).
6. **Do not** rename product terms, change domain logic, or alter the AgentMail/extraction/reconciliation modules. This is a V1 handoff package; keep the existing data model and storage intact.

## Acceptance
- `npm run dev` serves with no console errors; `npm test` and typecheck pass.
- The six screens render the Spectrum design in light and dark on a phone viewport.
- All previously-working flows (capture, assign, rename, delete, declare, reconcile, export) still function.
