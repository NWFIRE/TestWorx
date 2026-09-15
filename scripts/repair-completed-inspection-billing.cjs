// Node 22.15+ CLI entry point: Next.js supplies this marker in the app runtime.
const { registerHooks } = require("node:module");
const { pathToFileURL } = require("node:url");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: pathToFileURL(require.resolve("next/dist/compiled/server-only/empty.js")).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});
require("tsx/cjs");
require("tsx/esm/api").register();
require("./repair-completed-inspection-billing.ts");
