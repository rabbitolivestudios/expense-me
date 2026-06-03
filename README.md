# Expense Me

Mobile-first expense intake and export app for work expenses.

Expense Me helps capture receipts from camera uploads, PDFs/images, email intake, manual entries, and card statements. It keeps company-required expense fields aligned with the current expense-reporting workflow, reconciles card charges, and generates an export package with transaction details and supporting evidence.

## Live App

https://expense-me-tbo.vercel.app

## Current Capabilities

- Mobile-first inbox, capture, cards, reports, and export screens
- Camera/image/PDF/manual intake
- AgentMail inbox sync for `expense-me@agentmail.to`
- Company-style expense type, sub-expense type, region, and country fields
- Meal attendee count support
- Card statement import and matching
- Swipe-left and detail-screen expense deletion with confirmation
- Export package generation with receipts/declarations and review files

## Local Setup

```bash
npm install
npm run dev
```

Create a local `.env` file from `.env.example` when testing AgentMail sync.

## Validation

```bash
npm test
npm run build
```
