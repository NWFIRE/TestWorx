const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');

async function main() {
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {ServiceDirections} from './apps/web/src/app/app/service-directions';
    export const render = props => renderToStaticMarkup(<ServiceDirections {...props}/>);
  `, loader: 'tsx', resolveDir: path.resolve(__dirname, '..') }, bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', alias: { '@testworx/lib/service-directions': path.resolve('packages/lib/src/service-directions.ts') } });
  const mod = { exports: {} }; new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(mod, mod.exports, require);
  const render = mod.exports.render;
  const site = { id: 'site', name: 'General / No Fixed Site', addressLine1: 'No fixed service address' };
  const customer = { serviceAddressLine1: '38558 S. County Road 270', serviceCity: 'Meno', serviceState: 'OK', servicePostalCode: '73760' };
  const html = render({ site, customer, editable: true });
  assert.match(html, /38558 S. County Road 270/); assert.match(html, /Get directions/);
  assert.doesNotMatch(html, /Location needed|Add location/);
  const specific = render({ site: { ...site, name: 'Other property', addressLine1: '4144 NW Expressway' }, customer });
  assert.match(specific, /4144 NW Expressway/); assert.doesNotMatch(specific, /38558/);
  const missing = render({ site, customer: {}, editable: true });
  assert.match(missing, /Location needed/); assert.match(missing, /Add location/); assert.doesNotMatch(missing, /Get directions/);
  const loading = render({ loading: true, editable: true });
  assert.match(loading, /Loading location/); assert.doesNotMatch(loading, /Location needed|Add location/);
  assert.doesNotThrow(() => render({}));
  console.log('PASS: initial server render resolves customer address without effects/save; site override, genuinely missing, and loading states are correct.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
