const { chromium, devices } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = 'http://localhost:3339';
const out = path.join(__dirname, 'results');
const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json'), 'utf8'));
const phase = process.argv[2] || 'before';
const routeRoot = path.resolve(__dirname, '../../apps/web/src/app');
function inventory(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? inventory(path.join(dir, entry.name)) : entry.name === 'page.tsx'
      ? ['/' + path.relative(routeRoot, dir).split(path.sep).filter(part => !part.startsWith('(')).join('/')] : []);
}
fs.writeFileSync(path.join(out, 'route-inventory.json'), JSON.stringify(inventory(routeRoot), null, 2));
const company = fixture.companies[0];
const role = process.env.PERF_ROLE || 'office';
const workflows = role === 'tech' ? [
  ['Technician work', '/app/tech/work', 'h1,h2'],
  ['Technician report', `/app/tech/reports/${company.inspectionId}/${company.taskId}`, 'h2']
] : [
  ['Home', '/app/admin/dashboard', 'h1'],
  ['Inspections', '/app/admin/inspections', 'h1'],
  ['Clients', '/app/admin/clients', 'h1'],
  ['Inspection', `/app/admin/inspections/${company.inspectionId}`, 'h2'],
  ['Scheduler', `/app/admin/scheduler?date=${fixture.day}`, 'h1'],
  ['Billing', '/app/admin/billing', 'h1'],
  ['Settings', '/app/admin/settings', 'h1']
];
async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const profile of ['desktop', 'slow-phone']) {
      // Exclude service-worker caches so cold/warm HTTP-cache runs are comparable.
      const context = await browser.newContext({ serviceWorkers: 'block', ...(profile === 'desktop' ? { viewport: { width: 1440, height: 900 } } : { ...devices['iPhone 13'] }) });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await page.goto(base + '/login');
      await page.getByLabel(/work email/i).fill(role === 'tech' ? company.techEmail : company.officeEmail);
      await page.getByLabel(/password/i).fill('Password123!');
      await Promise.all([page.waitForURL(/\/app(?:\/|$)/), page.getByRole('button', { name: /sign in/i }).click()]);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      if (profile === 'slow-phone') {
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      await page.addInitScript(() => {
        window.__lcp = 0;
        new PerformanceObserver(list => { for (const item of list.getEntries()) window.__lcp = item.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      for (const [name, route, selector] of workflows.filter(([name]) => !process.env.WORKFLOW_FILTER || name === process.env.WORKFLOW_FILTER)) {
        for (const visit of ['first', 'repeat']) {
          if (visit === 'first') await cdp.send('Network.clearBrowserCache');
          const start = performance.now();
          try {
            const response = await page.goto(base + route, { waitUntil: 'load', timeout: 90000 });
            await page.locator(selector).filter({ visible: true }).first().waitFor({ state: 'visible' });
            const usableMs = Math.round(performance.now() - start);
            let inspectionInteractiveMs;
            if (process.env.PERF_INTERACTIVE && name === 'Inspection') {
              await page.getByRole('tab', {name:'Documents',exact:true}).click();
              await page.locator('input#attachment').waitFor({state:'attached'});
              inspectionInteractiveMs = Math.round(performance.now() - start);
            }
            await page.waitForTimeout(200);
            const timing = await page.evaluate(() => {
              const nav = performance.getEntriesByType('navigation')[0];
              return { ttfbMs: Math.round(nav.responseStart), htmlBytes: nav.encodedBodySize, lcpMs: Math.round(window.__lcp), overflow: document.documentElement.scrollWidth > innerWidth + 1,
                resources: performance.getEntriesByType('resource').map(item => ({ path: new URL(item.name).pathname, ms: Math.round(item.duration), bytes: item.transferSize })).sort((a,b) => b.ms-a.ms).slice(0,20) };
            });
            results.push({ name, route, profile, visit, usableMs, inspectionInteractiveMs, status: response.status(), ...timing });
          } catch (error) { results.push({ name, route, profile, visit, error: error.message }); }
          console.log(JSON.stringify(results.at(-1)));
          fs.writeFileSync(path.join(out, `${phase}.json`), JSON.stringify(results, null, 2));
        }
      }
      if (role === 'office') {
      await page.goto(base + '/app/admin/clients', { waitUntil: 'load' });
      const input = page.getByPlaceholder('Search customer name, contact, billing email, or phone');
      await input.click();
      const searchStart = performance.now();
      await input.fill('Subscriber Customer 0299');
      await page.getByText('Subscriber Customer 0299', { exact: true }).first().waitFor();
      results.push({ name: 'Customer search (beyond first page)', profile, usableMs: Math.round(performance.now() - searchStart) });
      console.log(JSON.stringify(results.at(-1)));
      fs.writeFileSync(path.join(out, `${phase}.json`), JSON.stringify(results, null, 2));
      await page.goto(base + `/app/admin/scheduler?date=${fixture.day}`, { waitUntil: 'load' });
      const next = new Date(`${fixture.day}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
      const nextDay = next.toISOString().slice(0,10);
      const changeStart = performance.now();
      await page.getByRole('button', { name: 'Next period', exact: true }).click();
      await page.getByText(new RegExp(`^${nextDay} .+ visits$`)).waitFor();
      results.push({ name: 'Scheduler next day', profile, usableMs: Math.round(performance.now() - changeStart) });
      console.log(JSON.stringify(results.at(-1)));
      fs.writeFileSync(path.join(out, `${phase}.json`), JSON.stringify(results, null, 2));
      }
      await context.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
