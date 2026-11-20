const assert = require("node:assert/strict");
const fs = require("node:fs");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

// Compile the real styles: catches missing utility generation and media scoping.
async function main() {
  const css = fs.readFileSync("apps/web/src/app/globals.css", "utf8");
  const result = await postcss([tailwind({
    content: ["apps/web/src/**/*.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    theme: { extend: { colors: { paper: "#E9EEF6", ink: "#07111F" } } }
  })]).process(css, { from: "apps/web/src/app/globals.css" });
  const root = postcss.parse(result.css);
  function rule(selector, property, value, parent) {
    let found = false;
    root.walkRules(selector, node => {
      if (!node.nodes.some(d => d.prop === property && d.value === value)) return;
      if (parent) assert.equal(node.parent.params, parent, `${selector} must preserve the phone layout`);
      found = true;
    });
    assert.ok(found, `Missing ${selector}: ${property}: ${value}`);
  }
  rule(".inspection-table-scroll", "overflow-x", "auto", "(min-width: 1024px)");
  rule(".inspection-table-scroll > *", "min-width", "1200px", "(min-width: 1024px)");
  assert.doesNotMatch(css, /container(?:-type)?\s*:/, "Do not turn the shell into a containing block for report dialogs");
  rule(".workspace-page-header", "flex-wrap", "wrap", "(min-width: 1024px)");
  rule(".workspace-split > *", "flex", "1 1 36rem", "(min-width: 1024px)");
  rule(".workspace-line-fields", "grid-template-columns", "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))", "(min-width: 1024px)");
  const inspections = fs.readFileSync("apps/web/src/app/app/admin/inspections/page.tsx", "utf8");
  assert.match(inspections, /inspection-table-scroll.*role="region".*tabIndex=\{0\}/);
  assert.match(inspections, /<FastInspectionDeleteButton/);
  const shell = fs.readFileSync("apps/web/src/app/app/app-shell.tsx", "utf8");
  assert.match(shell, /<header className="sticky top-0 z-30 shrink-0/);
  console.log("Desktop layout CSS regression checks passed (8 assertions). Browser verification is separate.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
