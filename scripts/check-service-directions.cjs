const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('@playwright/test');
const postcss = require('postcss');
const tailwind = require('tailwindcss');

async function main() {
  const file = 'apps/web/src/app/app/service-directions.tsx';
  const css = await postcss([tailwind({ content: [file] })]).process('@tailwind base; @tailwind utilities;', { from: undefined });
  const bundle = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {ServiceDirections} from './${file}';
    window.openedJob=0; window.status='to_be_completed'; window.progress=0;
    const root=createRoot(document.getElementById('app'));
    window.mount=(site,editable=false)=>root.render(<article onClick={()=>window.openedJob++} onKeyDown={()=>window.openedJob++} style={{paddingTop:500}}>
      <h1>Customer / Site</h1><ServiceDirections key={JSON.stringify(site)+editable} site={site} editable={editable}/><div style={{height:1000}}/>
    </article>);
  `, loader: 'tsx', resolveDir: path.resolve(__dirname, '..') }, bundle: true, write: false, jsx: 'automatic', alias: { '@testworx/lib/service-directions': path.resolve('packages/lib/src/service-directions.ts') }, define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch();
  try {
    for (const platform of [{ ua: 'Windows', width: 1200 }, { ua: 'iPhone', width: 390 }, { ua: 'Android', width: 390 }, { ua: 'Macintosh', width: 768, touch: 5 }]) {
      const context = await browser.newContext({ userAgent: platform.ua, viewport: { width: platform.width, height: 844 } });
      const page = await context.newPage(); const errors = [], mutations = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(touch => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => touch }), platform.touch || 0);
      await context.route('**/*', route => {
        if (route.request().method() !== 'GET') { mutations.push(route.request().url()); return route.fulfill({ json: { site: { id: 'site', addressLine1: '20 Main', latitude: 36, longitude: -97 } } }); }
        return route.fulfill({ contentType: 'text/html', body: '<div id="app"></div>' });
      });
      await page.goto('http://localhost/inspection');
      await page.addStyleTag({ content: css.css }); await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const site = { id: 'site', addressLine1: '10 Main St', city: 'Enid', state: 'OK', postalCode: '73701' };
      await page.evaluate(site => window.mount(site), site);
      let link = page.getByRole('link', { name: 'Get directions' }); await link.waitFor();
      const apple = platform.ua === 'iPhone' || platform.touch;
      await page.waitForFunction(apple => document.querySelector('a').href.includes(apple ? 'maps.apple.com' : 'google.com'), apple);
      const url = new URL(await link.getAttribute('href'));
      assert.equal(url.searchParams.get(apple ? 'daddr' : 'destination'), '10 Main St, Enid, OK, 73701');
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.ok((await link.boundingBox()).height >= 44);
      await link.scrollIntoViewIfNeeded(); const scroll = await page.evaluate(() => window.scrollY);
      const popupPromise = page.waitForEvent('popup'); await link.click(); const popup = await popupPromise; await popup.close();
      assert.equal(await page.evaluate(() => window.scrollY), scroll);
      assert.deepEqual(await page.evaluate(() => [window.openedJob, window.status, window.progress]), [0, 'to_be_completed', 0]);
      assert.equal(mutations.length, 0);
      await page.evaluate(site => window.mount({ ...site, latitude: 36.4, longitude: -97.9 }), site);
      await page.waitForFunction(() => document.querySelector('a').href.includes('36.4'));
      assert.ok((await page.locator('article').innerText()).includes('10 Main St'));
      await page.evaluate(() => window.mount({ id: 'site' })); await page.getByText('Location needed').waitFor();
      assert.equal(await page.getByRole('link', { name: 'Get directions' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Add location' }).count(), 0);
      await page.evaluate(() => window.mount({ id: 'site' }, true)); await page.getByRole('button', { name: 'Add location' }).click();
      await page.getByLabel('Street address').fill('20 Main'); await page.getByLabel('Latitude (-90 to 90)').fill('36'); await page.getByLabel('Longitude (-180 to 180)').fill('-97');
      await page.getByRole('button', { name: 'Save location' }).click(); await page.getByRole('link', { name: 'Get directions' }).waitFor();
      assert.equal(mutations.length, 1); assert.equal(await page.evaluate(() => window.openedJob), 0);
      assert.deepEqual(errors, []); await context.close();
      console.log('PASS:', platform.ua, platform.width, 'address/pin/missing, tap target, isolated click, unchanged status/progress/scroll, office editor');
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
