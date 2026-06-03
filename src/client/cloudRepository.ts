import type { ApiSnapshotBody, CloudSnapshot } from "../cloudflare/types";
import type { AppSnapshot, Expense, ReceiptArtifact, Report, StatementCharge } from "../domain/types";

async function readApiJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      throw new Error(body.error);
    }
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export class CloudRepository {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async bootstrap(): Promise<CloudSnapshot> {
    const body = await readApiJson<ApiSnapshotBody>(await this.fetcher("/api/bootstrap"));
    return body.snapshot;
  }

  async migrateLocalSnapshot(snapshot: AppSnapshot): Promise<CloudSnapshot> {
    return this.snapshotFromMutation("/api/migrate-local-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot })
    });
  }

  async saveExpense(
    expense: Expense,
    artifacts: ReceiptArtifact[] = [],
    expectedVersion?: number
  ): Promise<CloudSnapshot> {
    return this.snapshotFromMutation("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expense, artifacts, expectedVersion })
    });
  }

  async deleteExpense(expenseId: string, expectedVersion?: number): Promise<CloudSnapshot> {
    return this.snapshotFromMutation(`/api/expenses/${encodeURIComponent(expenseId)}${versionQuery(expectedVersion)}`, {
      method: "DELETE"
    });
  }

  async saveExpenseFolder(report: Report, expectedVersion?: number): Promise<CloudSnapshot> {
    return this.snapshotFromMutation("/api/expense-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report, expectedVersion })
    });
  }

  async deleteExpenseFolder(reportId: string, expectedVersion?: number): Promise<CloudSnapshot> {
    return this.snapshotFromMutation(
      `/api/expense-folders/${encodeURIComponent(reportId)}${versionQuery(expectedVersion)}`,
      { method: "DELETE" }
    );
  }

  async importStatementCharges(charges: StatementCharge[]): Promise<CloudSnapshot> {
    return this.snapshotFromMutation("/api/statements/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ charges })
    });
  }

  async syncEmail(): Promise<CloudSnapshot> {
    return this.snapshotFromMutation("/api/email/sync", { method: "POST" });
  }

  private async snapshotFromMutation(input: string, init: RequestInit): Promise<CloudSnapshot> {
    const body = await readApiJson<ApiSnapshotBody>(await this.fetcher(input, init));
    return body.snapshot;
  }
}

function versionQuery(expectedVersion?: number) {
  return expectedVersion === undefined ? "" : `?expectedVersion=${encodeURIComponent(String(expectedVersion))}`;
}
