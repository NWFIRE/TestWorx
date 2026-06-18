import { describe, expect, it } from "vitest";

import { buildInitialReportDraft } from "../report-engine";
import { refreshReportDraftCustomerContextForRegeneration } from "../report-service";

describe("report PDF regeneration customer context", () => {
  it("refreshes completed report identity fields from current customer and site records", () => {
    const staleDraft = buildInitialReportDraft({
      inspectionType: "joint_commission_fire_sprinkler",
      siteName: "Old Campus",
      customerName: "Old Hospital Name",
      scheduledDate: "2026-03-10T15:00:00.000Z",
      assetCount: 0,
      priorReportSummary: "",
      siteDefaults: {
        siteAddress: "100 Old Address"
      }
    });

    const refreshed = refreshReportDraftCustomerContextForRegeneration(staleDraft, {
      inspection: {
        scheduledStart: new Date("2026-03-10T15:00:00.000Z"),
        site: {
          name: "Updated Medical Tower",
          addressLine1: "4500 Current Care Blvd",
          addressLine2: "Suite 200",
          city: "Enid",
          state: "OK",
          postalCode: "73701"
        },
        customerCompany: {
          name: "Updated Regional Medical Center",
          serviceAddressLine1: "900 Customer Service Rd",
          serviceAddressLine2: null,
          serviceCity: "Enid",
          serviceState: "OK",
          servicePostalCode: "73702",
          billingAddressLine1: "PO Box 100",
          billingAddressLine2: null,
          billingCity: "Enid",
          billingState: "OK",
          billingPostalCode: "73703"
        }
      }
    });

    expect(refreshed.context.customerName).toBe("Updated Regional Medical Center");
    expect(refreshed.context.siteName).toBe("Updated Medical Tower");
    expect(refreshed.sections["report-info"]?.fields.facilityCustomer).toBe("Updated Regional Medical Center");
    expect(refreshed.sections["report-info"]?.fields.facilityAddress).toBe("4500 Current Care Blvd, Suite 200, Enid OK 73701");
    expect(refreshed.sections["executive-summary"]?.fields.summaryCustomerFacility).toBe("Updated Regional Medical Center");
  });
});
