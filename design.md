---
version: "alpha"
name: "Expense Me"
description: "Mobile-first expense intake, reconciliation, and export app for work expenses."
colors:
  primary: "#460a78"
  violet: "#be2878"
  red: "#e63c41"
  orange: "#f58746"
  yellow: "#ffbe6e"
  steel: "#414141"
  hot-orange: "#ff3700"
  sky-blue: "#0072ce"
  white: "#ffffff"
  surface: "#ffffff"
  surface-muted: "#f6f7f9"
  surface-soft: "#fff6ef"
  border: "#e3e5e8"
  text: "#414141"
  text-muted: "#717171"
  danger-surface: "rgba(255, 55, 0, 0.12)"
  success-surface: "rgba(0, 114, 206, 0.10)"
  warning-surface: "rgba(255, 190, 110, 0.32)"
typography:
  display:
    fontFamily: "Gilroy, Aptos, Segoe UI Variable Display, Segoe UI, Arial, sans-serif"
    fontSize: "1.65rem"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "0"
  title:
    fontFamily: "Gilroy, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "1.18rem"
    fontWeight: 900
    lineHeight: 1.15
    letterSpacing: "0"
  body:
    fontFamily: "Gilroy, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0"
  label:
    fontFamily: "Gilroy, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 850
    lineHeight: 1.2
    letterSpacing: "0"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  control: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.hot-orange}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.steel}"
    rounded: "{rounded.md}"
    padding: "12px"
  button-utility:
    backgroundColor: "{colors.sky-blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "10px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px"
  bottom-navigation:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    height: "78px"
---

## Overview

Expense Me is a mobile-first work companion, not a marketing site. The UI should feel quick, trustworthy, and operational: capture a receipt, review what is missing, assign it to an Expense Folder, and create an Export Package with very little ceremony.

The brand direction comes from an ArcelorMittal-style palette: purple, violet, red, orange, yellow, dark steel grey, hot orange, sky blue, and white. Use the gradient and warm accent colors for identity moments, but keep the working surfaces mostly white, steel, and sky-blue/hot-orange actions so the app remains readable on a phone.

## Colors

- **Primary Purple (#460a78):** Brand anchor for app identity, logo lockups, and rare emphasis.
- **Violet (#be2878), Red (#e63c41), Orange (#f58746), Yellow (#ffbe6e):** Gradient family for brand accents, status warmth, and onboarding moments.
- **Steel (#414141):** Main text and quiet structural color.
- **Hot Orange (#ff3700):** Destructive or urgent action, including delete and high-priority blockers.
- **Sky Blue (#0072ce):** Productive action, folder assignment, sync, ready states, and links.
- **White and Muted Surfaces:** Primary mobile app surfaces. Avoid dark-heavy screens for expense entry.

Do not turn the product into a one-hue purple/orange app. Keep the core workflow neutral and use color sparingly to make action type obvious.

## Typography

Use Gilroy as the intended brand font, with Aptos and Segoe UI fallbacks. Titles should feel modern and confident, but compact. This is a dense mobile tool, so avoid oversized hero typography inside screens, cards, dialogs, and bottom navigation.

Letter spacing should remain `0`. Do not use negative tracking. Keep labels short and strong.

## Layout

Design mobile first. The first viewport should show the active work surface, not a landing page. The main screens are Inbox, Capture, Cards, Expense Folders, Export, and Expense Detail.

Use a bottom navigation rail with five primary actions: Inbox, Capture, Cards, Folders, and Export. Capture is a central primary action. Each secondary screen needs a clear back icon in the top-left area.

Prefer single-column mobile layouts, compact metric panels, and action rows. On larger screens, widen the content but preserve the mobile-first hierarchy instead of creating a desktop dashboard that diverges from the phone experience.

## Elevation & Depth

Use light card shadows only to separate repeated expense rows, confirmation panels, and modal-like controls. Avoid nested cards. Page sections should be unframed layouts or full-width bands; repeated items can be cards.

## Shapes

Cards should stay at 8px radius or less. Controls can use 10px when they need larger touch targets. Avoid pill-heavy design except for status labels.

## Components

Expense cards need to show status, merchant/description, city or category detail, Expense Folder, amount, currency, and date. They must support:

- tap to open Expense Detail;
- swipe right to assign an Expense Folder;
- swipe left to delete;
- long press to reveal assign, rename, and delete actions.

Expense Detail should mirror the company expense app fields: Expense Folder, expense type, sub-expense type, date, region, country, city, description, payment method, amount, currency, meal people count, optional attendee names, FX rate, foreign fee, and receipt evidence.

Export Package screens should be tied to one Expense Folder and should clearly show readiness blockers without vague messages.

Use lucide-style icons for camera capture, PDF intake, email intake, card statements, folder assignment, delete, rename, back, sync, and export.

## Do's and Don'ts

Do:

- keep all main flows thumb-friendly;
- make required fields and blockers obvious;
- use blue for constructive assignment/sync actions and hot orange for destructive actions;
- keep card text compact and scannable;
- preserve the brand icon next to the Expense Me title;
- maintain company-field fidelity over decorative styling.

Don't:

- create a landing-page hero as the first screen;
- use decorative gradient blobs or abstract backgrounds;
- hide action states behind text-only controls when icons are clearer;
- let text overflow buttons or cards;
- use "Secretary Package"; the correct term is "Export Package";
- call business groupings projects; the correct term is "Expense Folder".
