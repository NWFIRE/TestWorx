const fs = require("fs");
const path = require("path");

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function loadRootEnv() {
  const envPath = path.resolve(__dirname, "..", "..", "..", ".env");
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const contents = fs.readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = stripQuotes(line.slice(equalsIndex + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return envPath;
}

function warnIfPooledPostgres(databaseUrl, context) {
  if (!databaseUrl) {
    return;
  }

  if (databaseUrl.includes("-pooler.") || databaseUrl.includes("pooler")) {
    console.warn(`[db] ${context}: DATABASE_URL appears to be a pooled connection string.`);
    console.warn("[db] For Prisma migrate/seed/verify flows, prefer the provider's direct PostgreSQL connection string.");
  }
}

module.exports = {
  loadRootEnv,
  warnIfPooledPostgres
};
