# TradeWorx Native iOS Technician App

TradeWorx now includes a Capacitor-based iOS shell for the technician mobile product.

## What is in the repo

- `capacitor.config.ts`
  - technician-only app identity and remote server URL
- `ios/`
  - generated Capacitor iOS project
- native bridge wiring in:
  - `apps/web/src/app/app/tech/native-technician-bridge.tsx`
  - `apps/web/src/app/app/native-technician-route-guard.tsx`
- technician notification model and API:
  - `packages/lib/src/technician-notifications.ts`
  - `apps/web/src/app/api/tech/notifications/*`
  - `apps/web/src/app/api/tech/devices/route.ts`

## Scripts

- `npm run native:sync:ios`
- `npm run native:open:ios`

## Expected server URL

By default the native shell loads:

- `https://www.tradeworx.net/app/tech`

Override with:

- `CAPACITOR_SERVER_URL`

## App Store readiness follow-up

Before TestFlight / App Store submission, complete:

1. Configure Apple Developer signing and bundle ID in Xcode.
2. Add APNs credentials/provider plumbing for live push delivery.
3. Verify notification categories and badge handling on real iPhone devices.
4. Validate camera, photo, attachment, signature, and offline flows on-device.
5. Capture App Store screenshots and finalize privacy/support metadata.
