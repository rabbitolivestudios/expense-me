import { describe, expect, it } from "vitest";
import { normalizeCloudSnapshot } from "../../src/cloudflare/appSnapshot";
import { decodePayload, encodePayload, nextVersion, stripArtifactDataUrl } from "../../src/cloudflare/schema";
import type { ReceiptArtifact, Report } from "../../src/domain/types";

describe("cloud record codecs", () => {
  it("strips receipt binary data before D1 metadata storage", () => {
    const artifact: ReceiptArtifact = {
      id: "artifact-1",
      artifactType: "UploadedImage",
      mimeType: "image/png",
      storageKey: "local/artifact-1/receipt.png",
      createdAt: "2026-06-03T12:00:00.000Z",
      dataUrl: "data:image/png;base64,abc"
    };

    expect(stripArtifactDataUrl(artifact)).not.toHaveProperty("dataUrl");
  });

  it("round-trips JSON payloads", () => {
    const payload: Report = {
      id: "report-current",
      name: "Current Expense Folder",
      expenseIds: [],
      dateRangeLabel: "Add expenses to this folder",
      status: "Draft",
      createdAt: "2026-06-03T12:00:00.000Z"
    };

    expect(decodePayload<typeof payload>(encodePayload(payload))).toEqual(payload);
  });

  it("creates a default Expense Folder when a cloud snapshot is empty", () => {
    const snapshot = normalizeCloudSnapshot({ workspaceId: "workspace-1", userEmail: "user@example.com" });

    expect(snapshot.reports[0].name).toBe("Current Expense Folder");
  });

  it("increments missing and existing versions predictably", () => {
    expect(nextVersion(undefined)).toBe(1);
    expect(nextVersion(4)).toBe(5);
  });
});
