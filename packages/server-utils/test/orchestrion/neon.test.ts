import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { neonConfig } from '../../src/orchestrion/config/neon';
import { createLoadHookTransform } from '../../src/orchestrion/bundler/load-hook';

// `@neondatabase/serverless` ships two minified esbuild bundles (`index.js`, `index.mjs`) with
// mangled identifiers, so the selectors key on the property names and string literals that
// survive minification. These fixtures mirror that shape: pg's `Client` (the only class with
// `_pulseQueryQueue`), decoy `query` methods on the pool and protocol classes, the `neon()`
// factory with its nested HTTP executor, and the connection-string resolver.
const body = `
var Qx=class{query(e){this._send(e)}};
var Pn=class extends Ev{constructor(){super();this.connectionParameters={}}_pulseQueryQueue(){}query(e,t,n){return this._pulseQueryQueue(e,t,n)}};
var kn=class{_pulseQueue(){}query(e,t,n){return e}};
async function mi(r,e={}){let s=r,o=new URL(r);return{resolvedConnectionString:s,resolvedURL:o}}
function mr(r,e={}){function f(g,...w){return{m,g,w}}a(f,"templateFn");f.query=(g,w,S)=>({m,g,w,S});async function m(g,w,S){let{resolvedConnectionString:R,resolvedURL:$}=await mi(r,{}),ue={"Neon-Connection-String":R};return fetch($,{headers:ue})}return f}
`;
const cjsSource = `"use strict";${body}module.exports={neon:mr,Client:Pn,Pool:kn};`;
const esmSource = `${body}export{mr as neon,Pn as Client,kn as Pool};`;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-orchestrion-'));
const pkgDir = path.join(root, 'node_modules', '@neondatabase', 'serverless');
fs.mkdirSync(pkgDir, { recursive: true });
fs.writeFileSync(
  path.join(pkgDir, 'package.json'),
  JSON.stringify({ name: '@neondatabase/serverless', version: '1.2.0' }),
);
const cjsFile = path.join(pkgDir, 'index.js');
const esmFile = path.join(pkgDir, 'index.mjs');
fs.writeFileSync(cjsFile, cjsSource);
fs.writeFileSync(esmFile, esmSource);

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

// Every wrapper opens with a `hasSubscribers` guard on its channel, one per instrumented site.
function countWrappedSites(code: string, channelVariable: string): number {
  return code.split(`tr_ch_apm_hasSubscribers(${channelVariable})`).length - 1;
}

describe('neon orchestrion config', () => {
  const transform = createLoadHookTransform({ dcModule: 'diagnostics_channel', instrumentations: neonConfig });

  it.each([
    ['index.js', cjsFile, cjsSource],
    ['index.mjs', esmFile, esmSource],
  ])('instruments exactly one site per channel in %s', (_file, file, source) => {
    const code = transform(file, source);

    expect(code).toBeDefined();
    expect(code).toContain('orchestrion:@neondatabase/serverless:query');
    expect(code).toContain('orchestrion:@neondatabase/serverless:http-query');
    expect(code).toContain('orchestrion:@neondatabase/serverless:resolve-connection');

    // Only pg's `Client.prototype.query` gets the channel, not the pool or protocol `query`.
    expect(countWrappedSites(code!, 'tr_ch_apm$query')).toBe(1);
    expect(countWrappedSites(code!, 'tr_ch_apm$http_query')).toBe(1);
    expect(countWrappedSites(code!, 'tr_ch_apm$resolve_connection')).toBe(1);
  });

  it('keeps `self` on the websocket query channel context', () => {
    const code = transform(cjsFile, cjsSource)!;
    const site = code.indexOf('_pulseQueryQueue(e, t, n)');
    const ctx = code.lastIndexOf('__apm$ctx = {', site);

    expect(code.slice(ctx, site)).toContain('self: this');
  });
});
