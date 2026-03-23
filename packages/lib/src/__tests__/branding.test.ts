import { describe, expect, it } from "vitest";

import { buildTenantBrandingCss, resolveTenantBranding } from "../branding";
import { generateInspectionReportPdf } from "../pdf-report";

describe("branding propagation", () => {
  it("resolves tenant branding defaults for portal usage", () => {
    const branding = resolveTenantBranding({
      tenantName: "Evergreen Fire Protection",
      billingEmail: "billing@evergreenfire.com",
      branding: { primaryColor: "#102A43", legalBusinessName: "Evergreen Fire Protection, LLC" }
    });

    expect(branding.legalBusinessName).toBe("Evergreen Fire Protection, LLC");
    expect(branding.email).toBe("billing@evergreenfire.com");
    expect(buildTenantBrandingCss(branding)["--tenant-primary"]).toBe("#102A43");
    expect(buildTenantBrandingCss(branding)["--tenant-primary-rgb"]).toBe("16 42 67");
  });

  it("preserves valid branding fields when a stored website is invalid", () => {
    const branding = resolveTenantBranding({
      tenantName: "Evergreen Fire Protection",
      billingEmail: "billing@evergreenfire.com",
      branding: {
        logoDataUrl: "data:image/png;base64,AAAA",
        primaryColor: "#102A43",
        accentColor: "#C2410C",
        legalBusinessName: "Evergreen Fire Protection, LLC",
        website: "evergreenfire.example.com"
      }
    });

    expect(branding.logoDataUrl).toBe("data:image/png;base64,AAAA");
    expect(branding.primaryColor).toBe("#102A43");
    expect(branding.accentColor).toBe("#C2410C");
    expect(branding.legalBusinessName).toBe("Evergreen Fire Protection, LLC");
    expect(branding.website).toBe("https://evergreenfire.example.com/");
  });

  it("propagates tenant business branding into generated PDFs", async () => {
    const bytes = await generateInspectionReportPdf({
      tenant: {
        name: "Evergreen Fire Protection",
        branding: {
          legalBusinessName: "Evergreen Fire Protection, LLC",
          primaryColor: "#1E3A5F",
          accentColor: "#C2410C",
          phone: "312-555-0199",
          email: "service@evergreenfire.com"
        }
      },
      customerCompany: { name: "Pinecrest", contactName: "Alyssa Reed", billingEmail: "ap@pinecrest.com", phone: "312-555-0110" },
      site: { name: "Pinecrest Tower", addressLine1: "100 State St", addressLine2: null, city: "Chicago", state: "IL", postalCode: "60601" },
      inspection: { id: "inspection_1", scheduledStart: new Date("2026-03-12T09:00:00.000Z"), scheduledEnd: null, status: "completed", notes: null },
      task: { inspectionType: "fire_alarm" },
      report: { id: "report_1", finalizedAt: new Date("2026-03-12T10:30:00.000Z"), technicianName: "Alex Turner" },
      draft: {
        templateVersion: 1,
        inspectionType: "fire_alarm",
        overallNotes: "All systems responded as expected.",
        sectionOrder: ["control-panel"],
        activeSectionId: "control-panel",
        sections: {
          "control-panel": {
            status: "pass",
            notes: "Panel normal",
            fields: { panelCondition: "pass", powerSuppliesNormal: true, troubleSignals: "None" }
          }
        },
        deficiencies: [],
        attachments: [],
        signatures: {},
        context: { siteName: "Pinecrest Tower", customerName: "Pinecrest", scheduledDate: "2026-03-12T09:00:00.000Z", assetCount: 2, priorReportSummary: "" }
      },
      deficiencies: [],
      photos: [],
      technicianSignature: null,
      customerSignature: null
    });

    expect(Buffer.from(bytes).slice(0, 4).toString()).toBe("%PDF");
  });
});
