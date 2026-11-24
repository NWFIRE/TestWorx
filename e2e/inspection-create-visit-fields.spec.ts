import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const source = readFileSync("apps/web/src/app/app/admin/inspection-scheduler-form.tsx", "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf("{isCreateWorkflow ? (\n        <>\n          <input type=\"hidden\" name=\"inspectionMonth\"");
const end = source.indexOf('<div className="min-w-0 space-y-4 rounded-[1.25rem]', start);
const statusStart = source.indexOf('{!isCreateWorkflow ? <div className="min-w-0">');
const statusEnd = source.indexOf('</div> : null}', statusStart) + '</div> : null}'.length;

for (const creating of [true, false]) {
  test(`visit fields are ${creating ? "hidden for creation" : "available for editing"}`, async ({ page }) => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const result = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      const isCreateWorkflow = ${creating};
      const inspectionMonth = "2026-11", scheduledStart = "2026-11-01T09:00", scheduledEnd = "", status = "to_be_completed";
      const statusOptions = [status];
      const line = {schedulingStatus: "scheduled_now"};
      const serviceSchedulingOptions = ["due_now", "scheduled_now", "scheduled_future", "not_scheduled", "completed", "deferred"];
      const formatInspectionTaskSchedulingStatusLabel = value => value;
      const formatInspectionStatusLabel = value => value;
      function PickerField({icon,...props}) {return <input {...props} />;}
      createRoot(document.getElementById("app")).render(<form>${source.slice(start, end)}${source.slice(statusStart, statusEnd)}</form>);
    ` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic" });
    await page.setContent('<div id="app"></div>');
    await page.addScriptTag({ content: result.outputFiles[0]!.text });
    await expect(page.locator('[name="inspectionMonth"]')).toHaveCount(1);
    if (creating) {
      for (const label of ["Visit month", "Dispatch anchor", "Visit end", "Visit status", "Scheduling status"]) {
        await expect(page.getByText(label, {exact:true})).toHaveCount(0);
      }
      expect(await page.locator("form").evaluate(form => Object.fromEntries(new FormData(form as HTMLFormElement))))
        .toEqual({inspectionMonth:"2026-11",scheduledStart:"2026-11-01T09:00",scheduledEnd:"",status:"to_be_completed"});
    } else {
      await expect(page.getByLabel("Visit month")).toBeVisible();
      await expect(page.getByLabel("Dispatch anchor")).toBeVisible();
      await expect(page.getByLabel("Visit status")).toBeVisible();
      await expect(page.getByText("Scheduling status", {exact:true})).toBeVisible();
    }
  });
}
