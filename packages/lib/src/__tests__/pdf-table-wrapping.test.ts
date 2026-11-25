import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { splitTextIntoLines, type PdfV2Runtime } from "../pdf-v2/page-shell";
import { renderTableSection } from "../pdf-v2/sections/table";
import { buildPdfV2Theme } from "../pdf-v2/theme";
import { PDF_V2_TOKENS } from "../pdf-v2/tokens";

describe("PDF table wrapping", () => {
  it("keeps long words inside their cell without losing characters", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const text = "Manufacturer LongUnbrokenEquipmentIdentifier123456789";
    const lines = splitTextIntoLines(font, text, 24, 8.5);
    expect(lines.join("")).toBe(text.replaceAll(" ", ""));
    expect(lines.every((line) => font.widthOfTextAtSize(line, 8.5) <= 24)).toBe(true);
    expect(splitTextIntoLines(font, text, 24, 8.5, 2)).toEqual(lines.slice(0, 2));
  });

  it("wraps headers and reserves height before drawing the body", async () => {
    const pdfDoc = await PDFDocument.create();
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const page = pdfDoc.addPage([612, 792]);
    const draw = vi.spyOn(page, "drawText");
    const runtime: PdfV2Runtime = { pdfDoc, regularFont, boldFont,
      theme: buildPdfV2Theme("#123456", "#067890"), logoEmbedded: null,
      model: {} as PdfV2Runtime["model"] };
    renderTableSection(runtime, { page, y: 600, pageNumber: 1 }, {
      key: "test", renderer: "table", title: "Equipment",
      columns: [
        { key: "manufacturer", label: "Manufacturer Inspection Indicators", width: "12%" },
        { key: "notes", label: "Notes", width: "88%" }
      ], rows: [{ manufacturer: { text: "Amerex" }, notes: { text: "Verified result" } }],
      repeatHeader: true
    });
    const headerCalls = draw.mock.calls.filter(([, options]) => options?.font === boldFont && options.size! < 10);
    expect(headerCalls.length).toBeGreaterThan(3);
    const body = draw.mock.calls.find(([text]) => text === "Amerex")![1]!;
    expect(body.y).toBeLessThan(Math.min(...headerCalls.map(([, options]) => options!.y!)));
    const firstColumnWidth = (612 - PDF_V2_TOKENS.margin * 2) * 0.12;
    for (const [text, options] of headerCalls.filter(([text]) => text !== "NOTES")) {
      expect(boldFont.widthOfTextAtSize(text, options!.size!)).toBeLessThanOrEqual(firstColumnWidth - PDF_V2_TOKENS.tableCellPaddingX * 2);
    }
    if (process.env.APP_ENV === "staging") {
      const { writeFileSync } = await import("node:fs");
      writeFileSync("../../scripts/staging/results/table-wrapping.pdf", await pdfDoc.save());
    }
  });
});
