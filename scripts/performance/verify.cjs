const { chromium, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const base = 'http://localhost:3339';
const out = path.join(__dirname, 'results');
const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json'), 'utf8'));
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://perf@127.0.0.1:55439/tradeworx_perf' } } });
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
async function login(browser, email, mobile = false) {
  const context = await browser.newContext({ serviceWorkers: 'block', ...(process.env.PERF_IDENTITY ? {extraHTTPHeaders:{'Accept-Encoding':'identity'}} : {}), viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(base + '/login');
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/password/i).fill('Password123!');
  await Promise.all([page.waitForURL(/\/app(?:\/|$)/), page.getByRole('button', { name: /sign in/i }).click()]);
  return { context, page };
}
async function main() {
  const browser = await chromium.launch(process.env.PERF_BROWSER ? {channel:process.env.PERF_BROWSER} : {});
  const a = fixture.companies[0], b = fixture.companies[1];
  try {
    const office = await login(browser, a.officeEmail);
    const page = office.page;
    await check('Visit review and upcoming month pagination retain full totals and reach distinct records', async () => {
      await page.goto(base + '/app/admin/amendments');
      const firstReview = await page.getByRole('link',{name:'Review inspection',exact:true}).first().getAttribute('href');
      await expect(page.getByRole('link',{name:'Review inspection',exact:true})).toHaveCount(25);
      await page.getByRole('navigation',{name:'Visit review pages'}).getByRole('link',{name:'Next page'}).click();
      await expect(page.getByText(/Page 2 of/)).toBeVisible();
      expect((await page.getByRole('link',{name:'Review inspection',exact:true}).first().getAttribute('href')).split('?')[0]).not.toBe(firstReview.split('?')[0]);
      await page.reload(); await expect(page.getByText(/Page 2 of/)).toBeVisible();
      await page.goto(base + '/app/admin/upcoming-inspections');
      const month = page.locator('[id^="planning-month-"]').filter({has:page.getByRole('link',{name:'Next page',exact:true})}).first();
      const id = await month.getAttribute('id');
      const key = id.replace('planning-month-', '');
      if (!await month.locator('details').evaluate(element=>element.open)) await month.locator('summary').click();
      const total = await month.getByText(/inspections? scheduled,/).innerText();
      const firstJob = await month.getByRole('link',{name:'Open inspection',exact:true}).first().getAttribute('href');
      await expect(month.getByRole('link',{name:'Open inspection',exact:true})).toHaveCount(25);
      await month.getByRole('link',{name:'Next page',exact:true}).click();
      await expect(page).toHaveURL(new RegExp(`pageMonth=${key}&page=2`));
      const nextMonth = page.locator(`#${id}`);
      await expect(nextMonth.getByText(/Page 2 of/)).toBeVisible();
      expect(await nextMonth.getByText(/inspections? scheduled,/).innerText()).toBe(total);
      const nextJob = await nextMonth.getByRole('link',{name:'Open inspection',exact:true}).first().getAttribute('href');
      expect(nextJob.split('?')[0]).not.toBe(firstJob.split('?')[0]);
      expect(decodeURIComponent(nextJob)).toContain(`pageMonth=${key}&page=2`);
    });
    await check('Empty customer-search focus issues no directory request', async () => {
      await page.goto(base + '/app/admin/clients');
      const requests = [];
      const observe = request => { if (request.url().includes('/api/admin/clients/customers')) requests.push(request.url()); };
      page.on('request', observe);
      await page.getByPlaceholder('Search customer name, contact, billing email, or phone').click();
      await page.waitForTimeout(1500);
      page.off('request', observe);
      expect(requests).toEqual([]);
    });
    await check('Latest search wins even when the older server response arrives last', async () => {
      await page.route('**/api/admin/clients/customers?**', async route => {
        const response = await route.fetch();
        if (new URL(route.request().url()).searchParams.get('query') === 'Subscriber Customer 0298') await new Promise(resolve => setTimeout(resolve, 1500));
        await route.fulfill({ response }).catch(() => {});
      });
      const input = page.getByPlaceholder('Search customer name, contact, billing email, or phone');
      const oldRequest = page.waitForRequest(request => request.url().includes('0298'));
      await input.fill('Subscriber Customer 0298'); await oldRequest;
      await input.fill('Subscriber Customer 0299');
      await expect(page.getByText('Subscriber Customer 0299', { exact: true }).first()).toBeVisible();
      await page.waitForTimeout(1700);
      await expect(input).toHaveValue('Subscriber Customer 0299');
      await expect(page.getByText('Subscriber Customer 0298', { exact: true })).toHaveCount(0);
      await page.unroute('**/api/admin/clients/customers?**');
    });
    await check('Home attention count equals the full filtered inspection count, not just one page', async () => {
      await page.goto(base + '/app/admin/dashboard');
      const row = page.getByRole('link', { name: /Unassigned inspections/ });
      await expect(row).toBeVisible();
      const count = Number((await row.innerText()).match(/\d+/)[0]);
      await row.click();
      await expect(page.getByText(new RegExp(`^${count} inspections? found across`))).toBeVisible();
      await expect(page).toHaveURL(/attention=unassigned/);
      await page.reload();
      await expect(page.getByText(new RegExp(`^${count} inspections? found across`))).toBeVisible();
      await page.goBack();
      await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
    });
    await check('Inspection paging retains filters and reaches beyond the first fifty rows', async () => {
      await page.goto(base + '/app/admin/inspections');
      await page.getByRole('link', { name: 'Next page', exact: true }).click();
      await expect(page).toHaveURL(/page=2/);
      await expect(page.getByText(/Page 2 of/)).toBeVisible();
      const search = page.getByPlaceholder(/^Search report ID/);
      if (!(await search.isVisible())) await page.locator('summary').filter({ hasText: 'Inspection Filters' }).click();
      await page.getByPlaceholder(/^Search report ID/).fill('Subscriber Customer 0299');
      await page.waitForTimeout(1200);
      fs.writeFileSync(path.join(out,'inspection-search-debug.txt'),page.url()+'\n'+await page.locator('main').innerText());
      await expect(page.getByRole('link', { name: 'Subscriber Customer 0299', exact: true }).first()).toBeVisible();
      expect(new URL(page.url()).searchParams.get('page') ?? '1').toBe('1');
    });
    await check('Scheduler defers creation options until Add Job and retains its date behind the popup', async () => {
      const options = [];
      const observe = request => { if (request.url().includes('/inspections/create-options')) options.push(request.url()); };
      page.on('request', observe);
      await page.goto(base + `/app/admin/scheduler?date=${fixture.day}`);
      await page.waitForTimeout(500);
      expect(options).toEqual([]);
      await page.getByRole('button', { name: 'Add Job', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Create inspection', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create inspection', exact: true })).toBeVisible();
      expect(options).toHaveLength(1);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page.getByLabel('Schedule date')).toHaveValue(fixture.day);
      page.off('request', observe);
    });
    const other = await login(browser, b.officeEmail);
    await check('Company-scoped search, creation options, scheduler detail and direct inspection access', async () => {
      for (const [session, own, foreign] of [[office, a, b], [other, b, a]]) {
        const options = await (await session.context.request.get(base + '/api/admin/inspections/create-options')).json();
        expect(options.customers.some(row => row.id === own.customerId)).toBe(true);
        expect(options.customers.some(row => row.id === foreign.customerId)).toBe(false);
        const search = await (await session.context.request.get(base + '/api/admin/clients/customers?query=Subscriber%20Customer%200001')).json();
        expect(search.customers.some(row => row.id === own.customerId)).toBe(true);
        expect(search.customers.some(row => row.id === foreign.customerId)).toBe(false);
        const detail = await session.context.request.get(base + `/api/admin/scheduler?id=${foreign.inspectionId}`);
        expect(detail.ok()).toBe(false);
        await session.page.goto(base + `/app/admin/inspections/${foreign.inspectionId}`);
        await expect(session.page).not.toHaveURL(new RegExp(`${foreign.inspectionId}$`));
      }
    });
    const tech = await login(browser, a.techEmail, true);
    await check('Stored PDF download is company isolated and read-only', async () => {
      const before = await db.inspection.findUniqueOrThrow({where:{id:a.inspectionId}});
      const own = await office.context.request.get(base + '/api/inspection-documents/perf-route-document');
      expect(own.status()).toBe(200);
      expect(own.headers()['content-type']).toContain('application/pdf');
      expect((await own.body()).subarray(0,4).toString()).toBe('%PDF');
      const foreign = await other.context.request.get(base + '/api/inspection-documents/perf-route-document');
      expect([403,404]).toContain(foreign.status());
      expect((await db.inspection.findUniqueOrThrow({where:{id:a.inspectionId}})).status).toBe(before.status);
    });
    await check('Technician report viewing is read-only and billing options stay restricted', async () => {
      const before = await db.inspectionReport.findUniqueOrThrow({ where: { id: a.reportId } });
      const inspection = await db.inspection.findUniqueOrThrow({ where: { id: a.inspectionId } });
      await tech.page.goto(base + `/app/tech/reports/${a.inspectionId}/${a.taskId}`);
      await expect(tech.page.getByRole('heading', { name: 'Property 1', exact: true }).last()).toBeVisible();
      await tech.page.waitForTimeout(1500);
      const after = await db.inspectionReport.findUniqueOrThrow({ where: { id: a.reportId } });
      expect(after.status).toBe(before.status);
      expect(after.autosaveVersion).toBe(before.autosaveVersion);
      expect(after.contentJson).toEqual(before.contentJson);
      expect((await db.inspection.findUniqueOrThrow({ where: { id: a.inspectionId } })).status).toBe(inspection.status);
      expect((await tech.context.request.get(base + '/api/admin/inspections/create-options')).status()).toBe(403);
      fs.writeFileSync(path.join(out, 'tech-fields.json'), JSON.stringify(await tech.page.locator('input,textarea,select').evaluateAll(elements => elements.map(e => ({ tag: e.tagName, type: e.type, id: e.id, name: e.name, placeholder: e.placeholder, disabled: e.disabled, value: e.value }))), null, 2));
    });
    await check('Phone layouts remain within the viewport', async () => {
      for (const route of ['/app/tech/work', `/app/tech/reports/${a.inspectionId}/${a.taskId}`]) {
        await tech.page.goto(base + route); await tech.page.waitForTimeout(500);
        expect(await tech.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
      await tech.page.screenshot({ path: path.join(out, 'phone-report.png'), fullPage: true });
    });
    await check('PDF selection supports browse and drag/drop without submitting or changing status', async () => {
      const before = await db.inspection.findUniqueOrThrow({ where: { id: a.inspectionId } });
      await page.goto(base + `/app/admin/inspections/${a.inspectionId}`);
      await page.getByRole('tab', { name: 'Documents', exact: true }).click();
      const file = page.locator('input#attachment');
      if (!(await file.count())) throw new Error('Attachment panel not currently mounted; inspect its tab before testing.');
      await file.setInputFiles({ name: 'browse.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
      const drop = page.locator('button[aria-describedby="attachment-upload-help"]');
      await expect(drop).toContainText('browse.pdf');
      const dataTransfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(['%PDF-1.4\n%%EOF'], 'dropped.pdf', { type: 'application/pdf' })); return data; });
      await drop.dispatchEvent('drop', { dataTransfer });
      await expect(drop).toContainText('2 PDFs selected');
      expect((await db.inspection.findUniqueOrThrow({ where: { id: a.inspectionId } })).status).toBe(before.status);
    });
  } finally { await browser.close(); await db.$disconnect(); }
  if (results.some(result => !result.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
