import type { ApiErrorBody } from "./types";

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(status: number, error: string) {
  return jsonResponse({ error } satisfies ApiErrorBody, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export async function readOptionalJson<T>(request: Request): Promise<T | undefined> {
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return undefined;
  }

  const text = await request.text();
  if (!text.trim()) {
    return undefined;
  }

  return JSON.parse(text) as T;
}
