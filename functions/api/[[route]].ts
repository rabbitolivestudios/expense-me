import type { EventContext } from "@cloudflare/workers-types";
import { handleApiRequest } from "../../src/cloudflare/apiRouter";
import type { CloudflareEnv } from "../../src/cloudflare/types";

type ApiPagesContext = EventContext<CloudflareEnv, "route", Record<string, unknown>>;

export async function onRequest(context: ApiPagesContext) {
  return handleApiRequest(context.request as unknown as Request, context.env);
}
