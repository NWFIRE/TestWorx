import { z } from "zod";

const storageDriverSchema = z.enum(["inline", "vercel_blob"]);

const baseServerEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required. Set it to your PostgreSQL connection string."),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET is required and should be at least 16 characters."),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL."),
  APP_URL: z.string().url("APP_URL must be a valid URL."),
  STORAGE_DRIVER: storageDriverSchema.default("inline"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_PROFESSIONAL: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().optional(),
  QUICKBOOKS_CLIENT_ID: z.string().optional(),
  QUICKBOOKS_CLIENT_SECRET: z.string().optional(),
  QUICKBOOKS_SANDBOX: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().or(z.literal("")).optional()
});

export type ServerEnv = z.infer<typeof baseServerEnvSchema>;

let cachedEnv: ServerEnv | null = null;

function formatIssues(issues: z.ZodIssue[]) {
  return issues.map((issue) => `- ${issue.message}`).join("\n");
}

function normalizeOptionalEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseServerEnv(raw: NodeJS.ProcessEnv) {
  const parsed = baseServerEnvSchema.safeParse({
    DATABASE_URL: raw.DATABASE_URL,
    AUTH_SECRET: raw.AUTH_SECRET,
    NEXTAUTH_URL: raw.NEXTAUTH_URL,
    APP_URL: raw.APP_URL,
    STORAGE_DRIVER: raw.STORAGE_DRIVER ?? "inline",
    BLOB_READ_WRITE_TOKEN: raw.BLOB_READ_WRITE_TOKEN,
    STRIPE_PUBLISHABLE_KEY: raw.STRIPE_PUBLISHABLE_KEY,
    STRIPE_SECRET_KEY: raw.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: raw.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_STARTER: raw.STRIPE_PRICE_STARTER,
    STRIPE_PRICE_PROFESSIONAL: raw.STRIPE_PRICE_PROFESSIONAL,
    STRIPE_PRICE_ENTERPRISE: raw.STRIPE_PRICE_ENTERPRISE,
    QUICKBOOKS_CLIENT_ID: raw.QUICKBOOKS_CLIENT_ID,
    QUICKBOOKS_CLIENT_SECRET: raw.QUICKBOOKS_CLIENT_SECRET,
    QUICKBOOKS_SANDBOX: raw.QUICKBOOKS_SANDBOX,
    RESEND_API_KEY: raw.RESEND_API_KEY,
    RESEND_FROM_EMAIL: raw.RESEND_FROM_EMAIL
  });

  if (!parsed.success) {
    throw new Error(
      `Environment validation failed.\n${formatIssues(parsed.error.issues)}\nCopy .env.example to .env and fill in the missing values.`
    );
  }

  const env = parsed.data;
  if (env.STORAGE_DRIVER === "vercel_blob" && !env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Environment validation failed.\n- BLOB_READ_WRITE_TOKEN is required when STORAGE_DRIVER=vercel_blob.");
  }

  return env;
}

export function getServerEnv() {
  if (!cachedEnv) {
    cachedEnv = parseServerEnv(process.env);
  }

  return cachedEnv;
}

export function assertEnvForFeature(feature: "database" | "auth" | "storage" | "stripe" | "stripe-webhook" | "quickbooks") {
  const env = getServerEnv();

  if (feature === "database") {
    return { DATABASE_URL: env.DATABASE_URL };
  }

  if (feature === "auth") {
    return {
      AUTH_SECRET: env.AUTH_SECRET,
      NEXTAUTH_URL: env.NEXTAUTH_URL,
      APP_URL: env.APP_URL
    };
  }

  if (feature === "storage") {
    if (env.STORAGE_DRIVER === "vercel_blob" && !env.BLOB_READ_WRITE_TOKEN) {
      throw new Error("Storage is configured for Vercel Blob but BLOB_READ_WRITE_TOKEN is missing.");
    }

    return {
      STORAGE_DRIVER: env.STORAGE_DRIVER,
      BLOB_READ_WRITE_TOKEN: env.BLOB_READ_WRITE_TOKEN ?? null
    };
  }

  if (feature === "stripe" || feature === "stripe-webhook") {
    const missing: string[] = [];
    if (!env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
    if (!env.STRIPE_PUBLISHABLE_KEY) missing.push("STRIPE_PUBLISHABLE_KEY");
    if (!env.STRIPE_PRICE_STARTER) missing.push("STRIPE_PRICE_STARTER");
    if (!env.STRIPE_PRICE_PROFESSIONAL) missing.push("STRIPE_PRICE_PROFESSIONAL");
    if (feature === "stripe-webhook" && !env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");

    if (missing.length > 0) {
      throw new Error(`Stripe billing is not fully configured. Missing: ${missing.join(", ")}.`);
    }

    return {
      STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
      STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY,
      STRIPE_PRICE_STARTER: env.STRIPE_PRICE_STARTER,
      STRIPE_PRICE_PROFESSIONAL: env.STRIPE_PRICE_PROFESSIONAL,
      STRIPE_PRICE_ENTERPRISE: env.STRIPE_PRICE_ENTERPRISE ?? null,
      STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET ?? null
    };
  }

  if (feature === "quickbooks") {
    const missing: string[] = [];
    if (!env.QUICKBOOKS_CLIENT_ID) missing.push("QUICKBOOKS_CLIENT_ID");
    if (!env.QUICKBOOKS_CLIENT_SECRET) missing.push("QUICKBOOKS_CLIENT_SECRET");

    if (missing.length > 0) {
      throw new Error(`QuickBooks is not fully configured. Missing: ${missing.join(", ")}.`);
    }

    return {
      QUICKBOOKS_CLIENT_ID: env.QUICKBOOKS_CLIENT_ID,
      QUICKBOOKS_CLIENT_SECRET: env.QUICKBOOKS_CLIENT_SECRET,
      QUICKBOOKS_SANDBOX: (env.QUICKBOOKS_SANDBOX ?? "true").toLowerCase() !== "false"
    };
  }

  return env;
}

export function getOptionalStripeEnv() {
  const env = getServerEnv();
  return {
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY ?? null,
    STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY ?? null,
    STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET ?? null,
    STRIPE_PRICE_STARTER: env.STRIPE_PRICE_STARTER ?? null,
    STRIPE_PRICE_PROFESSIONAL: env.STRIPE_PRICE_PROFESSIONAL ?? null,
    STRIPE_PRICE_ENTERPRISE: env.STRIPE_PRICE_ENTERPRISE ?? null
  };
}

export function getOptionalQuickBooksEnv() {
  const env = getServerEnv();
  return {
    QUICKBOOKS_CLIENT_ID: env.QUICKBOOKS_CLIENT_ID ?? null,
    QUICKBOOKS_CLIENT_SECRET: env.QUICKBOOKS_CLIENT_SECRET ?? null,
    QUICKBOOKS_SANDBOX: (env.QUICKBOOKS_SANDBOX ?? "true").toLowerCase() !== "false"
  };
}

export function getOptionalEmailEnv() {
  const env = getServerEnv();
  return {
    RESEND_API_KEY: normalizeOptionalEnvValue(env.RESEND_API_KEY) ?? null,
    RESEND_FROM_EMAIL: normalizeOptionalEnvValue(env.RESEND_FROM_EMAIL) ?? null
  };
}

export function resetServerEnvForTests() {
  cachedEnv = null;
}
