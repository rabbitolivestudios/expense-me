import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import type { AppSnapshot, ExportPackage } from "../domain/types";

export interface CloudflareEnv {
  EXPENSE_ME_DB: D1Database;
  EXPENSE_ME_ARTIFACTS: R2Bucket;
  ENVIRONMENT?: string;
  APP_ORIGIN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_ALLOWED_EMAIL?: string;
  AGENTMAIL_API_KEY?: string;
  AGENTMAIL_INBOX_ID?: string;
  AGENTMAIL_BASE_URL?: string;
  AGENTMAIL_WEBHOOK_SECRET?: string;
}

export interface AccessUser {
  id: string;
  email: string;
  name?: string;
}

export interface WorkspaceContext {
  user: AccessUser;
  workspaceId: string;
}

export interface CloudRecordVersions {
  expenses: Record<string, number>;
  reports: Record<string, number>;
  receiptArtifacts: Record<string, number>;
  statementCharges: Record<string, number>;
  exportPackages: Record<string, number>;
}

export interface CloudSnapshot extends AppSnapshot {
  exportPackages: ExportPackage[];
  recordVersions: CloudRecordVersions;
  workspaceId: string;
  userEmail: string;
}

export interface ApiErrorBody {
  error: string;
}

export interface ApiSnapshotBody {
  snapshot: CloudSnapshot;
}
