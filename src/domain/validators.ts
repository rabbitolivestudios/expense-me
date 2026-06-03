import { z } from "zod";
import { expenseTypeOptions, isMealExpenseType, regionOptions } from "./options";

export const receiptArtifactSchema = z.object({
  id: z.string(),
  artifactType: z.enum(["CameraImage", "UploadedImage", "PdfReceipt", "EmailBody", "EmailAttachment", "Declaration"]),
  originalFilename: z.string().optional(),
  sourceMessageId: z.string().optional(),
  mimeType: z.string().min(1),
  storageKey: z.string().min(1),
  createdAt: z.string().min(1),
  extractedText: z.string().optional(),
  fingerprint: z.string().optional()
});

export const statementChargeSchema = z.object({
  id: z.string(),
  statementImportId: z.string(),
  cardLabel: z.string().min(1),
  transactionDate: z.string().min(1),
  postedDate: z.string().optional(),
  description: z.string().min(1),
  originalAmount: z.number().positive(),
  originalCurrency: z.string().length(3),
  finalUsdAmount: z.number().positive(),
  fxRate: z.number().positive().optional(),
  foreignTransactionFee: z.number().min(0).optional(),
  matchStatus: z.enum(["Unmatched", "Matched", "Ignored"]),
  matchedExpenseId: z.string().optional()
});

export const expenseSchema = z
  .object({
    id: z.string(),
    sourceType: z.enum(["Camera", "Upload", "Email", "Manual", "Statement"]),
    status: z.enum(["Ready", "Review", "Match", "FX", "Declare", "Duplicate", "Context"]),
    expenseType: z.enum(expenseTypeOptions),
    subExpenseType: z.string().min(1),
    expenseDate: z.string().min(1),
    region: z.enum(regionOptions),
    country: z.string().min(1),
    city: z.string().min(1),
    merchant: z.string().optional(),
    description: z.string().min(1),
    paymentMethod: z.enum(["Credit Card", "Personal Card", "Cash", "Company Paid"]),
    originalAmount: z.number().positive(),
    originalCurrency: z.string().length(3),
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
  })
  .superRefine((expense, context) => {
    if (isMealExpenseType(expense.expenseType) && !expense.mealPeopleCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mealPeopleCount"],
        message: "Meal expenses require number of people."
      });
    }
  });

export const reportSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  dateRangeLabel: z.string().min(1),
  expenseIds: z.array(z.string()),
  status: z.enum(["Draft", "Ready", "Exported"]),
  createdAt: z.string().min(1)
});
