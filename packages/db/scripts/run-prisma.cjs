const { spawnSync } = require("child_process");
const path = require("path");

const { loadRootEnv, warnIfPooledPostgres } = require("./load-root-env.cjs");

loadRootEnv();
warnIfPooledPostgres(process.env.DATABASE_URL, "prisma");

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node ./scripts/run-prisma.cjs <prisma-args...>");
  process.exit(1);
}

const prismaCli = path.resolve(__dirname, "..", "..", "..", "node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCli, ...args], {
  stdio: "inherit",
  env: process.env,
  cwd: path.resolve(__dirname, "..")
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
