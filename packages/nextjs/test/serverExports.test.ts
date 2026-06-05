import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { init, parse } from 'cjs-module-lexer';
import { beforeAll, describe, expect, it } from 'vitest';

const cjsBuildPath = resolve(__dirname, '../build/cjs/index.server.js');

/**
 * These exports flow through the wildcard `export * from '@sentry/node'` in the server entry.
 * Turbopack's static import analyzer seems to not be able to detect these.
 *
 * Regression test for https://github.com/getsentry/sentry-javascript/issues/21317
 */
describe('server entry static named exports', () => {
  let staticExports: string[];

  beforeAll(async () => {
    await init();
    const source = readFileSync(cjsBuildPath, 'utf8');
    staticExports = parse(source).exports;
  });

  it.each(['pinoIntegration'])('statically exports `%s` from the CJS build', name => {
    expect(staticExports).toContain(name);
  });
});
