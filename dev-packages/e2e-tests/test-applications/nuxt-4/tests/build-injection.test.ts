import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

function readServerBundle(): string {
  const serverDir = path.join(process.cwd(), '.output/server');
  return readdirSync(serverDir, { recursive: true })
    .filter(file => typeof file === 'string' && file.endsWith('.mjs'))
    .map(file => readFileSync(path.join(serverDir, file), 'utf8'))
    .join('\n');
}

function readClientBundle(): string {
  const serverDir = path.join(process.cwd(), '.output/public');
  return readdirSync(serverDir, { recursive: true })
    .filter(file => typeof file === 'string' && file.endsWith('.js'))
    .map(file => readFileSync(path.join(serverDir, file), 'utf8'))
    .join('\n');
}

test.describe('Orchestrion build-time injection', () => {
  const serverBundle = readServerBundle();
  const clientBundle = readClientBundle();

  test('force-bundles instrumented dependencies', () => {
    expect(serverBundle).not.toMatch(/(from\s*["']mysql["']|require\(["']mysql["']\))/);
    expect(serverBundle).not.toMatch(/(from\s*["']ioredis["']|require\(["']ioredis["']\))/);
    expect(serverBundle).not.toMatch(/(from\s*["']standard-as-callback["']|require\(["']standard-as-callback["']\))/);
  });

  test('injects diagnostics-channel publishers into the server build', () => {
    expect(serverBundle).toContain('__SENTRY_ORCHESTRION__');
    // Each transformed module carries the module-injected snippet that records it
    // on the global marker (and registers its subscriber factory) when evaluated.
    expect(serverBundle).toContain('orchestrionModuleInjected');
    expect(serverBundle).toMatch(/tracingChannel\(["']orchestrion:mysql:query["']\)/);
    expect(serverBundle).toMatch(/tracingChannel\(["']orchestrion:ioredis:command["']\)/);
    expect(serverBundle).toMatch(/tracingChannel\(["']orchestrion:ioredis:connect["']\)/);
  });

  test('does not inject diagnostics-channel publishers into the client build', () => {
    expect(clientBundle).not.toContain('__SENTRY_ORCHESTRION__');
    expect(clientBundle).not.toMatch(/orchestrion:/);
  });
});

test.describe('Sentry server config injection', () => {
  test('evaluates Sentry.init before nitro runs its plugins', () => {
    const nitroChunk = readFileSync(path.join(process.cwd(), '.output/server/chunks/nitro/nitro.mjs'), 'utf8');

    // The app DSN only appears in the transpiled `Sentry.init` options object, so it marks where
    // init evaluates inside the chunk.
    const initIndex = nitroChunk.indexOf('https://public@dsn.ingest.sentry.io/1337');
    const runPluginsIndex = nitroChunk.indexOf('runNitroPlugins');

    expect(initIndex).toBeGreaterThan(-1);
    expect(runPluginsIndex).toBeGreaterThan(-1);
    expect(initIndex).toBeLessThan(runPluginsIndex);
  });

  test('emits the `--import` compatibility shim at the former config path', () => {
    const shimPath = path.join(process.cwd(), '.output/server/sentry.server.config.mjs');

    expect(existsSync(shimPath)).toBe(true);
    expect(readFileSync(shimPath, 'utf8')).toContain('no longer needed');
  });

  test('sends no telemetry during the prerendering build', () => {
    // Prerendering executes the server bundle at build time; init is skipped there, so the tunnel
    // must receive zero envelopes while `test:build` runs (counted by scripts/build-with-prerender-event-sink.mjs).
    const countPath = path.join(process.cwd(), '.output/build-envelope-count.json');
    test.skip(!existsSync(countPath), 'build ran without the event-sink wrapper (use `pnpm test:build`)');

    const { envelopeCount } = JSON.parse(readFileSync(countPath, 'utf8'));
    test.skip(envelopeCount === null, 'tunnel port was busy during the build');

    expect(envelopeCount).toBe(0);
  });
});
