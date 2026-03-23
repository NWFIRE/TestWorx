const { spawnSync } = require("child_process");
const path = require("path");

const { loadRootEnv, warnIfPooledPostgres } = require("./load-root-env.cjs");

loadRootEnv();
warnIfPooledPostgres(process.env.DATABASE_URL, "seed");

const tsxCli = path.resolve(__dirname, "..", "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
const seedPath = path.resolve(__dirname, "..", "prisma", "seed.ts");
const result = spawnSync(process.execPath, [tsxCli, seedPath], {
  stdio: "inherit",
  env: process.env,
  cwd: path.resolve(__dirname, "..")
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
