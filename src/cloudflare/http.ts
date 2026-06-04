import type { ApiErrorBody } from "./types";

export class BadRequestError extends Error {
  constructor(message = "Request body must be valid JSON.") {
    super(message);
    this.name = "BadRequestError";
  }
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(status: number, error: string) {
  return jsonResponse({ error } satisfies ApiErrorBody, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new BadRequestError();
  }
}

export async function readOptionalJson<T>(request: Request): Promise<T | undefined> {
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return undefined;
  }

  const text = await request.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new BadRequestError();
  }
}
