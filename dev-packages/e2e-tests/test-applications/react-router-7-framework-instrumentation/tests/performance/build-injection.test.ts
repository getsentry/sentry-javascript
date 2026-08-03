import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

function readBundle(dir: string): string {
  const root = path.join(process.cwd(), dir);
  return readdirSync(root, { recursive: true })
    .filter((file): file is string => typeof file === 'string' && file.endsWith('.js'))
    .map(file => readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
}

test.describe('Orchestrion build-time injection', () => {
  const serverBundle = readBundle('build/server');
  const clientBundle = readBundle('build/client');

  test('force-bundles instrumented dependencies', () => {
    expect(serverBundle).not.toMatch(/(from\s*["']mysql["']|require\(["']mysql["']\))/);
    expect(serverBundle).not.toMatch(/(from\s*["']ioredis["']|require\(["']ioredis["']\))/);
  });

  test('injects diagnostics-channel publishers into the server build', () => {
    expect(serverBundle).toContain('__SENTRY_ORCHESTRION__');
    expect(serverBundle).toMatch(/tracingChannel\(["']orchestrion:mysql:query["']\)/);
    expect(serverBundle).toMatch(/tracingChannel\(["']orchestrion:ioredis:command["']\)/);
    expect(serverBundle).toMatch(/tracingChannel\(["']orchestrion:ioredis:connect["']\)/);
  });

  test('does not inject diagnostics-channel publishers into the client build', () => {
    // The client build may carry the inert `__SENTRY_ORCHESTRION__.bundler = []` detection marker
    // (it's environment-agnostic and harmless in a browser), but the actual `tracingChannel` publishers
    // and their channel names must never leak — `applyToEnvironment` keeps the transform server-only, so
    // a browser never hits a `diagnostics_channel` call that would throw.
    expect(clientBundle).not.toMatch(/tracingChannel\(/);
    expect(clientBundle).not.toMatch(/orchestrion:[a-z]/);
  });
});
