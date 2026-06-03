import type { Expense, ReceiptArtifact, Report, StatementCharge } from "../src/domain/types";

export const seedArtifacts: ReceiptArtifact[] = [
  {
    id: "art-restaurant-receipt",
    artifactType: "EmailAttachment",
    originalFilename: "avec-dinner.pdf",
    mimeType: "application/pdf",
    storageKey: "seed/avec-dinner.pdf",
    createdAt: "2026-05-20T23:42:00.000Z",
    extractedText: "Avec River North Dinner USD 184.20"
  },
  {
    id: "art-taxi-paris",
    artifactType: "CameraImage",
    originalFilename: "taxi-paris.jpg",
    mimeType: "image/jpeg",
    storageKey: "seed/taxi-paris.jpg",
    createdAt: "2026-05-21T08:16:00.000Z",
    extractedText: "Taxi Parisien EUR 42.00"
  }
];

export const seedExpenses: Expense[] = [
  {
    id: "exp-meal-client-dinner",
    sourceType: "Email",
    status: "Review",
    expenseType: "Business Meals",
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
    reportId: "report-may-chicago",
    confidence: 0.74
  },
  {
    id: "exp-taxi-paris",
    sourceType: "Camera",
    status: "FX",
    expenseType: "Transport",
    subExpenseType: "Taxi",
    expenseDate: "2026-05-21",
    region: "Europe",
    country: "France",
    city: "Paris",
    merchant: "Taxi Parisien",
    description: "Taxi from hotel to customer site",
    paymentMethod: "Credit Card",
    originalAmount: 42,
    originalCurrency: "EUR",
    fxRate: 1.0881,
    foreignTransactionFee: 1.1,
    receiptArtifactIds: ["art-taxi-paris"],
    reportId: "report-customer-visit",
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
    reportId: "report-may-chicago",
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
  },
  {
    id: "charge-taxi-paris",
    statementImportId: "stmt-demo",
    cardLabel: "Corporate Visa",
    transactionDate: "2026-05-21",
    postedDate: "2026-05-22",
    description: "TAXI PARISIEN",
    originalAmount: 42,
    originalCurrency: "EUR",
    finalUsdAmount: 46.8,
    fxRate: 1.0881,
    foreignTransactionFee: 1.1,
    matchStatus: "Matched",
    matchedExpenseId: "exp-taxi-paris"
  }
];

export const seedReports: Report[] = [
  {
    id: "report-may-chicago",
    name: "Chicago Training - May 2026",
    startDate: "2026-05-20",
    endDate: "2026-05-22",
    dateRangeLabel: "May 20-22, 2026",
    expenseIds: ["exp-meal-client-dinner", "exp-fuel-training"],
    status: "Draft",
    createdAt: "2026-06-02T12:00:00.000Z"
  },
  {
    id: "report-customer-visit",
    name: "Customer Visit - Paris",
    startDate: "2026-05-21",
    endDate: "2026-05-21",
    dateRangeLabel: "May 21, 2026",
    expenseIds: ["exp-taxi-paris"],
    status: "Draft",
    createdAt: "2026-06-02T13:00:00.000Z"
  }
];
