import type { HtmlPdfRenderContext } from "../features/export/exportPackage";
import type { CloudflareEnv } from "./types";

function gotenbergBaseUrl(env: CloudflareEnv) {
  return env.GOTENBERG_URL?.trim().replace(/\/+$/, "");
}

function outputFilename(filename: string) {
  return filename.replace(/\.pdf$/i, "").replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-").replace(/^-|-$/g, "") || "email-receipt";
}

function rendererHeaders(env: CloudflareEnv, context: HtmlPdfRenderContext) {
  const headers: Record<string, string> = {
    "Gotenberg-Output-Filename": outputFilename(context.filename)
  };

  if (env.GOTENBERG_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${env.GOTENBERG_BEARER_TOKEN}`;
  }

  if (env.GOTENBERG_ACCESS_CLIENT_ID && env.GOTENBERG_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = env.GOTENBERG_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.GOTENBERG_ACCESS_CLIENT_SECRET;
  }

  return headers;
}

export function hasGotenbergRenderer(env: CloudflareEnv) {
  return Boolean(gotenbergBaseUrl(env));
}

export async function renderHtmlToPdfWithGotenberg(
  env: CloudflareEnv,
  html: string,
  context: HtmlPdfRenderContext,
  fetcher: typeof fetch = fetch
) {
  const baseUrl = gotenbergBaseUrl(env);
  if (!baseUrl) {
    throw new Error("Gotenberg renderer is not configured.");
  }

  const body = new FormData();
  body.append("files", new File([html], "index.html", { type: "text/html" }));
  body.append("printBackground", "true");
  body.append("preferCssPageSize", "true");
  body.append("paperWidth", "8.5");
  body.append("paperHeight", "11");
  body.append("marginTop", "0.4");
  body.append("marginBottom", "0.4");
  body.append("marginLeft", "0.4");
  body.append("marginRight", "0.4");

  const response = await fetcher(`${baseUrl}/forms/chromium/convert/html`, {
    method: "POST",
    headers: rendererHeaders(env, context),
    body
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Email PDF renderer failed: ${response.status}${details ? ` ${details.slice(0, 160)}` : ""}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}
