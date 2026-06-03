import type { Expense } from "../domain/types";
import { requireAccessUser } from "./accessAuth";
import { D1ExpenseMeRepository, type MutationResult, VersionConflictError } from "./d1Repository";
import { errorResponse, jsonResponse, readJson } from "./http";
import type { AccessUser, ApiSnapshotBody, CloudflareEnv, WorkspaceContext } from "./types";

interface CloudApiRepository {
  getOrCreateWorkspace(user: AccessUser): Promise<WorkspaceContext>;
  getSnapshot(context: WorkspaceContext): Promise<ApiSnapshotBody["snapshot"]>;
  upsertExpense(
    context: WorkspaceContext,
    expense: Expense,
    options: { expectedVersion?: number }
  ): Promise<MutationResult>;
  deleteExpense(
    context: WorkspaceContext,
    expenseId: string,
    options: { expectedVersion?: number }
  ): Promise<MutationResult>;
}

interface RouteDeps {
  repository?: CloudApiRepository;
}

function expectedVersionFromSearch(url: URL) {
  const value = url.searchParams.get("expectedVersion");
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function authErrorResponse(error: Response) {
  return errorResponse(error.status, error.status === 403 ? "Forbidden." : "Unauthorized.");
}

export async function handleApiRequest(request: Request, env: CloudflareEnv, deps: RouteDeps = {}) {
  try {
    const url = new URL(request.url);
    const user = await requireAccessUser(request, env);
    const repository = deps.repository ?? new D1ExpenseMeRepository(env);
    const context = await repository.getOrCreateWorkspace(user);

    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      const snapshot = await repository.getSnapshot(context);
      return jsonResponse({ snapshot } satisfies ApiSnapshotBody);
    }

    if (request.method === "POST" && url.pathname === "/api/expenses") {
      const body = await readJson<{ expense: Expense; expectedVersion?: number }>(request);
      const result = await repository.upsertExpense(context, body.expense, { expectedVersion: body.expectedVersion });
      return jsonResponse(result);
    }

    const expenseDelete = url.pathname.match(/^\/api\/expenses\/([^/]+)$/);
    if (request.method === "DELETE" && expenseDelete) {
      const result = await repository.deleteExpense(context, decodeURIComponent(expenseDelete[1]), {
        expectedVersion: expectedVersionFromSearch(url)
      });
      return jsonResponse(result);
    }

    return errorResponse(404, "API route not found.");
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return errorResponse(409, error.message);
    }

    if (error instanceof Response) {
      return authErrorResponse(error);
    }

    console.error("Expense Me API failed.", error);
    return errorResponse(500, "Expense Me API failed.");
  }
}
