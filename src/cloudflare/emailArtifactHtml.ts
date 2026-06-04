import type { ReceiptArtifact } from "../domain/types";
import { buildEmailReceiptHtml } from "../features/email/emailExpense";
import { getServerAgentMailMessage } from "./serverAgentMail";
import type { CloudflareEnv } from "./types";

function textDataUrl(value: string, mimeType: "text/html") {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

function shouldFetchAgentMailHtml(env: CloudflareEnv, artifact: ReceiptArtifact) {
  return artifact.artifactType === "EmailBody" &&
    artifact.mimeType !== "text/html" &&
    Boolean(artifact.sourceMessageId) &&
    Boolean(env.AGENTMAIL_API_KEY);
}

export async function hydrateEmailArtifactHtmlForExport(
  env: CloudflareEnv,
  artifact: ReceiptArtifact,
  fetcher: typeof fetch = fetch
) {
  if (!shouldFetchAgentMailHtml(env, artifact)) {
    return artifact;
  }

  try {
    const message = await getServerAgentMailMessage(env, artifact.sourceMessageId!, fetcher);
    const html = buildEmailReceiptHtml(message);

    if (!html) {
      return artifact;
    }

    return {
      ...artifact,
      mimeType: "text/html",
      dataUrl: textDataUrl(html, "text/html")
    };
  } catch (error) {
    console.error("Email receipt HTML could not be loaded for export.", error);
    return artifact;
  }
}
