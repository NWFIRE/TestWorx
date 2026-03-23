import { PrismaClient } from "@prisma/client";

declare global {
  var __testworxPrisma: PrismaClient | undefined;
}

export const prisma = global.__testworxPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__testworxPrisma = prisma;
}

