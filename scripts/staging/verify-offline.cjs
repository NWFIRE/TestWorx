const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = 'http://localhost:3340';
const [a, b] = require('./results/fixtures.json').companies;
async function signIn(page, email) {
  await page.goto(base + '/login');
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/password/i).fill('Password123!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/app(?:\/|$)/);
  await expect(page.getByText('Preparing your workspace...')).toHaveCount(0);
}
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const result = {};
  try {
    await signIn(page, a.techEmail);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const marker = 'PRIVATE_COMPANY_A_OFFLINE_MARKER';
    await page.evaluate(async marker => {
      const cache = await caches.open('tradeworx-pwa-v2:app-shell');
      await cache.put('/app/tech/work', new Response(`<html><body>${marker}</body></html>`, { headers: { 'content-type': 'text/html' } }));
    }, marker);
    expect(await page.evaluate(async () => (await caches.match('/app/tech/work')).text())).toContain(marker);
    const csrf = await (await context.request.get(base + '/api/auth/csrf')).json();
    await context.request.post(base + '/api/auth/signout', { form: { csrfToken: csrf.csrfToken, callbackUrl: base + '/login' } });
    await signIn(page, b.techEmail);
    await expect.poll(() => page.evaluate(async marker => {
      const response = await caches.match('/app/tech/work');
      return response ? (await response.text()).includes(marker) : false;
    }, marker)).toBe(false);
    result.previousCompanyCacheCleared = true;
    await page.goto(base + '/app/tech/inspections');
    await page.reload();
    await expect.poll(() => page.evaluate(async () => !!await caches.match('/app/tech/inspections'))).toBe(true);
    const before = await page.locator('body').innerText();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('body')).not.toContainText(marker);
    await expect(page.getByRole('heading', { name: /inspections/i }).first()).toBeVisible();
    result.ownCompanyAvailableOffline = true;
    result.serviceWorkerControlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    result.offlineNavigationContainsNoPriorCompany = !(await page.locator('body').innerText()).includes(marker);
    result.onlinePageHadContent = before.length > 100;
    await context.setOffline(false);
    await page.reload();
    result.reconnectLoads = true;
    await page.screenshot({ path: path.join(__dirname, 'results/offline-company-switch.png'), fullPage: true });
    result.passed = true;
  } catch (error) { result.passed = false; result.error = error.message; process.exitCode = 1; }
  finally {
    fs.writeFileSync(path.join(__dirname, 'results/offline.json'), JSON.stringify(result, null, 2));
    console.log(result);
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
