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
  await expect(page.getByLabel("Inspection date", {exact:true})).toHaveCount(0);
  await page.getByRole("checkbox", {name:"Schedule Inspection"}).check();
  expect(await page.locator("form").evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(false);
  await page.getByLabel("Inspection date", {exact:true}).fill("2026-12-15");
  await expect(page.locator('[name="inspectionAppointment"]')).toHaveValue("2026-12-15T09:00");
  await page.getByLabel("Inspection date", {exact:true}).fill("");
  await page.getByLabel("Inspection hour", {exact:true}).selectOption("10");
  await page.getByLabel("Inspection minute", {exact:true}).selectOption("30");
  await expect(page.getByLabel("Inspection minute", {exact:true}).locator("option")).toHaveText(["00", "15", "30", "45"]);
  await page.getByLabel("Inspection date", {exact:true}).fill("2026-12-15");
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('[name="inspectionAppointment"]')).toHaveValue("2026-12-15T10:30");
  expect(await page.locator("form").evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(true);
  expect(await page.locator("form").evaluate(form => Object.fromEntries(new FormData(form as HTMLFormElement))))
    .toEqual({scheduleInspection:"on",inspectionAppointment:"2026-12-15T10:30"});
  await page.getByLabel("Inspection hour", {exact:true}).selectOption("12");
  await expect(page.locator('[name="inspectionAppointment"]')).toHaveValue("2026-12-15T00:30");
  await page.getByLabel("Inspection AM or PM", {exact:true}).selectOption("PM");
  await expect(page.locator('[name="inspectionAppointment"]')).toHaveValue("2026-12-15T12:30");
  await page.getByRole("checkbox", {name:"Schedule Inspection"}).uncheck();
  await expect(page.getByLabel("Inspection date", {exact:true})).toHaveCount(0);
  expect(await page.locator("form").evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(true);
  expect(await page.locator("form").evaluate(form => Object.fromEntries(new FormData(form as HTMLFormElement)))).toEqual({});
});

test("rescheduling preserves existing off-quarter times until explicitly changed", async ({page}) => {
  const result = await build({stdin:{loader:"tsx", resolveDir:process.cwd(), contents:`
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {ScheduleDateTime} from "./apps/web/src/app/app/admin/schedule-date-time";
    createRoot(document.getElementById("app")).render(<form><ScheduleDateTime label="Start" name="start" defaultValue="2026-12-15T14:07" required /></form>);
  `},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic"});
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({content:result.outputFiles[0]!.text});
  await expect(page.locator('[name="start"]')).toHaveValue("2026-12-15T14:07");
  await expect(page.getByLabel("Start minute")).toHaveValue("07");
  await page.getByLabel("Start minute").selectOption("45");
  await expect(page.locator('[name="start"]')).toHaveValue("2026-12-15T14:45");
  await expect(page.getByLabel("Start minute").locator("option")).toHaveText(["00", "15", "30", "45"]);
  await page.getByLabel("Start date").fill("");
  await expect(page.locator('[name="start"]')).toHaveValue("");
  expect(await page.locator("form").evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(false);
});
