import { describe, expect, it } from "vitest";
import { drivingDirectionsUrl, serviceDestination } from "../service-directions";

const first = { addressLine1: "10 Main St", addressLine2: "Unit 2", city: "Enid", state: "OK", postalCode: "73701" };
describe("inspection driving directions", () => {
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
