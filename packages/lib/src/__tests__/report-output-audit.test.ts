import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, it, expect } from "vitest";
import { inspectionTypes } from "@testworx/types";
import { buildInitialReportDraft } from "../report-engine";
import { resolveReportTemplate } from "../report-config";
import { generateInspectionReportPdf } from "../pdf-report";
import type { PdfInput } from "../pdf-v2/types";

// Opt-in artifact generation: never connects to application records or sends email.
describe.skipIf(!process.env.PDF_AUDIT_DIR)("all report output artifacts", () => {
  for (const inspectionType of Object.values(inspectionTypes)) {
    for (const demanding of [false, true]) {
      for (const brand of (process.env.PDF_AUDIT_MEDIA ? ["alpha", "beta", "none"] : ["none"])) {
      it(`${inspectionType} ${demanding ? "long" : "short"} ${brand}`, async () => {
        const draft = buildInitialReportDraft({ inspectionType, siteName: "North Campus Service Building", customerName: "Audit Customer", scheduledDate: "2026-11-23", assetCount: 0 });
        const template = resolveReportTemplate({ inspectionType });
        for (const section of template.sections) {
          for (const field of section.fields) {
            if (field.hidden) continue;
            const value = (f: typeof field, index = 0): string | number | boolean => f.type === "boolean" ? false : f.type === "number" ? 0 : f.type === "date" ? "2026-11-23" : f.type === "select" ? (f.options?.[index % (f.options.length || 1)]?.value ?? "N/A") : `${f.label}: recorded ${index + 1}${demanding ? " - inspection observation with extended item-specific detail".repeat(3) : ""}`;
            draft.sections[section.id]!.fields[field.id] = field.type === "repeater"
              ? Array.from({ length: demanding ? 12 : 1 }, (_, index) => Object.fromEntries(field.rowFields.filter(rowField => !rowField.hidden).map(rowField => [rowField.id, value(rowField, index)])))
              : value(field);
          }
        }
        draft.overallNotes = demanding ? "Audit finding: correct item association and complete text must be retained. ".repeat(40) : "Short inspection record.";
        const input: PdfInput = {
          tenant: { name: "Audit Company Alpha", branding: { companyName: "Audit Company Alpha", phone: "555-0100", email: "audit@example.test" }, timezone: "America/Chicago" },
          customerCompany: { name: "Audit Customer", contactName: "Customer Signer", billingEmail: "customer@example.test", phone: "555-0101" },
          site: { name: demanding ? "North Campus Service Building - Manufacturing and Logistics Division, Receiving Entrance and Equipment Annex" : "North Campus", addressLine1: "123 Example Street", addressLine2: null, city: "Example City", state: "OK", postalCode: "73000" },
          inspection: { id: "audit-inspection", scheduledStart: new Date("2026-11-23T15:00:00Z"), scheduledEnd: null, status: "completed", notes: null },
          task: { inspectionType }, report: { id: "audit-report", reportNumber: 123, finalizedAt: new Date("2026-11-23T18:00:00Z"), technicianName: "Audit Technician" },
          draft, deficiencies: demanding ? [{ title: "Recorded deficiency", description: "Equipment-specific corrective action and findings. ".repeat(40), severity: "high", status: "open", location: "Equipment 1" }] : [], photos: [], technicianSignature: null, customerSignature: null
        };
        if (process.env.PDF_AUDIT_MEDIA) {
          const image = (name: string) => `data:image/png;base64,${readFileSync(path.join(process.env.PDF_AUDIT_MEDIA!, `${name}.png`)).toString("base64")}`;
          input.tenant.name = brand === "beta" ? "Audit Company Beta" : "Audit Company Alpha";
          input.tenant.branding = { companyName: input.tenant.name, phone: "555-0100", email: `${brand}@example.test`, ...(brand !== "none" ? { logoDataUrl: image(brand) } : {}) };
          if (demanding) {
            input.photos = [{ fileName: "Equipment 1.png", storageKey: image("photo") }, { fileName: "Equipment 2.png", storageKey: image("photo") }];
            input.technicianSignature = { signerName: "Audit Technician", imageDataUrl: image("signature"), signedAt: "2026-11-23T18:00:00Z" };
            input.customerSignature = { signerName: "Customer Signer", imageDataUrl: image("signature"), signedAt: "2026-11-23T18:01:00Z" };
          }
        }
        const savedRecord = JSON.stringify(input);
        const bytes = await generateInspectionReportPdf(input);
        expect(JSON.stringify(input)).toBe(savedRecord);
        expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
        const directory = process.env.PDF_AUDIT_DIR!;
        mkdirSync(directory, { recursive: true });
        const name = `${inspectionType}-${demanding ? "long" : "short"}-${brand}`;
        writeFileSync(path.join(directory, `${name}.pdf`), bytes);
        writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(input, null, 2));
      }, 120000);
      }
    }
  }
});
