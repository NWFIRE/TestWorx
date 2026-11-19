const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");

const root = "apps/web/src/app/app";
const retired = [
  "Open the tasks that most directly affect delivery and collected revenue.",
  "Live operational work ordered for quick scanning and action.",
  "Keep field work moving.",
  "Move the work forward.",
  "Operational work that is closest to billing completion.",
  "Keep services structured from day one.",
  "Move through the report from the top without shrinking the editing canvas below.",
  "Keep this page focused on discovery",
  "Available as optional expansion, not bundled clutter."
];
function inspect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (file.endsWith(".tsx")) {
      const source = fs.readFileSync(file, "utf8");
      const normalized = source.replace(/\s+/g, " ");
      for (const phrase of retired) assert(!normalized.includes(phrase), `${file}: retired filler reintroduced`);
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      assert.equal(ast.parseDiagnostics.length, 0, `${file}: invalid JSX`);
    }
  }
}
inspect(root);
for (const [file, text] of [
  ["admin/delete-inspection-card.tsx", "permanently delete"],
  ["admin/quotes/quote-editor-form.tsx", "QUOTE_TAX_DISCLAIMER"],
  ["tech/job-time-control.tsx", "Reports are not finalized"],
  ["tech/report-editor.tsx", "Every change saves to local device storage first"],
  ["admin/inspection-scheduler-form.tsx", "Potential Duplicate Inspection Detected"]
]) assert(fs.readFileSync(path.join(root, file), "utf8").includes(text), `${file}: required safety copy missing`);

// Optional one-time sweep audit: compare every interactive control against the pre-edit commit.
const base = process.argv[2];
if (base) {
  const files = execFileSync("git", ["diff", "--name-only", base, "--", root], { encoding: "utf8" }).trim().split(/\r?\n/).filter((f) => f.endsWith(".tsx"));
  function controls(file, source) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const result = [], tags = new Set(["form", "input", "button", "select", "textarea", "option", "a", "Link", "ActionButton"]);
    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && tags.has(node.tagName.getText(ast))) result.push(node.getText(ast).replace(/\s+/g, " "));
      ts.forEachChild(node, visit);
    }
    visit(ast); return result;
  }
  for (const file of files) {
    const before = execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    assert.deepEqual(controls(file, fs.readFileSync(file, "utf8")), controls(file, before), `${file}: interactive controls changed`);
  }
  console.log(`PASS: ${files.length} changed screens/components retain identical interactive controls and handlers.`);
}
console.log("PASS: retired workspace copy absent, JSX valid, safety warnings and tax/offline guidance retained.");
