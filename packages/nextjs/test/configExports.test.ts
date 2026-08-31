import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { init, parse } from 'cjs-module-lexer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/withSentryConfig', () => ({
  withSentryConfig: vi.fn((nextConfig: unknown) => nextConfig),
}));

/**
 * `next.config.mjs` is loaded by a plain Node ESM loader, but build-time config code resolves webpack loader and
 * template paths with `__dirname`, which is a `ReferenceError` in an ES module. So `./config` deliberately serves the
 * CJS build to ESM importers too, rather than splitting `import`/`require` like the runtime entries do.
 *
 * There is no dual-package hazard here because this code runs at build time only and holds no SDK state.
 */
describe('`./config` subpath export', () => {
  const packageExports = (
    JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    }
  ).exports;

  it('resolves to the CJS build for every condition', () => {
    expect(packageExports['./config']).toEqual({
      types: './build/types/config/index.d.ts',
      default: './build/cjs/config/index.js',
    });
  });

  it('never points a condition at the ESM config build', () => {
    expect(JSON.stringify(packageExports['./config'])).not.toContain('build/esm');
  });
});

/**
 * ESM consumers of a CJS file only get the named exports `cjs-module-lexer` can see statically — anything it misses
 * links as `undefined`. So `withSentryConfig` has to stay statically detectable for `import { withSentryConfig } from
 * '@sentry/nextjs/config'` to work in a `next.config.mjs`.
 *
 * Exercises the generated artifact, so it needs the package built.
 */
describe('`./config` static exports (generated)', () => {
  let staticExports: string[];

  beforeAll(async () => {
    await init();
    staticExports = parse(readFileSync(resolve(__dirname, '../build/cjs/config/index.js'), 'utf8')).exports;
  });

  it('statically exports `withSentryConfig`', () => {
    expect(staticExports).toContain('withSentryConfig');
  });
});

describe('deprecated `withSentryConfig` on the `@sentry/nextjs` entry', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('delegates to `@sentry/nextjs/config`', async () => {
    const { withSentryConfig } = await import('../src/config/deprecatedWithSentryConfig');
    const { withSentryConfig: withSentryConfigImpl } = await import('../src/config/withSentryConfig');
    const nextConfig = { reactStrictMode: true };

    expect(withSentryConfig(nextConfig, { silent: true })).toBe(nextConfig);
    expect(withSentryConfigImpl).toHaveBeenCalledWith(nextConfig, { silent: true });
  });

  it('warns once, no matter how often the config is materialized', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { withSentryConfig } = await import('../src/config/deprecatedWithSentryConfig');

    withSentryConfig({});
    withSentryConfig({});

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("import { withSentryConfig } from '@sentry/nextjs/config'"),
    );
  });

  it('does not warn when imported from `@sentry/nextjs/config`', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { withSentryConfig } = await import('../src/config');

    withSentryConfig({});

    expect(warn).not.toHaveBeenCalled();
  });
});
