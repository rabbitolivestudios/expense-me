export type ExtractionMethod = "text" | "ocr" | "pdf-text" | "pdf-ocr" | "empty";

export interface FileTextExtractionResult {
  text: string;
  method: ExtractionMethod;
}

export interface PdfTextItemLike {
  str?: string;
}

export interface PdfPageLike {
  getTextContent: () => Promise<{ items: PdfTextItemLike[] }>;
  getViewport?: (options: { scale: number }) => { width: number; height: number };
  render?: (parameters: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<unknown> };
}

export interface PdfDocumentLike {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
  destroy?: () => Promise<void> | void;
}

export interface FileTextExtractionDependencies {
  getPdfDocument?: (data: Uint8Array) => Promise<PdfDocumentLike>;
  readFileText?: (file: File) => Promise<string>;
  recognizeImage?: (image: File | Blob | HTMLCanvasElement) => Promise<string>;
  renderPdfPageToImage?: (page: PdfPageLike) => Promise<Blob | HTMLCanvasElement>;
  maxPdfPages?: number;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isText(file: File) {
  return file.type.startsWith("text/") || /\.(txt|csv)$/i.test(file.name);
}

function isImage(file: File) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name);
}

function normalizeExtractedText(text: string) {
  return text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | undefined;

async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.mjs?url")
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }

  return pdfjsPromise;
}

async function readFileText(file: File) {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(new Error("Receipt file import failed.")));
    reader.readAsText(file);
  });
}

async function readFileBytes(file: File) {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(new Uint8Array(reader.result as ArrayBuffer)));
    reader.addEventListener("error", () => reject(new Error("Receipt file import failed.")));
    reader.readAsArrayBuffer(file);
  });
}

async function getPdfDocument(data: Uint8Array): Promise<PdfDocumentLike> {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({ data }).promise as Promise<PdfDocumentLike>;
}

async function recognizeImage(image: File | Blob | HTMLCanvasElement) {
  const tesseractModule = await import("tesseract.js") as unknown as {
    default?: { recognize: typeof import("tesseract.js").recognize };
    recognize: typeof import("tesseract.js").recognize;
  };
  const tesseract = tesseractModule.default ?? tesseractModule;
  const result = await tesseract.recognize(image, "eng");
  return result.data.text;
}

async function renderPdfPageToImage(page: PdfPageLike) {
  if (!page.getViewport || !page.render) {
    throw new Error("Scanned PDF OCR is not available in this browser.");
  }

  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Scanned PDF OCR is not available in this browser.");

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function extractPdfText(file: File, dependencies: FileTextExtractionDependencies) {
  const document = await (dependencies.getPdfDocument ?? getPdfDocument)(await readFileBytes(file));
  const maxPages = Math.min(document.numPages, dependencies.maxPdfPages ?? 5);
  const pageTexts: string[] = [];
  const pages: PdfPageLike[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      pages.push(page);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => item.str ?? "").join(" "));
    }

    const embeddedText = normalizeExtractedText(pageTexts.join("\n"));
    if (embeddedText) {
      return { text: embeddedText, method: "pdf-text" as const };
    }

    const ocrTexts: string[] = [];
    for (const page of pages) {
      const image = await (dependencies.renderPdfPageToImage ?? renderPdfPageToImage)(page);
      const text = await (dependencies.recognizeImage ?? recognizeImage)(image);
      ocrTexts.push(text);
    }

    return { text: normalizeExtractedText(ocrTexts.join("\n")), method: "pdf-ocr" as const };
  } finally {
    await document.destroy?.();
  }
}

export async function extractReceiptTextFromFile(
  file: File,
  dependencies: FileTextExtractionDependencies = {}
): Promise<FileTextExtractionResult> {
  if (isText(file)) {
    return {
      text: normalizeExtractedText(await (dependencies.readFileText ?? readFileText)(file)),
      method: "text"
    };
  }

  if (isPdf(file)) {
    return extractPdfText(file, dependencies);
  }

  if (isImage(file)) {
    return {
      text: normalizeExtractedText(await (dependencies.recognizeImage ?? recognizeImage)(file)),
      method: "ocr"
    };
  }

  return { text: "", method: "empty" };
}
