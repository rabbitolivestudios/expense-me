import type { Expense, ExportPackage, ReceiptArtifact, Report, StatementCharge } from "../domain/types";

export interface Versioned<T> {
  value: T;
  version: number;
  updatedAt: string;
}

export type StoredEntity = Expense | Report | ReceiptArtifact | StatementCharge | ExportPackage;

export function stripArtifactDataUrl(artifact: ReceiptArtifact): ReceiptArtifact {
  const { dataUrl: _dataUrl, ...metadata } = artifact;
  return metadata;
}

export function encodePayload(value: StoredEntity) {
  return JSON.stringify(value);
}

export function decodePayload<T extends StoredEntity>(payload: string): T {
  return JSON.parse(payload) as T;
}

export function nextVersion(version: number | undefined) {
  return (version ?? 0) + 1;
}
