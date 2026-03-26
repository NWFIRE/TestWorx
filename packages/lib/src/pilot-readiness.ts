import { getServerEnv } from "./env";
import { privateBlobStoreRequiredMessage } from "./storage";

export type PilotReadinessLevel = "ready" | "action_required" | "optional";
export type PilotReadinessSeverity = "critical" | "recommended" | "optional";

export type PilotReadinessCheck = {
  id: string;
  label: string;
  level: PilotReadinessLevel;
  severity: PilotReadinessSeverity;
  detail: string;
};

export type PilotReadinessStatus = {
  readyForPilot: boolean;
  summary: string;
  criticalCount: number;
  recommendedCount: number;
  optionalCount: number;
  checks: PilotReadinessCheck[];
};

type PilotReadinessInput = {
  stripeConfigured?: boolean;
  stripeWebhookConfigured?: boolean;
  quickBooksConfigured?: boolean;
  quickBooksConnected?: boolean;
  quickBooksMode?: "sandbox" | "live" | null;
  quickBooksReconnectRequired?: boolean;
};

function isLocalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function isSecureRemoteUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !isLocalUrl(value);
  } catch {
    return false;
  }
}

function buildCheck(
  id: string,
  label: string,
  level: PilotReadinessLevel,
  severity: PilotReadinessSeverity,
  detail: string
): PilotReadinessCheck {
  return { id, label, level, severity, detail };
}

export function evaluatePilotReadiness(input: PilotReadinessInput = {}): PilotReadinessStatus {
  const env = getServerEnv();
  const checks: PilotReadinessCheck[] = [];

  const deploymentReady = isSecureRemoteUrl(env.APP_URL) && isSecureRemoteUrl(env.NEXTAUTH_URL);
  checks.push(
    deploymentReady
      ? buildCheck(
          "deployment",
          "Public app URL",
          "ready",
          "critical",
          "APP_URL and NEXTAUTH_URL point to a secure non-local domain."
        )
      : buildCheck(
          "deployment",
          "Public app URL",
          "action_required",
          "critical",
          "APP_URL and NEXTAUTH_URL still need to point at your real HTTPS domain before technicians can rely on the app in the field."
        )
  );

  const storageReady = env.STORAGE_DRIVER === "vercel_blob" && Boolean(env.BLOB_READ_WRITE_TOKEN);
  checks.push(
    storageReady
      ? buildCheck(
          "storage",
          "Durable report media storage",
          "ready",
          "critical",
          `Photos, signatures, PDFs, and uploads are configured for durable blob storage. ${privateBlobStoreRequiredMessage}`
        )
      : buildCheck(
          "storage",
          "Durable report media storage",
          "action_required",
          "critical",
          `Report media is still using inline/demo storage. Switch to Vercel Blob with a real token before pilot use so field photos and PDFs stay durable. ${privateBlobStoreRequiredMessage}`
        )
  );

  checks.push(
    input.quickBooksConfigured
      ? input.quickBooksConnected && input.quickBooksMode === "live" && !input.quickBooksReconnectRequired
        ? buildCheck(
            "quickbooks",
            "QuickBooks invoice sync",
            "ready",
            "recommended",
            "QuickBooks is configured in live mode and ready for import and invoice sync."
          )
        : buildCheck(
            "quickbooks",
            "QuickBooks invoice sync",
            "action_required",
            "recommended",
            "QuickBooks is configured but still needs a healthy live connection before imports and invoice sync are safe."
          )
      : buildCheck(
          "quickbooks",
          "QuickBooks invoice sync",
          "optional",
          "optional",
          "QuickBooks is not fully configured yet. This does not block a field pilot unless you need accounting sync immediately."
        )
  );

  checks.push(
    input.stripeConfigured
      ? input.stripeWebhookConfigured
        ? buildCheck(
            "stripe",
            "Stripe subscription billing",
            "ready",
            "optional",
            "Stripe checkout and webhook sync are configured."
          )
        : buildCheck(
            "stripe",
            "Stripe subscription billing",
            "action_required",
            "optional",
            "Stripe keys exist, but webhook sync is still incomplete. This only matters if you need customer subscription billing during the pilot."
          )
      : buildCheck(
          "stripe",
          "Stripe subscription billing",
          "optional",
          "optional",
          "Stripe is not configured yet. Safe to defer if your pilot is internal-only."
        )
  );

  const criticalCount = checks.filter((check) => check.level === "action_required" && check.severity === "critical").length;
  const recommendedCount = checks.filter((check) => check.level === "action_required" && check.severity === "recommended").length;
  const optionalCount = checks.filter((check) => check.level !== "ready" && check.severity === "optional").length;

  return {
    readyForPilot: criticalCount === 0,
    summary:
      criticalCount === 0
        ? recommendedCount === 0
          ? "Pilot-ready from an app infrastructure standpoint."
          : "Core pilot blockers are cleared, with a few recommended follow-ups remaining."
        : "Pilot blockers still need attention before daily field use.",
    criticalCount,
    recommendedCount,
    optionalCount,
    checks
  };
}
