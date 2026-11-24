import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("optional inspection appointment is accessible, required only when enabled, and retained across resizing", async ({page}) => {
  const result = await build({stdin: {loader:"tsx", resolveDir:process.cwd(), contents:`
    import React, {useState} from "react";
    import {createRoot} from "react-dom/client";
    import {ScheduleInspectionFields} from "./apps/web/src/app/app/admin/schedule-inspection-fields";
    function App(){const [enabled,toggle]=useState(false); const [dateTime,change]=useState("");
      return <form><ScheduleInspectionFields enabled={enabled} dateTime={dateTime} onToggle={toggle} onChange={change} description="Optional appointment" /></form>;}
    createRoot(document.getElementById("app")).render(<App />);
  `}, bundle:true, write:false, platform:"browser",format:"iife",jsx:"automatic"});
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({content:result.outputFiles[0]!.text});
  await expect(page.getByLabel("Inspection date and time")).toHaveCount(0);
  await page.getByRole("checkbox", {name:"Schedule Inspection"}).check();
  expect(await page.locator("form").evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(false);
  await page.getByLabel("Inspection date and time").fill("2026-12-15T10:30");
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByLabel("Inspection date and time")).toHaveValue("2026-12-15T10:30");
  expect(await page.locator("form").evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(true);
  expect(await page.locator("form").evaluate(form => Object.fromEntries(new FormData(form as HTMLFormElement))))
    .toEqual({scheduleInspection:"on",inspectionAppointment:"2026-12-15T10:30"});
  await page.getByRole("checkbox", {name:"Schedule Inspection"}).uncheck();
  await expect(page.getByLabel("Inspection date and time")).toHaveCount(0);
  expect(await page.locator("form").evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(true);
  expect(await page.locator("form").evaluate(form => Object.fromEntries(new FormData(form as HTMLFormElement)))).toEqual({});
});
