export type ServiceLocation = {
  id?: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function addressPart(value?: string | null) {
  const text = value?.trim() ?? "";
  return /^(unknown|n\/a|none|no fixed service address|no fixed site|general\s*\/\s*no fixed site)$/i.test(text) ? "" : text;
}

// Only accept the inspection's assigned service site. Never use customer/billing fallbacks.
export function serviceDestination(site?: ServiceLocation | null) {
  const street = addressPart(site?.addressLine1);
  const address = street ? [street, site?.addressLine2, site?.city, site?.state, site?.postalCode].map(addressPart).filter(Boolean).join(", ") : "";
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
