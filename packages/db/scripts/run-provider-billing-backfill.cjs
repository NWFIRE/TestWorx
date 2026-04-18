const { spawnSync } = require("child_process");
const path = require("path");

const { loadRootEnv, warnIfPooledPostgres } = require("./load-root-env.cjs");

loadRootEnv();
warnIfPooledPostgres(process.env.DATABASE_URL, "provider-billing-backfill");

const tsxCli = path.resolve(__dirname, "..", "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
const scriptPath = path.resolve(__dirname, "..", "prisma", "backfill-provider-billing.ts");
const args = process.argv.slice(2);

const result = spawnSync(process.execPath, [tsxCli, scriptPath, ...args], {
  stdio: "inherit",
  env: process.env,
  cwd: path.resolve(__dirname, "..")
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
