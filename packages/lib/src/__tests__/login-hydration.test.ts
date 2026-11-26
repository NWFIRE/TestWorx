import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { expect, it } from "vitest";

it("server-rendered login cannot submit credentials before client initialization", () => {
  const require = createRequire(import.meta.url);
  const exports: any = {};
  const source = ts.transpileModule(readFileSync(new URL("../../../../apps/web/src/app/login/login-form.tsx",import.meta.url),"utf8"),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(source,{exports,require:(id:string)=>id==="next/navigation"?{useRouter:()=>({})}:id==="next-auth/react"?{}:require(id)});
  const html=renderToStaticMarkup(createElement(exports.LoginForm));
  expect(html).toContain('method="post"');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="submit"/);
});
