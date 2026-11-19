# Inspection driving directions

Inspection headers, technician agendas, and Scheduler job details share a relationship-based destination resolver. A named assigned site with its own street address takes precedence. Otherwise the linked customer's primary service address is used, followed by its listed account/billing address when no primary service street exists. Generic sites prefer the current customer address, not stale placeholder/copy data. This is resolved on read for existing and new inspections without any save or backfill. A valid saved latitude/longitude pair takes precedence for routing; the resolved street address remains visible. Location needed is shown only after the data loads and no usable address or pin exists.

Office and tenant administrators can use Add location / Edit location on an inspection or Scheduler detail. Edits apply to the shared service site, are tenant-scoped, and are audited. Both coordinates must be provided together (latitude -90..90, longitude -180..180); clearing both restores address routing. The additive Site migration must run before deployment.

Get directions is an external HTTPS link in a new tab: Apple Maps on iPhone/iPad, Google Maps elsewhere. Maps handles starting location and app/browser fallback. It never calls report, inspection-status, or job-timer mutations. Parent job-card click/keyboard handlers are isolated. No map SDK, API key, or geolocation permission is needed in TradeWorx.

References: https://developer.apple.com/documentation/mapkit/unified-map-urls and https://developers.google.com/maps/documentation/urls/get-started

Tests: service-directions.test.ts and service-location.test.ts cover address-only sites, multiple properties, entrance pins, missing sites, platform links, immutability, tenant authorization, and coordinate validation. Physical app handoff should also be checked on iPhone/iPad and Android.
