import type { ReceiptArtifact } from "../domain/types";
import type { CloudflareEnv, WorkspaceContext } from "./types";

function decodeBase64(value: string) {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }

  return Buffer.from(value, "base64").toString("binary");
}

function encodeBase64(value: string) {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }

  return Buffer.from(value, "binary").toString("base64");
}

function bytesToBinary(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return binary;
}

export function dataUrlToBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    throw new Error("Invalid data URL.");
  }

  const metadata = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mimeType = metadata.match(/^data:([^;,]+)/)?.[1] ?? "application/octet-stream";

  if (metadata.includes(";base64")) {
    const binary = decodeBase64(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { bytes, mimeType };
  }

  return { bytes: new TextEncoder().encode(decodeURIComponent(data)), mimeType };
}

export function artifactObjectKey(context: WorkspaceContext, artifact: ReceiptArtifact) {
  return `${context.workspaceId}/artifacts/${artifact.id}`;
}

function uniqueArtifactObjectKey(context: WorkspaceContext, artifact: ReceiptArtifact) {
  return `${artifactObjectKey(context, artifact)}/${crypto.randomUUID()}`;
}

export async function storeArtifactData(env: CloudflareEnv, context: WorkspaceContext, artifact: ReceiptArtifact) {
  if (!artifact.dataUrl) return artifact.storageKey;

  const { bytes, mimeType } = dataUrlToBytes(artifact.dataUrl);
  const key = uniqueArtifactObjectKey(context, artifact);
  await env.EXPENSE_ME_ARTIFACTS.put(key, bytes, {
    httpMetadata: { contentType: artifact.mimeType || mimeType }
  });
  return key;
}

export async function loadArtifactDataUrl(env: CloudflareEnv, artifact: ReceiptArtifact) {
  const object = await env.EXPENSE_ME_ARTIFACTS.get(artifact.storageKey);
  if (!object) return undefined;

  const bytes = new Uint8Array(await object.arrayBuffer());
  return `data:${artifact.mimeType};base64,${encodeBase64(bytesToBinary(bytes))}`;
}
