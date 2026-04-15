import { PrismaClient } from "@prisma/client";

declare global {
  var __testworxPrisma: PrismaClient | undefined;
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function resolvePrismaRuntimeUrl() {
  const explicitRuntimeUrl =
    readOptionalEnv("PRISMA_RUNTIME_DATABASE_URL") ?? readOptionalEnv("POSTGRES_PRISMA_URL");
  const pooledUrl = readOptionalEnv("DATABASE_URL");
  const unpooledUrl =
    readOptionalEnv("DATABASE_URL_UNPOOLED") ?? readOptionalEnv("POSTGRES_URL_NON_POOLING");

  if (explicitRuntimeUrl) {
    return explicitRuntimeUrl;
  }

  // Runtime app traffic should prefer the pooled connection.
  // Direct/unpooled connections remain useful as a fallback when no pooled URL exists
  // and for migration scripts that instantiate Prisma separately.
  return pooledUrl ?? unpooledUrl;
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

