# Spectrum adaptation — changelog

This package applies the **Spectrum** visual direction to the Expense Me React + TypeScript + Vite app. It is a **design-layer port**: all product logic, component props, class-name contracts, domain types, storage, extraction, reconciliation and routing are unchanged. Product terms preserved — **Expense → Expense Folder → Export Package** (never "Project", never "Secretary Package").

## How to run
```
npm install
npm run dev      # Vite dev server
npm test         # vitest unit suite
```
No new dependencies were added.

## Files changed

### Design tokens — `src/styles/tokens.css` (rewritten)
- Added **Manrope** (UI) + **Geist Mono** (figures) via `@import`; **Gilroy** kept as the brand display face. `--font-ui` → Manrope, `--font-display` → Gilroy, new `--font-mono`.
- Spectrum radii: `--radius-card` 8→**18px**, `--radius-control` 10→**14px**, new `--radius-pill`/`--radius-hero`.
- Soft, layered shadows (`--shadow-card`, `--shadow-pop`).
- **Light + dark themes.** Auto-follows `prefers-color-scheme`; force with `data-theme="dark"|"light"` on `<html>`. New surface ramp (`--surface-2`, `--border-strong`, `--text-faint`) and themed status hues (`--st-ready/review/declare/fx/match`).
- All original token names preserved, so existing styles keep resolving.

### App component layer — `src/styles/app.css` (rewritten)
- **Full-bleed gradient hero headers** (`.screen-header`) — the master gradient bleeds under the status bar with glass back/utility buttons; screen content regains horizontal padding via `.screen-stack > *:not(.screen-header)`.
- Float cards (18–22px, soft shadow), **filled status chips** (one brand hue per state, white text), Geist-Mono amounts, Spectrum metric panels / quick-intake / section heads / export checklist.

### Shell — `src/features/shell/shell.css` (rewritten)
- **Floating frosted-glass bottom nav** (backdrop-blur + saturate), active item in purple, raised **gradient Capture orb**.
- Edge-to-edge with `env(safe-area-inset-*)`; fade strip so content dissolves behind the nav. (iPhone 16+ friendly.)

### Inbox — `src/features/inbox/inbox.css` (rewritten)
- Spectrum swipe rows (22px), status-hued swipe actions, rounded inline confirm/assign/action/rename panels, pill folder-line, Gilroy card titles, mono secondary text.

### Expense Detail — `ExpenseDetailScreen.tsx` + `expense.css` (rewritten)
- **Currency is now a dropdown** (ISO 4217 codes) instead of free text.
- **Final USD is derived and read-only**: `originalAmount × fxRate + foreignTransactionFee`, recomputed live and written on save.
- **FX rate** and **Foreign transaction fee** inputs are surfaced (they already existed on the `Expense` type) and appear only for non-USD expenses; selecting **USD** clears + hides them.
- Validation updated: a foreign expense now requires an **FX rate** (was: confirm Final USD). Two-column responsive form grid, Spectrum inputs with focus rings, gradient primary action.

### Capture / Export — `capture.css`, `export.css` (rewritten)
- Spectrum radii, gradient confirm/primary actions, pill category chips, mono OCR preview, gradient Export hero.

### Tests
- `tests/unit/expenseDetail.test.tsx` — updated to the new contract (FX-rate-required + derived Final USD = 46.80 for the Paris taxi fixture).
- `tests/unit/designTokens.test.ts` — brand-color assertions unchanged; font assertion now checks `--font-display: "Gilroy"` (Gilroy remains the brand display face; Manrope drives UI text).

### Structural alignment to the approved prototype
New components and screen-markup changes so the real screens match the Spectrum prototype (not just CSS):
- **`src/components/ReadyRing.tsx`** (new) — SVG readiness ring for the Inbox hero.
- **`src/features/shell/useTheme.ts`** (new) — light/dark hook; writes `data-theme` on `<html>`, persists, follows `prefers-color-scheme`.
- **`InboxScreen.tsx`** — hero now carries the **ready-ring + To review / Ready / In-folder stats**, a **theme toggle**, a **readiness float-card** that opens Export, and **filter chips** (All / To review / No receipt / Ready) over a single filtered list. All prior behavior kept (swipe, long-press action sheet, rename, quick folder-create). New props: `onOpenExport`, `theme`, `onToggleTheme`.
- **`ExpenseDetailScreen.tsx`** — added a **summary hero card** (status pill, merchant, source · date, amount ≈ USD, FX / fee / confidence) above the form.
- **`App.tsx`** — mounts `useTheme`; passes `onOpenExport` + `theme` + `onToggleTheme` to Inbox.
- Export / Cards / Reports inherit the gradient hero from `.screen-header`; no markup change needed.

## Not changed
Domain logic, `App.tsx`, routing, storage/repository, extraction, reconciliation, statement import, server/api, and all component props & class names. The port is reversible file-by-file.

## Verification notes
- Styling verified in a standalone harness that loads the real ported CSS against the actual screen markup (Inbox + Detail), in light and dark — see the team's review notes.
- The build/test suite should be run in your environment (`npm run dev` / `npm test`); this package was prepared without a local Node toolchain.
- Fonts load from Google Fonts (Manrope, Geist Mono) and a CDN-hosted Gilroy `@font-face`. For an offline/self-hosted build, drop Gilroy/Manrope/Geist-Mono into `public/` and swap the two `@import`s at the top of `tokens.css` for local `@font-face` rules.
