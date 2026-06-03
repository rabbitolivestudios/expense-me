import type { ExpenseType, Region } from "./options";

export type ExpenseStatus = "Ready" | "Review" | "Match" | "FX" | "Declare" | "Duplicate" | "Context";
export type { ExpenseType, Region } from "./options";
export type PaymentMethod = "Credit Card" | "Personal Card" | "Cash" | "Company Paid";
export type ArtifactType = "CameraImage" | "UploadedImage" | "PdfReceipt" | "EmailBody" | "EmailAttachment" | "Declaration";
export type IntakeSource = "Camera" | "Upload" | "Email" | "Manual" | "Statement";
export type MatchStatus = "Unmatched" | "Matched" | "Ignored";

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
  dataUrl?: string;
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
  matchStatus: MatchStatus;
  matchedExpenseId?: string;
}

export interface Expense {
  id: string;
  sourceType: IntakeSource;
  status: ExpenseStatus;
  expenseType: ExpenseType;
  subExpenseType: string;
  expenseDate: string;
  region: Region;
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

export interface AppSnapshot {
  expenses: Expense[];
  receiptArtifacts: ReceiptArtifact[];
  statementCharges: StatementCharge[];
  reports: Report[];
}
