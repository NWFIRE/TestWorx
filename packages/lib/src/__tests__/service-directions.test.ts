import { describe, expect, it } from "vitest";
import { drivingDirectionsUrl, serviceDestination } from "../service-directions";

const first = { addressLine1: "10 Main St", addressLine2: "Unit 2", city: "Enid", state: "OK", postalCode: "73701" };
describe("inspection driving directions", () => {
  const customer = { serviceAddressLine1: "38558 S. County Road 270", serviceCity: "Meno", serviceState: "OK", servicePostalCode: "73760", serviceCountry: "USA", billingAddressLine1: "P. O. Box 169" };
  it("resolves the reported placeholder-site case from the existing customer relationship", () => {
    const site = { name: "General / No Fixed Site", addressLine1: "No fixed service address", city: "Unknown" };
    expect(serviceDestination(site, customer).address).toBe("38558 S. County Road 270, Meno, OK, 73760, USA");
    expect(serviceDestination(site, customer).destination).not.toContain("Box 169");
  });
  it("prefers a different assigned property over the customer default", () => {
    expect(serviceDestination({ ...first, name: "Other property" }, customer).address).toBe(serviceDestination(first).address);
  });
  it("uses the customer default for a generic site even with a stale copied address", () => {
    expect(serviceDestination({ ...first, name: "General / No Fixed Site" }, customer).address).toContain("38558");
  });
  it("uses the listed account address when there is no primary service street", () => {
    expect(serviceDestination(null, { billingAddressLine1: "20 Oak", billingCity: "Enid" }).address).toBe("20 Oak, Enid");
  });
  it("does not let a partial site or service address hide a full customer address", () => {
    expect(serviceDestination({ city: "Unknown" }, { serviceCity: "Enid", billingAddressLine1: "20 Oak" }).address).toBe("20 Oak");
  });
  it("keeps the saved entrance pin with the customer street label", () => {
    expect(serviceDestination({ latitude: 36.4, longitude: -97.9 }, customer)).toMatchObject({ destination: "36.4,-97.9", hasPin: true, address: "38558 S. County Road 270, Meno, OK, 73760, USA" });
  });
  it("reports missing only when both sources have no usable address or pin", () => {
    expect(serviceDestination({ addressLine1: "No fixed service address" }, { serviceAddressLine1: "Unknown", billingAddressLine1: "" }).destination).toBe("");
  });
  it("reflects customer updates without modifying or resaving the inspection", () => {
    const site = Object.freeze({ name: "General / No Fixed Site" });
    expect(serviceDestination(site, { serviceAddressLine1: "Old address" }).address).toBe("Old address");
    expect(serviceDestination(site, { serviceAddressLine1: "New address" }).address).toBe("New address");
  });
  it("routes existing address-only sites without backfill", () => {
    expect(serviceDestination(first)).toEqual({ address: "10 Main St, Unit 2, Enid, OK, 73701", destination: "10 Main St, Unit 2, Enid, OK, 73701", hasPin: false });
  });
  it("uses the selected property, never the customer's billing address", () => {
    const customer = { billingAddress: "999 Wrong Road" };
    const inspections = [first, { ...first, addressLine1: "20 Other Rd" }].map((site) => ({ site, customer }));
    expect(inspections.map((job) => serviceDestination(job.site).destination)).toEqual(["10 Main St, Unit 2, Enid, OK, 73701", "20 Other Rd, Unit 2, Enid, OK, 73701"]);
  });
  it("prefers the entrance pin but preserves the recognizable address", () => {
    const result = serviceDestination({ ...first, latitude: 36.4, longitude: -97.9 });
    expect(result.destination).toBe("36.4,-97.9");
    expect(result.address).toContain("10 Main St");
    expect(result.hasPin).toBe(true);
  });
  it.each([undefined, {}, { addressLine1: "No fixed service address", city: "Unknown" }, { city: "Enid" }])("does not navigate to a missing/placeholder location", (site) => {
    expect(serviceDestination(site).destination).toBe("");
  });
  it.each([{ latitude: 91, longitude: 1 }, { latitude: 1, longitude: null }, { latitude: NaN, longitude: 2 }])("falls back safely when a pin is invalid", (pin) => {
    expect(serviceDestination({ ...first, ...pin }).destination).toBe(serviceDestination(first).address);
  });
  it("accepts zero coordinates", () => expect(serviceDestination({ latitude: 0, longitude: 0 }).destination).toBe("0,0"));
  it.each(["iPhone", "iPad", "iPod"])("uses Apple driving directions on %s", (ua) => {
    const url = new URL(drivingDirectionsUrl("36.4,-97.9", ua));
    expect(url.host).toBe("maps.apple.com"); expect(url.searchParams.get("daddr")).toBe("36.4,-97.9"); expect(url.searchParams.get("dirflg")).toBe("d"); expect(url.searchParams.has("saddr")).toBe(false);
  });
  it("recognizes iPad desktop mode", () => expect(drivingDirectionsUrl("x", "Macintosh", 5)).toContain("maps.apple.com"));
  it.each(["Android", "Windows", "Macintosh", ""])("uses browser-compatible Google driving directions on %s", (ua) => {
    const url = new URL(drivingDirectionsUrl("10 Main & Oak #2", ua));
    expect(url.host).toBe("www.google.com"); expect(url.searchParams.get("destination")).toBe("10 Main & Oak #2"); expect(url.searchParams.get("travelmode")).toBe("driving"); expect(url.searchParams.has("origin")).toBe(false);
  });
  it("is read-only and identical across inspection and scheduler", () => {
    const site = Object.freeze({ ...first, latitude: 36.4, longitude: -97.9 });
    const job = Object.freeze({ site, status: "to_be_completed", progress: 0 });
    const before = JSON.stringify(job);
    expect(drivingDirectionsUrl(serviceDestination(job.site).destination)).toBe(drivingDirectionsUrl(serviceDestination(site).destination));
    expect(JSON.stringify(job)).toBe(before);
  });
});
