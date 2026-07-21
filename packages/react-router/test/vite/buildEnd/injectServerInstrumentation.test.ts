import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isCloudflareTarget } from '../../../src/vite/buildEnd/detectDeployTarget';
import {
  generateTopLevelImportPrefix,
  injectServerInstrumentation,
  SENTRY_AUTO_INJECT_MARKER,
} from '../../../src/vite/buildEnd/injectServerInstrumentation';

describe('generateTopLevelImportPrefix', () => {
  it('produces a marked top-level import', () => {
    const prefix = generateTopLevelImportPrefix('./instrument.server.mjs');
    expect(prefix).toContain(SENTRY_AUTO_INJECT_MARKER);
    expect(prefix).toContain('import "./instrument.server.mjs";');
  });
});

describe('isCloudflareTarget', () => {
  it.each([
    [true, { '@cloudflare/vite-plugin': '1.0.0', '@react-router/node': '7.0.0' }],
    [true, { wrangler: '3.0.0' }],
    [true, { '@react-router/cloudflare': '7.0.0' }],
    [false, { '@react-router/serve': '7.0.0' }],
    [false, { '@react-router/node': '7.0.0' }],
    [false, { '@vercel/react-router': '1.0.0' }],
    [false, { react: '18.0.0' }],
  ] as const)('returns %s for the given deps', (expected, deps) => {
    expect(isCloudflareTarget(deps)).toBe(expected);
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
    withInstrumentFile = true,
    deps = { '@react-router/serve': '7.0.0' },
  }: { withInstrumentFile?: boolean; deps?: Record<string, string> } = {}): void {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-rr-'));
    buildDirectory = path.join(tmpRoot, 'build');
    serverDir = path.join(buildDirectory, 'server');
    fs.mkdirSync(serverDir, { recursive: true });
    fs.writeFileSync(path.join(serverDir, 'index.js'), SERVER_BUILD);
    fs.writeFileSync(path.join(tmpRoot, 'package.json'), JSON.stringify({ dependencies: deps }));
    if (withInstrumentFile) {
      fs.writeFileSync(path.join(tmpRoot, 'instrument.server.mjs'), 'import * as Sentry from "@sentry/react-router";');
    }
  }

  const baseOptions = {
    root: '',
    buildDirectory: '',
    serverBuildFile: 'index.js',
    serverModuleFormat: 'esm' as 'esm' | 'cjs',
    ssr: true,
    hasServerBundles: false,
    serverInstrumentationFile: './instrument.server.mjs',
    debug: false,
  };

  function options(overrides: Partial<typeof baseOptions> = {}): typeof baseOptions {
    return { ...baseOptions, root: tmpRoot, buildDirectory, ...overrides };
  }

  function readServerEntry(): string {
    return fs.readFileSync(path.join(serverDir, 'index.js'), 'utf-8');
  }

  afterEach(() => {
    if (tmpRoot) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('prepends a top-level import, copies the instrumentation file, and preserves the original body', async () => {
    setup();
    await injectServerInstrumentation(options());

    const entry = readServerEntry();
    expect(entry).toContain(SENTRY_AUTO_INJECT_MARKER);
    expect(entry).toContain('import "./instrument.server.mjs";');
    // original body is kept after the injected prefix
    expect(entry).toContain('export const entry = { module: route0 };');
    expect(entry.indexOf(SENTRY_AUTO_INJECT_MARKER)).toBeLessThan(entry.indexOf('export const entry'));
    // instrumentation file copied next to the server entry
    expect(fs.existsSync(path.join(serverDir, 'instrument.server.mjs'))).toBe(true);
  });

  it('is idempotent - a second run does not double-inject', async () => {
    setup();
    await injectServerInstrumentation(options());
    const first = readServerEntry();
    await injectServerInstrumentation(options());
    const second = readServerEntry();

    expect(second).toBe(first);
    expect(
      second.match(new RegExp(SENTRY_AUTO_INJECT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')),
    ).toHaveLength(1);
  });

  it('no-ops for SPA (ssr: false) builds', async () => {
    setup();
    await injectServerInstrumentation(options({ ssr: false }));
    expect(readServerEntry()).not.toContain(SENTRY_AUTO_INJECT_MARKER);
  });

  it('skips when serverBundles are in use', async () => {
    setup();
    await injectServerInstrumentation(options({ hasServerBundles: true }));
    expect(readServerEntry()).not.toContain(SENTRY_AUTO_INJECT_MARKER);
  });

  it('skips for CJS server builds (ESM import would crash a CJS bundle)', async () => {
    setup();
    await injectServerInstrumentation(options({ serverModuleFormat: 'cjs' }));
    expect(readServerEntry()).not.toContain(SENTRY_AUTO_INJECT_MARKER);
    // must not copy the instrumentation file either
    expect(fs.existsSync(path.join(serverDir, 'instrument.server.mjs'))).toBe(false);
  });

  it('skips for a cloudflare deploy target', async () => {
    setup({ deps: { '@cloudflare/vite-plugin': '1.0.0' } });
    await injectServerInstrumentation(options());
    expect(readServerEntry()).not.toContain(SENTRY_AUTO_INJECT_MARKER);
  });

  it('injects for a serverless (non-cloudflare) deploy target', async () => {
    setup({ deps: { '@vercel/react-router': '1.0.0' } });
    await injectServerInstrumentation(options());
    expect(readServerEntry()).toContain(SENTRY_AUTO_INJECT_MARKER);
  });

  it('skips when the instrumentation file is missing', async () => {
    setup({ withInstrumentFile: false });
    await injectServerInstrumentation(options());
    expect(readServerEntry()).not.toContain(SENTRY_AUTO_INJECT_MARKER);
  });
});
