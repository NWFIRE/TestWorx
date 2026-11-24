const assert = require("node:assert/strict");
const fs = require("node:fs");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const { buildSync } = require("esbuild");

// Compile the real styles: catches missing utility generation and media scoping.
async function main() {
  const compiled = buildSync({ entryPoints: ["apps/web/src/app/search-select-layout.ts"], bundle: true, write: false, platform: "node", format: "cjs" });
  const mod = { exports: {} };
  new Function("module", "exports", compiled.outputFiles[0].text)(mod, mod.exports);
  const layout = mod.exports.getSearchMenuLayout;
  assert.equal(layout({ top: 180, bottom: 228, viewportWidth: 800, viewportHeight: 450 }).maxHeight, 206);
  assert.equal(layout({ top: 350, bottom: 398, viewportWidth: 800, viewportHeight: 450, contentTop: 78 }).bottom, "calc(100% + 8px)");
  assert.equal(layout({ top: 100, bottom: 148, viewportWidth: 1920, viewportHeight: 1080 }).maxHeight, 288);
  assert.equal(layout({ top: 180, bottom: 228, viewportWidth: 390, viewportHeight: 844 }), undefined);
  assert.equal(layout({ top: -100, bottom: 450, viewportWidth: 800, viewportHeight: 450 }).maxHeight, 0);
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
  rule(".inspection-table-scroll > :first-child", "padding-inline", "33px", "(min-width: 1024px)");
  assert.doesNotMatch(css, /container(?:-type)?\s*:/, "Do not turn the shell into a containing block for report dialogs");
  rule(".workspace-content .workspace-page-header", "flex-wrap", "wrap", "(min-width: 1024px)");
  rule(".workspace-content .workspace-page-header", "flex-direction", "row", "(min-width: 1024px)");
  rule(".workspace-content .workspace-page-actions", "width", "auto", "(min-width: 1024px)");
  rule(".workspace-content .workspace-split", "display", "flex", "(min-width: 1024px)");
  rule(".workspace-split > *", "flex", "1 1 36rem", "(min-width: 1024px)");
  rule(".workspace-line-fields", "grid-template-columns", "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))", "(min-width: 1024px)");
  const inspections = fs.readFileSync("apps/web/src/app/app/admin/inspections/page.tsx", "utf8");
  assert.match(inspections, /inspection-table-scroll.*role="region".*tabIndex=\{0\}/);
  assert.match(inspections, /<FastInspectionDeleteButton/);
  const shell = fs.readFileSync("apps/web/src/app/app/app-shell.tsx", "utf8");
  assert.match(shell, /!isScheduler && isTechnician && <header/);
  assert.doesNotMatch(shell, /<DesktopBackButton|aria-label="Refresh page"/);
  rule(".md\\:will-change-auto", "will-change", "auto", "(min-width: 768px)");
  rule(".md\\:backdrop-filter-none", "backdrop-filter", "none", "(min-width: 768px)");
  console.log("Desktop layout CSS regression checks passed. Browser verification is separate.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
