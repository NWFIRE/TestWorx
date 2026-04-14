import { PrismaClient } from "@prisma/client";

declare global {
  var __testworxPrisma: PrismaClient | undefined;
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function resolvePrismaRuntimeUrl() {
  const pooledUrl = readOptionalEnv("DATABASE_URL");
  const unpooledUrl =
    readOptionalEnv("DATABASE_URL_UNPOOLED") ?? readOptionalEnv("POSTGRES_URL_NON_POOLING");
  const productionRuntime =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

  // Prefer the direct Neon host in production when both URLs are present.
  // This avoids pooler-specific reachability issues for Prisma runtime queries.
  if (productionRuntime && pooledUrl?.includes("-pooler.") && unpooledUrl) {
    return unpooledUrl;
  }

  return pooledUrl;
}

const prismaRuntimeUrl = resolvePrismaRuntimeUrl();

export const prisma =
  global.__testworxPrisma ??
  new PrismaClient(
    prismaRuntimeUrl
      ? {
          datasources: {
            db: {
              url: prismaRuntimeUrl
            }
          }
        }
      : undefined
  );

if (process.env.NODE_ENV !== "production") {
  global.__testworxPrisma = prisma;
}

