import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { init, parse } from 'cjs-module-lexer';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Node-only exports must be statically resolvable from the server AND edge builds, since Next.js compiles
 * instrumentation modules for the edge runtime too. Otherwise named imports from `@sentry/nextjs` fail to compile
 * under Turbopack/webpack.
 *
 *
 * Regression test for https://github.com/getsentry/sentry-javascript/issues/21317
 */
describe('`pinoIntegration` is a statically detectable export from every runtime build', () => {
  const builds = {
    server: resolve(__dirname, '../build/cjs/index.server.js'),
    edge: resolve(__dirname, '../build/cjs/edge/index.js'),
  };

  const staticExports: Record<string, string[]> = {};

  beforeAll(async () => {
    await init();
    for (const [runtime, path] of Object.entries(builds)) {
      staticExports[runtime] = parse(readFileSync(path, 'utf8')).exports;
    }
  });

  it.each(Object.keys(builds))('statically exports `pinoIntegration` from the %s build', runtime => {
    expect(staticExports[runtime]).toContain('pinoIntegration');
  });
});
