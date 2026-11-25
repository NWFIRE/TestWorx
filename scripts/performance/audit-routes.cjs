const { chromium } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const database = 'postgresql://perf@127.0.0.1:55439/tradeworx_perf';
const db = new PrismaClient({ datasources: { db: { url: database } } });
const out = path.join(__dirname, 'results');
const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json'), 'utf8'));
const inventory = JSON.parse(fs.readFileSync(path.join(out, 'route-inventory.json'), 'utf8'));
const phase = process.argv[2] || 'before';
const detailsPath = path.join(out, 'detail-fixture.json');
const details = fs.existsSync(detailsPath) ? JSON.parse(fs.readFileSync(detailsPath, 'utf8')) : null;
async function main() {
  const browser = await chromium.launch();
  const results = [];
  try {
    const tenantId = fixture.companies[0].tenantId;
    const report = await db.inspectionReport.findFirst({ where: { tenantId, status: 'finalized', id: { not: { startsWith: 'perf-' } } } });
    const quote = await db.quote.findFirst({ where: { tenantId } });
    const manual = await db.manual.findFirst({ where: { tenantId } });
    const provider = await db.contractProviderAccount.findFirst({ where: { organizationId: tenantId } });
    const intake = await db.customerIntakeRequest.findFirst({ where: { organizationId: tenantId } });
    const document = await db.inspectionDocument.findFirst({ where: { tenantId } });
    const detailInspection = details && await db.inspection.findUnique({where:{id:details.inspectionId}});
    const customer = await db.user.findFirst({ where: { tenantId, role: 'customer_user', ...(detailInspection ? {customerCompanyId:detailInspection.customerCompanyId} : {}) } });
    const customerInspection = customer && await db.inspection.findFirst({ where: { tenantId, customerCompanyId: customer.customerCompanyId } });
    const customerReport = customerInspection && await db.inspectionReport.findFirst({ where: { tenantId, inspectionId: customerInspection.id, status: 'finalized' } });
    for (const [role, email] of [['public', null], ['office', fixture.companies[0].officeEmail], ['tech', fixture.companies[0].techEmail], ['customer', customer?.email], ['platform', 'platform@nwfiredemo.com']]) {
      const mobile = process.env.PERF_PROFILE === 'slow-phone';
      const context = await browser.newContext({ viewport: mobile ? {width:390,height:844} : { width: 1440, height: 900 }, serviceWorkers: 'block' });
      const page = await context.newPage();
      if (email) {
        await page.goto('http://localhost:3339/login');
        await page.getByLabel(/work email/i).fill(email);
        await page.getByLabel(/password/i).fill('Password123!');
        await Promise.all([page.waitForURL(/\/app(?:\/|$)/), page.getByRole('button', { name: /sign in/i }).click()]);
      }
      if (mobile) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline:false, latency:150, downloadThroughput:200000, uploadThroughput:93750 });
        await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
      }
      const routes = inventory.filter(route => role === 'public' ? !route.startsWith('/app') : role === 'office' ? route.startsWith('/app/admin') || ['/app', '/app/profile', '/app/deficiencies'].includes(route) : role === 'tech' ? route.startsWith('/app/tech') || route.startsWith('/app/manuals') : role === 'customer' ? route.startsWith('/app/customer') : route === '/app/platform');
      for (const route of routes) {
        const ids = { inspectionId: role === 'customer' ? details?.inspectionId ?? customerInspection?.id : route.includes('/archive/') || route.includes('/billing/') ? details?.inspectionId ?? report?.inspectionId : fixture.companies[0].inspectionId,
          taskId: fixture.companies[0].taskId, customerId: fixture.companies[0].customerId, reportId: customerReport?.id,
          manualId: manual?.id, quoteId: quote?.id, providerId: provider?.id, intakeId: intake?.id, documentId: document?.id };
        if (details) Object.assign(ids, { reportId: details.reportId, quoteId: details.quoteId, providerId: details.providerId, intakeId: details.intakeId, documentId: details.documentId, token: route.startsWith('/quote/') ? details.quoteToken : details.intakeToken });
        let missing = false;
        const url = route.replace(/\[([^\]]+)\]/g, (_, key) => { if (!ids[key]) missing = true; return ids[key] || 'missing'; });
        if (missing) { results.push({ role, route, skipped: 'No matching seeded record/token; not a successful route verification.' }); continue; }
        const errors = [];
        const onError = error => errors.push(error.message);
        page.on('pageerror', onError);
        const start = performance.now();
        try {
          const response = await page.goto('http://localhost:3339' + url, { waitUntil: 'load', timeout: 90000 });
          await page.waitForTimeout(300);
          results.push({ role, route, url, finalUrl: page.url(), elapsedMs: Math.round(performance.now() - start), status: response.status(), heading: await page.locator('h1,h2').first().textContent().catch(() => ''), errors,
            overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) });
        } catch (error) { results.push({ role, route, error: error.message }); }
        page.off('pageerror', onError);
        fs.writeFileSync(path.join(out, `${phase}-routes.json`), JSON.stringify(results, null, 2));
        console.log(JSON.stringify(results.at(-1)));
      }
      await context.close();
    }
    const failures = results.filter(row => row.error || row.skipped || row.status >= 400 || row.errors?.length || row.overflow || row.heading === '404');
    console.log(JSON.stringify({routes:results.length, failures:failures.map(row=>row.route)}));
    if (failures.length) process.exitCode = 1;
  } finally { await browser.close(); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
