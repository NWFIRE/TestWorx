const { spawnSync } = require("child_process");
const path = require("path");

const { loadRootEnv, warnIfPooledPostgres } = require("./load-root-env.cjs");

loadRootEnv();
warnIfPooledPostgres(process.env.DATABASE_URL, "bootstrap:pilot");

const tsxCli = path.resolve(__dirname, "..", "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
const bootstrapPath = path.resolve(__dirname, "..", "prisma", "bootstrap-pilot.ts");
const result = spawnSync(process.execPath, [tsxCli, bootstrapPath], {
  stdio: "inherit",
  env: process.env,
  cwd: path.resolve(__dirname, "..")
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
