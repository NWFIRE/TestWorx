const { chromium, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const companies = require('./results/fixtures.json').companies;
const base = 'http://localhost:3340';
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://perf@127.0.0.1:55439/tradeworx_subscriber' } } });
const results = [];
const cleanup = [];
async function populateQueues(company) {
  const tenantId = company.tenantId;
  const owner = await db.user.findUniqueOrThrow({ where: { email: company.officeEmail } });
  const customer = await db.customerCompany.create({ data: { tenantId, name: 'Staging Attention Customer', paymentTermsCode: 'due_on_receipt' } });
  cleanup.push(async () => {
    const jobs = await db.inspection.findMany({ where: { customerCompanyId: customer.id }, select: { id: true } });
    const ids = jobs.map(job => job.id);
    await db.fieldServiceRequest.deleteMany({ where: { customerCompanyId: customer.id } });
    await db.inspectionAmendment.deleteMany({ where: { inspectionId: { in: ids } } });
    await db.deficiency.deleteMany({ where: { inspectionId: { in: ids } } });
    await db.inspectionBillingSummary.deleteMany({ where: { customerCompanyId: customer.id } });
    await db.inspectionReport.deleteMany({ where: { inspectionId: { in: ids } } });
    await db.inspectionTask.deleteMany({ where: { inspectionId: { in: ids } } });
    await db.inspection.deleteMany({ where: { id: { in: ids } } });
    await db.site.deleteMany({ where: { customerCompanyId: customer.id } });
    await db.customerCompany.delete({ where: { id: customer.id } });
  });
  const site = await db.site.create({ data: { tenantId, customerCompanyId: customer.id, name: 'Attention Test Site', addressLine1: '1 Test St', city: 'Enid', state: 'OK', postalCode: '73701' } });
  const makeJob = async status => db.inspection.create({ data: { tenantId, customerCompanyId: customer.id, siteId: site.id, createdByUserId: owner.id, scheduledStart: new Date('2026-11-25T15:00:00Z'), status, claimable: status === 'to_be_completed', tasks: { create: { tenantId, inspectionType: 'fire_extinguisher', status, sortOrder: 0 } } }, include: { tasks: true } });
  const original = await makeJob('completed');
  const upcoming = await makeJob('to_be_completed');
  const report = await db.inspectionReport.create({ data: { tenantId, inspectionId: original.id, inspectionTaskId: original.tasks[0].id, status: 'finalized', finalizedAt: new Date(), contentJson: {} } });
  await db.inspectionBillingSummary.create({ data: { tenantId, inspectionId: original.id, customerCompanyId: customer.id, siteId: site.id, status: 'draft', items: [] } });
  await db.inspectionAmendment.create({ data: { tenantId, inspectionId: original.id, replacementInspectionId: upcoming.id, createdByUserId: owner.id, reason: 'Temporary staging attention verification', previousSnapshot: {}, replacementSnapshot: {} } });
  await db.fieldServiceRequest.create({ data: { tenantId, requestedByUserId: company.techId, customerCompanyId: customer.id, siteId: site.id, requestType: 'service_ticket', title: 'Staging attention request', description: 'Temporary request for queue reconciliation.', status: 'pending' } });
  await db.deficiency.create({ data: { tenantId, siteId: site.id, inspectionId: original.id, inspectionReportId: report.id, reportType: 'fire_extinguisher', section: 'inventory', sourceRowKey: 'attention-test', title: 'Staging high priority finding', description: 'Temporary test finding.', severity: 'high', status: 'open' } });
}
(async () => {
  const browser = await chromium.launch();
  try {
    for (const company of companies) {
      await populateQueues(company);
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(base + '/login');
      await page.getByLabel(/work email/i).fill(company.officeEmail);
      await page.getByLabel(/password/i).fill('Password123!');
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL(/\/app/);
      const snapshot = () => db.inspection.findMany({ where: { tenantId: company.tenantId }, select: { id: true, status: true, updatedAt: true }, orderBy: { id: 'asc' } });
      const before = await snapshot();
      await page.goto(base + '/app/admin/dashboard');
      const panel = page.locator('[data-home-panel="attention"]');
      await expect(panel).toBeVisible();
      const links = await panel.locator('a').evaluateAll(elements => elements.map(el => ({ href: el.getAttribute('href'), text: el.innerText })).filter(el => /\d+\s*$/.test(el.text)));
      expect(links, 'All seeded attention categories must be exercised').toHaveLength(6);
      for (const link of links) {
        const count = Number(link.text.match(/(\d+)\s*$/)[1]);
        const locator = page.locator('[data-home-panel="attention"] a').filter({ hasText: link.text.trim().split('\n')[0] }).first();
        await locator.focus();
        await page.keyboard.press('Enter');
        await page.waitForURL(url => url.pathname + url.search === link.href);
        const expression = link.href.includes('/inspections?') ? /(\d+) inspections? found across/
          : link.href.includes('/billing?') ? /(\d+) summar(?:y|ies)/
          : link.href.includes('/service-requests?') ? /Pending office review: (\d+) requests/
          : /(\d+) records?/;
        const checkCount = async () => {
          await expect.poll(async () => expression.test(await page.locator('body').innerText()), { timeout: 20000 }).toBe(true);
          const text = await page.locator('body').innerText();
          const match = text.match(expression);
          expect(match, `Missing queue total for ${link.text}`).not.toBeNull();
          expect(Number(match[1]), link.text).toBe(count);
        };
        await checkCount();
        await page.reload();
        await checkCount();
        await page.goBack();
        await expect(page).toHaveURL(/\/app\/admin\/dashboard$/);
        results.push({ company: company.name, row: link.text.trim(), count, keyboard: true, refresh: true, back: true, passed: true });
      }
      expect(await snapshot()).toEqual(before);
      results.push({ company: company.name, readOnly: true, rowsChecked: links.length, passed: true });
      await context.close();
    }
  } catch (error) { results.push({ passed: false, error: error.message }); process.exitCode = 1; }
  finally {
    for (const remove of cleanup.reverse()) await remove();
    fs.writeFileSync(path.join(__dirname, 'results/attention.json'), JSON.stringify(results, null, 2));
    console.log(results);
    await browser.close(); await db.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
