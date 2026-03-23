const { PrismaClient } = require("@prisma/client");

const { loadRootEnv, warnIfPooledPostgres } = require("./load-root-env.cjs");

loadRootEnv();
warnIfPooledPostgres(process.env.DATABASE_URL, "verify");

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env and point it at your local PostgreSQL database before running db:verify.");
  }

  return databaseUrl;
}

async function main() {
  const databaseUrl = requireDatabaseUrl();
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    let migrationCount;
    try {
      migrationCount = await prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations"`;
    } catch (error) {
      throw new Error('Prisma migration metadata was not found. Run "npm run db:migrate" against this database before running db:verify.');
    }
    const [tenantCount, userCount, planCount] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.subscriptionPlan.count()
    ]);

    console.log("Database verification passed.");
    console.log(`Database URL: ${databaseUrl.replace(/:[^:@/]+@/, ":****@")}`);
    console.log(`Applied migrations: ${String(migrationCount[0]?.count ?? 0)}`);
    console.log(`Tenants: ${tenantCount}`);
    console.log(`Users: ${userCount}`);
    console.log(`Subscription plans: ${planCount}`);

    if (planCount < 3) {
      throw new Error("Expected at least 3 subscription plans after seeding. Run npm run db:seed against a clean local database.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
