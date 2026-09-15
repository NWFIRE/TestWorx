const { registerHooks } = require("node:module");
const { pathToFileURL } = require("node:url");
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: pathToFileURL(require.resolve("next/dist/compiled/server-only/empty.js")).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
require("tsx/cjs");
require("tsx/esm/api").register();
require("./hold-recovered-billing.ts");
