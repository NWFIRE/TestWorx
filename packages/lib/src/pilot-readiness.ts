import { getServerEnv } from "./env";
import { privateBlobStoreRequiredMessage } from "./storage";

export type SystemReadinessLevel = "ready" | "action_required" | "optional";
export type SystemReadinessSeverity = "critical" | "recommended" | "optional";

export type SystemReadinessCheck = {
  id: string;
  label: string;
  level: SystemReadinessLevel;
  severity: SystemReadinessSeverity;
  detail: string;
};

export type SystemReadinessStatus = {
  ready: boolean;
  summary: string;
  criticalCount: number;
  recommendedCount: number;
  optionalCount: number;
  checks: SystemReadinessCheck[];
};

type SystemReadinessInput = {
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
  level: SystemReadinessLevel,
  severity: SystemReadinessSeverity,
  detail: string
): SystemReadinessCheck {
  return { id, label, level, severity, detail };
}

export function evaluateSystemReadiness(input: SystemReadinessInput = {}): SystemReadinessStatus {
  const env = getServerEnv();
  const checks: SystemReadinessCheck[] = [];

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
          "APP_URL and NEXTAUTH_URL still need to point at your real HTTPS domain before the app is fully ready for production use."
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
          `Report media is still using inline/demo storage. Switch to Vercel Blob with a real token so field photos and PDFs stay durable. ${privateBlobStoreRequiredMessage}`
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
          "QuickBooks is not fully configured yet. This can remain optional unless you need accounting sync immediately."
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
            "Stripe keys exist, but webhook sync is still incomplete. This only matters if you need customer subscription billing now."
          )
      : buildCheck(
          "stripe",
          "Stripe subscription billing",
          "optional",
          "optional",
          "Stripe is not configured yet. Safe to defer if subscription billing is not in use yet."
        )
  );

  const criticalCount = checks.filter((check) => check.level === "action_required" && check.severity === "critical").length;
  const recommendedCount = checks.filter((check) => check.level === "action_required" && check.severity === "recommended").length;
  const optionalCount = checks.filter((check) => check.level !== "ready" && check.severity === "optional").length;

  return {
    ready: criticalCount === 0,
    summary:
      criticalCount === 0
        ? recommendedCount === 0
          ? "System configuration is ready."
          : "Core system configuration is ready, with a few recommended follow-ups remaining."
        : "Configuration updates are still required before the system is fully ready.",
    criticalCount,
    recommendedCount,
    optionalCount,
    checks
  };
}

// Backward-compatible alias for any internal callers not yet updated.
export const evaluatePilotReadiness = evaluateSystemReadiness;
