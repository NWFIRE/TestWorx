export type ServiceLocation = {
  id?: string;
  name?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  country?: string | null;
};

export type CustomerLocation = {
  id?: string;
  serviceAddressLine1?: string | null; serviceAddressLine2?: string | null;
  serviceCity?: string | null; serviceState?: string | null; servicePostalCode?: string | null; serviceCountry?: string | null;
  billingAddressLine1?: string | null; billingAddressLine2?: string | null;
  billingCity?: string | null; billingState?: string | null; billingPostalCode?: string | null; billingCountry?: string | null;
};

// Matches the customer's profile: primary service address, then its listed account address.
export function inspectionServiceLocation(site?: ServiceLocation | null, customer?: CustomerLocation | null): ServiceLocation | null {
  const customerAddress: ServiceLocation | null = addressPart(customer?.serviceAddressLine1) ? {
    addressLine1: customer?.serviceAddressLine1, addressLine2: customer?.serviceAddressLine2,
    city: customer?.serviceCity, state: customer?.serviceState, postalCode: customer?.servicePostalCode, country: customer?.serviceCountry
  } : addressPart(customer?.billingAddressLine1) ? {
    addressLine1: customer?.billingAddressLine1, addressLine2: customer?.billingAddressLine2,
    city: customer?.billingCity, state: customer?.billingState, postalCode: customer?.billingPostalCode, country: customer?.billingCountry
  } : null;
  const generic = /^general\s*\/\s*no fixed site$/i.test(site?.name?.trim() ?? "");
  const address = !generic && addressPart(site?.addressLine1) ? site : customerAddress ?? site;
  // A saved entrance pin belongs to this visit's site even when its street label comes from the customer.
  return address ? { ...address, latitude: site?.latitude, longitude: site?.longitude } : null;
}

function addressPart(value?: string | null) {
  const text = value?.trim() ?? "";
  return /^(unknown|n\/a|none|no fixed service address|no fixed site|general\s*\/\s*no fixed site)$/i.test(text) ? "" : text;
}

export function serviceDestination(site?: ServiceLocation | null, customer?: CustomerLocation | null) {
  const location = inspectionServiceLocation(site, customer);
  const street = addressPart(location?.addressLine1);
  const address = street ? [street, location?.addressLine2, location?.city, location?.state, location?.postalCode, location?.country].map(addressPart).filter(Boolean).join(", ") : "";
  const lat = site?.latitude, lng = site?.longitude;
  const hasPin = typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
  return { address, destination: hasPin ? `${lat},${lng}` : address, hasPin };
}

export function drivingDirectionsUrl(destination: string, userAgent = "", touchPoints = 0) {
  const apple = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
  return apple
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving&dir_action=navigate`;
}
