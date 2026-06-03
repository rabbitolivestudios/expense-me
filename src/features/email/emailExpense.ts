import type { Expense, ReceiptArtifact } from "../../domain/types";
import { createExpenseFromExtractedText } from "../extraction/extractionPipeline";
import type { AgentMailMessageSummary } from "./agentMailSync";

export interface EmailExpenseBundle {
  expense: Expense;
  artifact: ReceiptArtifact;
}

function safeId(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 64) || `${Date.now()}`;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'");
}

function htmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|td|th|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
  ).trim();
}

function addTextPart(parts: string[], value: unknown) {
  if (typeof value !== "string") return;

  const trimmed = value.trim();
  if (!trimmed) return;

  parts.push(/<\/?[a-z][\s\S]*>/i.test(trimmed) ? htmlToText(trimmed) : trimmed);
}

function collectBodyText(message: AgentMailMessageSummary) {
  const parts: string[] = [];

  addTextPart(parts, message.text);
  addTextPart(parts, message.plain);
  addTextPart(parts, message.body_text);
  addTextPart(parts, message.extracted_text);
  addTextPart(parts, message.html);
  addTextPart(parts, message.body_html);
  addTextPart(parts, message.extracted_html);

  for (const container of [message.body, message.content]) {
    if (typeof container === "string") {
      addTextPart(parts, container);
    } else if (container && typeof container === "object") {
      const fields = container as Record<string, unknown>;
      for (const key of ["text", "plain", "body", "body_text", "html", "body_html", "content"]) {
        addTextPart(parts, fields[key]);
      }
    }
  }

  return parts;
}

export function buildEmailReceiptText(message: AgentMailMessageSummary) {
  const parts = [
    message.subject ? `Subject: ${message.subject}` : "",
    ...collectBodyText(message),
    message.preview ? `Preview: ${message.preview}` : "",
    message.from ? `From: ${message.from}` : ""
  ].filter(Boolean);
  const uniqueParts = parts.filter((part, index) => parts.indexOf(part) === index);

  return uniqueParts.join("\n");
}

export function createExpenseFromEmailMessage(message: AgentMailMessageSummary): EmailExpenseBundle {
  const id = `exp-email-${safeId(message.message_id)}`;
  const artifactId = `art-email-${safeId(message.message_id)}`;
  const text = buildEmailReceiptText(message) || "Email receipt";
  const expense = createExpenseFromExtractedText(id, text, {
    fallbackDate: message.timestamp ? message.timestamp.slice(0, 10) : undefined,
    sourceType: "Email"
  });

  return {
    expense: {
      ...expense,
      sourceType: "Email",
      status: "Review",
      receiptArtifactIds: [artifactId],
      notes: `Synced from ${message.from ?? "AgentMail"}${message.subject ? `: ${message.subject}` : ""}`
    },
    artifact: {
      id: artifactId,
      artifactType: "EmailBody",
      sourceMessageId: message.message_id,
      mimeType: "text/plain",
      storageKey: `agentmail/${message.message_id}`,
      createdAt: message.timestamp ?? new Date().toISOString(),
      extractedText: text
    }
  };
}

export function shouldRepairEmailExpense(existing: Expense, next: Expense) {
  if (existing.sourceType !== "Email") return false;

  const subjectLikeText = `${existing.merchant ?? ""} ${existing.description}`.trim();
  const looksLikeForward = /^(fw|fwd|re):/i.test(subjectLikeText) || /<[^>]+@[^>]+>/.test(subjectLikeText);
  const fallbackAmount = existing.originalAmount === 0.01 && existing.confidence <= 0.5;
  const betterParse = next.confidence > existing.confidence ||
    next.originalAmount !== existing.originalAmount ||
    next.expenseDate !== existing.expenseDate ||
    next.merchant !== existing.merchant;

  return betterParse && (fallbackAmount || looksLikeForward);
}

export function mergeEmailExpenseRepair(existing: Expense, next: Expense, receiptArtifactIds: string[]) {
  return {
    ...existing,
    status: existing.status === "Review" ? next.status : existing.status,
    expenseType: next.expenseType,
    subExpenseType: next.subExpenseType,
    expenseDate: next.expenseDate,
    region: next.region,
    country: next.country,
    city: next.city || existing.city,
    merchant: next.merchant,
    description: next.description,
    originalAmount: next.originalAmount,
    originalCurrency: next.originalCurrency,
    finalUsdAmount: next.finalUsdAmount,
    fxRate: next.fxRate,
    foreignTransactionFee: next.foreignTransactionFee,
    notes: next.notes,
    receiptArtifactIds,
    confidence: next.confidence
  };
}
