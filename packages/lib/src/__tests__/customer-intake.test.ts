import { describe, expect, it } from "vitest";

import { customerIntakeSendSchema, customerIntakeSubmissionSchema } from "../customer-intake";

describe("customer intake validation", () => {
  it("accepts a complete customer intake submission", () => {
    const parsed = customerIntakeSubmissionSchema.parse({
      companyName: "Axis Energy",
      primaryContactName: "Alex Rivera",
      primaryContactEmail: "alex@axis.test",
      primaryContactPhone: "405-555-0100",
      companyWebsite: "https://axis.test",
      billingContactName: "Accounts Payable",
      billingEmail: "ap@axis.test",
      billingPhone: "405-555-0101",
      billingAddressLine1: "100 Market St",
      billingCity: "Oklahoma City",
      billingState: "OK",
      billingPostalCode: "73102",
      siteAddressLine1: "200 Service Rd",
      siteCity: "Oklahoma City",
      siteState: "OK",
      sitePostalCode: "73103",
      requestedServiceType: "Fire extinguisher inspection",
      systemTypes: ["fire_extinguishers", "wet_chemical_system", "industrial_dry_chemical_system", "emergency_exit_lights"],
      preferredServiceDate: "2026-05-01",
      preferredTimeWindow: "Morning",
      preferredServiceWindow: "2026-05-01 · Morning",
      serviceNotes: "Please call before arrival."
    });

    expect(parsed.companyName).toBe("Axis Energy");
    expect(parsed.systemTypes).toEqual(["fire_extinguishers", "wet_chemical_system", "industrial_dry_chemical_system", "emergency_exit_lights"]);
    expect(parsed.companyWebsite).toBe("https://axis.test");
    expect(parsed.billingContactName).toBe("Accounts Payable");
  });

  it("requires at least one actionable system type", () => {
    const parsed = customerIntakeSubmissionSchema.safeParse({
      companyName: "Axis Energy",
      primaryContactName: "Alex Rivera",
      primaryContactEmail: "alex@axis.test",
      primaryContactPhone: "405-555-0100",
      billingEmail: "ap@axis.test",
      billingAddressLine1: "100 Market St",
      billingCity: "Oklahoma City",
      billingState: "OK",
      billingPostalCode: "73102",
      siteAddressLine1: "200 Service Rd",
      siteCity: "Oklahoma City",
      siteState: "OK",
      sitePostalCode: "73103",
      requestedServiceType: "Repair",
      systemTypes: []
    });

    expect(parsed.success).toBe(false);
  });

  it("normalizes optional send-form fields to null", () => {
    const parsed = customerIntakeSendSchema.parse({
      recipientEmail: "customer@example.com",
      recipientName: "",
      optionalMessage: ""
    });

    expect(parsed.recipientName).toBeNull();
    expect(parsed.optionalMessage).toBeNull();
  });
});
