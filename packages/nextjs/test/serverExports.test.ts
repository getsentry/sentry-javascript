import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { init, parse } from 'cjs-module-lexer';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Node-only exports must be statically resolvable from the server AND edge builds, since Next.js compiles
 * instrumentation modules for the edge runtime too. Otherwise named imports from `@sentry/nextjs` fail to compile
 * under Turbopack/webpack. Exports that are Node-only get a no-op shim on the edge build (e.g. `vercelAIIntegration`).
 *
 *
 * Regression test for https://github.com/getsentry/sentry-javascript/issues/21317
 */
describe('Node-only integrations are statically detectable exports from every runtime build', () => {
  const builds = {
    server: resolve(__dirname, '../build/cjs/index.server.js'),
    edge: resolve(__dirname, '../build/cjs/edge/index.js'),
  };

  const dualRuntimeExports = ['pinoIntegration', 'vercelAIIntegration'];

  const staticExports: Record<string, string[]> = {};

  beforeAll(async () => {
    await init();
    for (const [runtime, path] of Object.entries(builds)) {
      staticExports[runtime] = parse(readFileSync(path, 'utf8')).exports;
    }
  });

  it.each(Object.keys(builds).flatMap(runtime => dualRuntimeExports.map(name => ({ runtime, name }))))(
    'statically exports `$name` from the $runtime build',
    ({ runtime, name }) => {
      expect(staticExports[runtime]).toContain(name);
    },
  );
});

// Regression for https://github.com/getsentry/sentry-javascript/issues/22791.
describe('common server APIs imported by plain Node ESM', () => {
  const commonExports = [
    'addBreadcrumb',
    'captureException',
    'captureMessage',
    'consoleLoggingIntegration',
    'isEnabled',
    'isInitialized',
    'setContext',
    'setTag',
  ];
  let staticExports: string[];

  beforeAll(async () => {
    await init();
    staticExports = parse(readFileSync(resolve(__dirname, '../build/cjs/index.server.js'), 'utf8')).exports;
  });

  it.each(commonExports)('statically exports `%s` from the CJS server build', name => {
    expect(staticExports).toContain(name);
  });

  it('exposes named and namespace imports with the same values as require', () => {
    const script = `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import * as namespace from '@sentry/nextjs';
      import { ${commonExports.join(', ')} } from '@sentry/nextjs';
      const required = createRequire(import.meta.url)('@sentry/nextjs');
      const named = { ${commonExports.join(', ')} };
      for (const [name, value] of Object.entries(named)) {
        assert.equal(typeof value, 'function', name);
        assert.equal(value, required[name], name);
        assert.equal(namespace[name], required[name], name);
      }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: resolve(__dirname, '..'),
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
  });
});
