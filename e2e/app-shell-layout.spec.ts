import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import path from 'node:path';

let script: string, css: string;
test.beforeAll(async()=>{
  css=(await postcss([tailwind({content:['apps/web/src/app/app/app-shell.tsx']})]).process('@tailwind base; @tailwind utilities;',{from:undefined})).css;
  const result=await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {AppShell} from './apps/web/src/app/app/app-shell';
    createRoot(document.getElementById('app')).render(<AppShell role={new URLSearchParams(location.search).get('role')||'office_admin'} user={{id:'office',name:'Office',email:'office@example.test'}} signOutAction={async()=>{}}><h1>Page content</h1><input aria-label="Draft" /></AppShell>);
  `},bundle:true,write:false,jsx:'automatic',platform:'browser',alias:{'@testworx/lib':path.resolve('packages/lib/src/permissions.ts')},define:{'process.env':'{"NODE_ENV":"production","NEXT_PUBLIC_SIMPLIFIED_WORKSPACE_NAV":"1"}'},plugins:[{name:'shell-boundaries',setup(plugin){
    plugin.onResolve({filter:/.*/},args=>{
      if(!args.importer.endsWith('app-shell.tsx')) return;
      if(args.path==='react'||args.path.startsWith('react/')||args.path==='./app-nav-config'||args.path==='./request-count-badge') return;
      return {path:args.path,namespace:'fixture'};
    });
    plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>{
      let contents='';
      if(args.path==='next/navigation') contents=`const router={prefetch(){},refresh(){},push(){}}; export const useRouter=()=>router; export const usePathname=()=>location.pathname;`;
      else if(args.path==='next/link') contents=`import React from 'react'; export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}`;
      else if(args.path==='next/image') contents=`import React from 'react'; export default function Image({priority,...props}){return <img {...props}/>}`;
      else if(args.path.includes('use-request-badge')) contents='export const useRequestBadge=()=>0;';
      else if(args.path.includes('use-smart-back')) contents='export const useSmartBack=()=>()=>{};';
      else if(args.path.includes('mobile-pull-to-refresh')) contents='export const MobilePullToRefresh=({children})=>children;';
      else if(args.path.includes('technician-notifications-client')) contents='export const TechnicianNotificationProvider=({children})=>children; export const TechnicianNotificationQueryBridge=()=>null;';
      else contents=['BrandLoader','NativeTechnicianRouteGuard','TechnicianSyncBootstrap','NativeTechnicianBridge','TechnicianNotificationProvider','TechnicianNotificationQueryBridge','TechnicianMobileHeader','TechnicianMobileTabBar'].map(name=>`export const ${name}=()=>null;`).join('\n');
      return {loader:'jsx',contents,resolveDir:process.cwd()};
    });
  }}]});
  script=result.outputFiles[0].text;
});

test('shared desktop bar is absent across roles and routed pages',async({page})=>{
  await page.route('https://shell.test/**',route=>route.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="app"></div><script>${script}</script>`}));
  await page.setViewportSize({width:1440,height:900});
  for(const [route,role] of [
    ['/app/admin/dashboard','office_admin'], ['/app/admin/inspections/visit-1','office_admin'],
    ['/app/admin/settings','tenant_admin'], ['/app/admin/profile','office_admin'],
    ['/app/customer','customer_user'], ['/app/platform','platform_admin'], ['/app/tech/work','technician']
  ]) {
    await page.goto(`https://shell.test${route}?role=${role}`);
    await expect(page.getByRole('heading',{name:'Page content'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Go back',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Refresh page',exact:true})).toHaveCount(0);
    await expect(page.getByText('office@example.test',{exact:true})).toHaveCount(0);
    await expect(page.locator('header:visible')).toHaveCount(0);
    expect((await page.getByRole('main').boundingBox())!.y).toBe(0);
  }
});

test('Scheduler has no surrounding navigation and uses the full viewport',async({page})=>{
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://shell.test/**',route=>route.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="app"></div><script>${script}</script>`}));
  for(const width of [1920,1440,800,390]) {
    await page.setViewportSize({width,height:900});
    await page.goto('https://shell.test/app/admin/scheduler');
    expect(errors).toEqual([]);
    await expect(page.getByRole('heading',{name:'Page content'})).toBeVisible();
    await expect(page.locator('aside')).toHaveCount(0);
    await expect(page.locator('header')).toHaveCount(0);
    const main=(await page.getByRole('main').boundingBox())!;
    expect(main.x).toBe(0); expect(main.width).toBe(width); expect(main.y).toBe(0);
    await page.getByLabel('Draft').fill('Keep my draft');
    await page.setViewportSize({width:width-10,height:720});
    await expect(page.getByLabel('Draft')).toHaveValue('Keep my draft');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:1440,height:900});
  await page.goto('https://shell.test/app/admin/inspections');
  await expect(page.getByRole('complementary',{name:'Primary navigation'})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(page.getByRole('dialog',{name:'Primary navigation'})).toBeVisible();
  await page.getByRole('button',{name:'Close navigation'}).click();
  await expect(page.getByRole('dialog',{name:'Primary navigation'})).toBeHidden();
});

test('inspection popup omits navigation only inside its marked frame',async({page})=>{
  await page.route('https://shell.test/**',route=>{
    if(new URL(route.request().url()).pathname==='/host') return route.fulfill({contentType:'text/html',body:'<iframe title="Inspection popup" data-inspection-popup="true" src="/app/admin/inspections/visit-1" style="width:100%;height:600px"></iframe>'});
    return route.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="app"></div><script>${script}</script>`});
  });
  await page.setViewportSize({width:1440,height:900});
  await page.goto('https://shell.test/host');
  const inspection=page.frameLocator('iframe');
  await expect(inspection.getByRole('heading',{name:'Page content'})).toBeVisible();
  await expect(inspection.locator('aside')).toHaveCount(0);
  await expect(inspection.getByRole('button',{name:'Open navigation'})).toHaveCount(0);
  await inspection.getByLabel('Draft').fill('Retained');
  await page.setViewportSize({width:390,height:844});
  await expect(inspection.getByLabel('Draft')).toHaveValue('Retained');
  await expect(inspection.getByRole('button',{name:'Open navigation'})).toHaveCount(0);
  await page.goto('https://shell.test/app/admin/inspections/visit-1');
  await expect(page.getByRole('button',{name:'Open navigation'})).toBeVisible();
});
