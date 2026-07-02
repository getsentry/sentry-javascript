import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mapDependenciesToDeployTarget } from '../../../src/vite/buildEnd/detectDeployTarget';
import {
  generateDynamicImportWrapper,
  generateTopLevelImportPrefix,
  injectServerInstrumentation,
  parseServerBuildExports,
  SENTRY_AUTO_INJECT_MARKER,
} from '../../../src/vite/buildEnd/injectServerInstrumentation';

describe('parseServerBuildExports', () => {
  it('parses a consolidated `export { ... }` block with aliases and default', () => {
    const code = 'const a=1;const b=2;export { a as entry, b as routes, a as default };';
    const { namedExports, hasDefaultExport } = parseServerBuildExports(code);
    expect(namedExports.sort()).toEqual(['entry', 'routes']);
    expect(hasDefaultExport).toBe(true);
  });

  it('parses individual `export const` / `export function` / `export class` declarations', () => {
    const code = [
      'export const basename = "/";',
      'export let future = {};',
      'export var ssr = true;',
      'export function getThing() {}',
      'export async function getAsyncThing() {}',
      'export class Thing {}',
    ].join('\n');
    const { namedExports, hasDefaultExport } = parseServerBuildExports(code);
    expect(namedExports.sort()).toEqual(['Thing', 'basename', 'future', 'getAsyncThing', 'getThing', 'ssr']);
    expect(hasDefaultExport).toBe(false);
  });

  it('detects `export default`', () => {
    const { hasDefaultExport } = parseServerBuildExports('export default function handler() {}');
    expect(hasDefaultExport).toBe(true);
  });

  it('parses a realistic React Router server build export shape', () => {
    const code = `
      import * as entryServer from './assets/entry.server-abc.js';
      export { default as assets } from './assets/manifest-xyz.js';
      export const assetsBuildDirectory = "build/client";
      export const basename = "/";
      export const future = {};
      export const ssr = true;
      export const isSpaMode = false;
      export const prerender = [];
      export const routeDiscovery = {};
      export const publicPath = "/";
      export const entry = { module: entryServer };
      export const routes = {};
    `;
    const { namedExports, hasDefaultExport } = parseServerBuildExports(code);
    expect(hasDefaultExport).toBe(false);
    expect(namedExports.sort()).toEqual(
      [
        'assets',
        'assetsBuildDirectory',
        'basename',
        'entry',
        'future',
        'isSpaMode',
        'prerender',
        'publicPath',
        'routeDiscovery',
        'routes',
        'ssr',
      ].sort(),
    );
  });

  it('returns no exports for code without exports', () => {
    expect(parseServerBuildExports('const x = 1;')).toEqual({ namedExports: [], hasDefaultExport: false });
  });
});

describe('generateTopLevelImportPrefix', () => {
  it('produces a marked top-level import', () => {
    const prefix = generateTopLevelImportPrefix('./instrument.server.mjs');
    expect(prefix).toContain(SENTRY_AUTO_INJECT_MARKER);
    expect(prefix).toContain('import "./instrument.server.mjs";');
  });
});

describe('generateDynamicImportWrapper', () => {
  const wrapper = generateDynamicImportWrapper({
    instrumentationImportPath: './instrument.server.mjs',
    originalImportPath: './index.sentry-original.mjs',
    namedExports: ['entry', 'routes', 'assets'],
    hasDefaultExport: false,
  });

  it('includes the idempotency guard against double init', () => {
    expect(wrapper).toContain('if (!__sentryReactRouter.getClient())');
    expect(wrapper).toContain('await import("./instrument.server.mjs")');
  });

  it('dynamically imports the original build after init', () => {
    const guardIndex = wrapper.indexOf('await import("./instrument.server.mjs")');
    const buildIndex = wrapper.indexOf('await import("./index.sentry-original.mjs")');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(guardIndex);
  });

  it('re-exports all named exports', () => {
    expect(wrapper).toContain('export const entry = __sentryServerBuild.entry;');
    expect(wrapper).toContain('export const routes = __sentryServerBuild.routes;');
    expect(wrapper).toContain('export const assets = __sentryServerBuild.assets;');
  });

  it('only re-exports default when present', () => {
    expect(wrapper).not.toContain('export default');
    const withDefault = generateDynamicImportWrapper({
      instrumentationImportPath: './instrument.server.mjs',
      originalImportPath: './index.sentry-original.mjs',
      namedExports: ['entry'],
      hasDefaultExport: true,
    });
    expect(withDefault).toContain('export default __sentryServerBuild.default;');
  });
});

describe('mapDependenciesToDeployTarget', () => {
  it.each([
    ['cloudflare', { '@cloudflare/vite-plugin': '1.0.0', '@react-router/node': '7.0.0' }],
    ['cloudflare', { wrangler: '3.0.0' }],
    ['vercel', { '@vercel/react-router': '1.0.0', '@react-router/node': '7.0.0' }],
    ['netlify', { '@netlify/vite-plugin-react-router': '1.0.0' }],
    ['node', { '@react-router/serve': '7.0.0' }],
    ['node', { '@react-router/node': '7.0.0' }],
    ['unknown', { react: '18.0.0' }],
  ] as const)('maps deps to "%s"', (expected, deps) => {
    expect(mapDependenciesToDeployTarget(deps)).toBe(expected);
  });

  it('prefers serverless/edge targets over the generic node target', () => {
    expect(mapDependenciesToDeployTarget({ '@react-router/node': '7.0.0', '@cloudflare/vite-plugin': '1.0.0' })).toBe(
      'cloudflare',
    );
  });
});

describe('injectServerInstrumentation (filesystem)', () => {
  let tmpRoot: string;
  let buildDirectory: string;
  let serverDir: string;

  const SERVER_BUILD = [
    'import * as route0 from "./assets/home.js";',
    'export const entry = { module: route0 };',
    'export const routes = {};',
    'export const ssr = true;',
  ].join('\n');

  function setup({
    ssr = true,
    withInstrumentFile = true,
  }: { ssr?: boolean; withInstrumentFile?: boolean } = {}): void {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-rr-'));
    buildDirectory = path.join(tmpRoot, 'build');
    serverDir = path.join(buildDirectory, 'server');
    fs.mkdirSync(serverDir, { recursive: true });
    if (ssr) {
      fs.writeFileSync(path.join(serverDir, 'index.js'), SERVER_BUILD);
    }
    // a node deploy target
    fs.writeFileSync(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({ dependencies: { '@react-router/serve': '7.0.0' } }),
    );
    if (withInstrumentFile) {
      fs.writeFileSync(path.join(tmpRoot, 'instrument.server.mjs'), 'import * as Sentry from "@sentry/react-router";');
    }
  }

  const baseOptions = {
    root: '',
    buildDirectory: '',
    serverBuildFile: 'index.js',
    ssr: true,
    hasServerBundles: false,
    serverInstrumentationFile: './instrument.server.mjs',
    debug: false,
  };

  function options(overrides: Partial<typeof baseOptions> = {}) {
    return { ...baseOptions, root: tmpRoot, buildDirectory, ...overrides };
  }

  afterEach(() => {
    if (tmpRoot) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('writes a dynamic-import wrapper, moves the original aside, and re-exports', async () => {
    setup();
    await injectServerInstrumentation(options());

    const wrapper = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf-8');
    expect(wrapper).toContain(SENTRY_AUTO_INJECT_MARKER);
    expect(wrapper).toContain('await import("./index.sentry-original.mjs")');
    expect(wrapper).toContain('export const entry = __sentryServerBuild.entry;');
    expect(wrapper).toContain('export const routes = __sentryServerBuild.routes;');

    const original = fs.readFileSync(path.join(serverDir, 'index.sentry-original.mjs'), 'utf-8');
    expect(original).toBe(SERVER_BUILD);
    expect(fs.existsSync(path.join(serverDir, 'instrument.server.mjs'))).toBe(true);
  });

  it('falls back to a top-level import when the server build has no detectable exports', async () => {
    setup();
    // overwrite the server build with content that has no exports
    fs.writeFileSync(path.join(serverDir, 'index.js'), 'console.log("no exports here");');
    await injectServerInstrumentation(options());

    const result = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf-8');
    expect(result.startsWith(SENTRY_AUTO_INJECT_MARKER)).toBe(true);
    expect(result).toContain('import "./instrument.server.mjs";');
    expect(result).toContain('console.log("no exports here");'); // original content preserved
    // no wrapper means no renamed original file
    expect(fs.existsSync(path.join(serverDir, 'index.sentry-original.mjs'))).toBe(false);
  });

  it('is idempotent: a second run does not double-inject', async () => {
    setup();
    await injectServerInstrumentation(options());
    const afterFirst = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf-8');
    await injectServerInstrumentation(options());
    const afterSecond = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf-8');
    expect(afterSecond).toBe(afterFirst);
    // marker appears exactly once
    expect(afterSecond.split(SENTRY_AUTO_INJECT_MARKER).length - 1).toBe(1);
  });

  it('no-ops for SPA mode (ssr: false)', async () => {
    setup({ ssr: false });
    await injectServerInstrumentation(options({ ssr: false }));
    expect(fs.existsSync(path.join(serverDir, 'index.js'))).toBe(false);
    expect(fs.existsSync(path.join(serverDir, 'instrument.server.mjs'))).toBe(false);
  });

  it('skips when serverBundles are used', async () => {
    setup();
    await injectServerInstrumentation(options({ hasServerBundles: true }));
    const result = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf-8');
    expect(result).toBe(SERVER_BUILD); // untouched
  });

  it('skips (with no injection) when the instrumentation file is missing', async () => {
    setup({ withInstrumentFile: false });
    await injectServerInstrumentation(options());
    const result = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf-8');
    expect(result).toBe(SERVER_BUILD); // untouched
    expect(fs.existsSync(path.join(serverDir, 'instrument.server.mjs'))).toBe(false);
  });

  it('skips for a cloudflare deploy target', async () => {
    setup();
    fs.writeFileSync(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({ dependencies: { '@cloudflare/vite-plugin': '1.0.0' } }),
    );
    await injectServerInstrumentation(options());
    const result = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf-8');
    expect(result).toBe(SERVER_BUILD); // untouched
  });
});
