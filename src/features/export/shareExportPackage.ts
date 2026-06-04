function downloadableZipBlob(blob: Blob) {
  return blob.type ? blob : new Blob([blob], { type: "application/zip" });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function shareOrDownloadZip(blob: Blob, filename: string) {
  const zipBlob = downloadableZipBlob(blob);
  const file = new File([zipBlob], filename, { type: "application/zip" });
  const canShareFile =
    typeof navigator.share === "function" &&
    (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }));

  if (canShareFile) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  triggerDownload(zipBlob, filename);
}
