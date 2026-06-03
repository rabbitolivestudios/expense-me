import { describe, expect, it, vi } from "vitest";
import { extractReceiptTextFromFile, type PdfDocumentLike, type PdfPageLike } from "../../src/features/extraction/fileTextExtraction";

function fileFrom(text: string, name: string, type: string) {
  return new File([text], name, { type });
}

function pdfDocumentWithText(text: string): PdfDocumentLike {
  const page: PdfPageLike = {
    getTextContent: () => Promise.resolve({ items: text.split(/\s+/).map((str) => ({ str })) })
  };

  return {
    numPages: 1,
    getPage: () => Promise.resolve(page),
    destroy: vi.fn()
  };
}

function pdfDocumentWithoutText(): PdfDocumentLike {
  const page: PdfPageLike = {
    getTextContent: () => Promise.resolve({ items: [] })
  };

  return {
    numPages: 1,
    getPage: () => Promise.resolve(page),
    destroy: vi.fn()
  };
}

describe("file text extraction", () => {
  it("reads text uploads directly", async () => {
    const result = await extractReceiptTextFromFile(fileFrom("Dinner\nTotal USD 42.00", "receipt.txt", "text/plain"));

    expect(result.text).toContain("Dinner");
    expect(result.method).toBe("text");
  });

  it("runs OCR for receipt images", async () => {
    const recognizeImage = vi.fn().mockResolvedValue("Taxi Parisien\nTotal EUR 42.00");

    const result = await extractReceiptTextFromFile(fileFrom("binary-image", "taxi.jpg", "image/jpeg"), { recognizeImage });

    expect(recognizeImage).toHaveBeenCalledOnce();
    expect(result.text).toContain("Taxi Parisien");
    expect(result.method).toBe("ocr");
  });

  it("extracts embedded text from PDFs before using OCR", async () => {
    const recognizeImage = vi.fn();
    const getPdfDocument = vi.fn().mockResolvedValue(pdfDocumentWithText("Hotel Chicago Total USD 284.20"));

    const result = await extractReceiptTextFromFile(fileFrom("%PDF", "hotel.pdf", "application/pdf"), {
      getPdfDocument,
      recognizeImage
    });

    expect(result.text).toContain("Hotel Chicago");
    expect(result.method).toBe("pdf-text");
    expect(recognizeImage).not.toHaveBeenCalled();
  });

  it("falls back to OCR when a PDF has no embedded text", async () => {
    const renderedPage = new Blob(["page-image"], { type: "image/png" });
    const getPdfDocument = vi.fn().mockResolvedValue(pdfDocumentWithoutText());
    const renderPdfPageToImage = vi.fn().mockResolvedValue(renderedPage);
    const recognizeImage = vi.fn().mockResolvedValue("Scanned Fuel Receipt\nTotal USD 12.82");

    const result = await extractReceiptTextFromFile(fileFrom("%PDF", "fuel.pdf", "application/pdf"), {
      getPdfDocument,
      renderPdfPageToImage,
      recognizeImage
    });

    expect(renderPdfPageToImage).toHaveBeenCalledOnce();
    expect(recognizeImage).toHaveBeenCalledWith(renderedPage);
    expect(result.text).toContain("Scanned Fuel Receipt");
    expect(result.method).toBe("pdf-ocr");
  });
});
