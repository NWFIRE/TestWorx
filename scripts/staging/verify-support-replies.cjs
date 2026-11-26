const { chromium, expect } = require('@playwright/test');
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs'), path = require('node:path');
const base = 'http://localhost:3340';
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://perf@127.0.0.1:55439/tradeworx_subscriber' } } });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];
  let activePage=page, activeTicketId;
  try {
    const user = await db.user.findFirstOrThrow({ where: { name: 'Staging Owner', email: { startsWith: 'owner-', endsWith: '@example.test' } }, orderBy: { createdAt: 'desc' } });
    const ticket = await db.supportTicket.findFirstOrThrow({ where: { requesterId: user.id }, orderBy: { createdAt: 'desc' } });
    await page.goto(base + '/login');
    await page.getByLabel(/work email/i).fill(user.email);
    await page.getByLabel(/password/i).fill('StagingPassword123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/app/);
    await page.goto(base + '/app/help/' + ticket.id);
    for (let i = 0; i < 3; i++) {
      const body = `Staging reply ${Date.now()}-${i}`;
      await page.getByLabel('Message', { exact: true }).fill(body);
      await page.getByRole('button', { name: 'Send reply', exact: true }).click();
      await expect(page.getByText(body, { exact: true })).toBeVisible({ timeout: 15000 });
      expect(await db.supportMessage.count({ where: { ticketId: ticket.id, body } })).toBe(1);
      results.push({ reply: i + 1, visibleWithoutReload: true, savedOnce: true });
    }
    const a = require('./results/fixtures.json').companies[0];
    const technicianTicket = await db.supportTicket.findFirstOrThrow({ where: { requesterId: a.techId, title: 'Staging report delivery problem' }, orderBy: { createdAt: 'desc' } });
    await db.supportTicket.update({ where: { id: technicianTicket.id }, data: { status: 'resolved' } });
    const tech = await browser.newPage();
    activePage=tech;activeTicketId=technicianTicket.id;
    await tech.goto(base + '/login');
    await tech.getByLabel(/work email/i).fill(a.techEmail);
    await tech.getByLabel(/password/i).fill('Password123!');
    await tech.getByRole('button', { name: /sign in/i }).click();
    await tech.waitForURL(/\/app/);
    await tech.goto(base + '/app/help/' + technicianTicket.id);
    await tech.getByRole('button', { name: 'Reopen request', exact: true }).click();
    await expect(tech.getByRole('button', { name: 'Reopen request', exact: true })).toHaveCount(0, { timeout: 15000 });
    results.push({ technicianReopenVisibleWithoutReload: true });
  } catch (error) { results.push({ passed: false, error: error.message, url: activePage.url(), body: await activePage.locator('body').innerText(), ticket:activeTicketId?await db.supportTicket.findUnique({where:{id:activeTicketId},select:{status:true}}):null }); process.exitCode = 1; }
  finally { fs.writeFileSync(path.join(__dirname, 'results/support-replies.json'), JSON.stringify(results, null, 2)); console.log(results); await browser.close(); await db.$disconnect(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
