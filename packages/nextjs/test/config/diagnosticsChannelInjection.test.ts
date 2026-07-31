import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUNDLE_SAFE_INSTRUMENTED_PACKAGES,
  externalizeOrchestrionRuntimePackages,
  filterInstrumentedExternals,
} from '../../src/config/diagnosticsChannelInjection';
import type { BundlerInfo } from '../../src/config/withSentryConfig/getFinalConfigObjectBundlerUtils';
import {
  getServerExternalPackagesPatch,
  resolveBuildTimeInstrumentationOption,
} from '../../src/config/withSentryConfig/getFinalConfigObjectBundlerUtils';

describe('filterInstrumentedExternals', () => {
  it('removes the given packages, keeps the rest', () => {
    expect(
      filterInstrumentedExternals(['express', 'pg', 'pg-pool', 'ioredis', 'mongodb'], ['pg', 'pg-pool', 'ioredis']),
    ).toEqual(['express', 'mongodb']);
  });

  it('is a no-op with an empty bundle list', () => {
    expect(filterInstrumentedExternals(['express', 'pg'], [])).toEqual(['express', 'pg']);
  });
});

describe('getServerExternalPackagesPatch (build-time instrumentation)', () => {
  it('keeps everything external except the bundle-safe allowlist, and adds the runtime machinery', () => {
    const patch = getServerExternalPackagesPatch({}, 16, true);
    const externals = patch.serverExternalPackages ?? [];

    // Only the verified bundle-safe packages leave the external list (→ build-time loader).
    for (const name of BUNDLE_SAFE_INSTRUMENTED_PACKAGES) {
      expect(externals).not.toContain(name);
    }
    // Other instrumented packages stay external (→ runtime module hook).
    expect(externals).toContain('mysql');
    expect(externals).toContain('pg');
    expect(externals).toContain('pg-pool');
    // The orchestrion machinery must be external for the runtime hook to work.
    expect(externals).toContain('@sentry/server-utils');
  });

  it('respects user-provided externals even for bundle-safe packages', () => {
    const patch = getServerExternalPackagesPatch({ serverExternalPackages: ['ioredis'] }, 16, true);
    expect(patch.serverExternalPackages).toContain('ioredis');
  });

  it('is unchanged when build-time instrumentation is off', () => {
    const patch = getServerExternalPackagesPatch({}, 16, false);
    const externals = patch.serverExternalPackages ?? [];
    expect(externals).toContain('ioredis');
    expect(externals).toContain('mysql');
    expect(externals).not.toContain('@apm-js-collab/tracing-hooks');
  });
});

describe('externalizeOrchestrionRuntimePackages', () => {
  it.each(['@sentry/server-utils', '@sentry/server-utils/orchestrion', '@sentry/server-utils/orchestrion/register'])(
    'externalizes %s as an absolute-path commonjs require',
    async request => {
      const external = await externalizeOrchestrionRuntimePackages({ request });

      expect(external).toMatch(/^commonjs /);
      const resolvedPath = external!.slice('commonjs '.length);
      expect(isAbsolute(resolvedPath)).toBe(true);
      expect(existsSync(resolvedPath)).toBe(true);
    },
  );

  it('ignores the bundled @apm-js-collab packages — no import of them exists in the dist anymore', async () => {
    await expect(
      externalizeOrchestrionRuntimePackages({ request: '@apm-js-collab/tracing-hooks' }),
    ).resolves.toBeUndefined();
  });

  it('resolves @sentry/server-utils subpaths to the CJS build, since the emitted external is a require()', async () => {
    const external = await externalizeOrchestrionRuntimePackages({
      request: '@sentry/server-utils/orchestrion/register',
    });

    expect(external).toMatch(/[/\\]cjs[/\\]/);
  });

  it('ignores unrelated requests so later externals handlers still run', async () => {
    await expect(externalizeOrchestrionRuntimePackages({ request: 'some-other-package' })).resolves.toBeUndefined();
    // Prefix matching must not leak beyond a package-name boundary.
    await expect(
      externalizeOrchestrionRuntimePackages({ request: '@sentry/server-utils-extras' }),
    ).resolves.toBeUndefined();
    await expect(externalizeOrchestrionRuntimePackages({})).resolves.toBeUndefined();
  });
});

describe('resolveBuildTimeInstrumentationOption', () => {
  const webpack: BundlerInfo = { isWebpack: true, isTurbopack: false, isTurbopackSupported: true };
  const turbopack: BundlerInfo = { isWebpack: false, isTurbopack: true, isTurbopackSupported: true };

  it('is on by default', () => {
    expect(resolveBuildTimeInstrumentationOption({}, webpack, '15.0.0')).toBe(true);
    expect(resolveBuildTimeInstrumentationOption({}, turbopack, '16.0.0')).toBe(true);
  });

  it.each([webpack, turbopack])('respects an explicit opt-out', bundlerInfo => {
    expect(resolveBuildTimeInstrumentationOption({ buildTimeInstrumentation: false }, bundlerInfo, '16.0.0')).toBe(
      false,
    );
  });

  // Un-externalizing the bundle-safe packages without a transform to instrument them would leave
  // them bundled *and* uninstrumented, so the whole feature has to stay off.
  it('stays off under Turbopack below Next.js 16, where the transform rule cannot run', () => {
    expect(resolveBuildTimeInstrumentationOption({}, turbopack, '15.4.1')).toBe(false);
    expect(resolveBuildTimeInstrumentationOption({}, turbopack, undefined)).toBe(false);
  });

  it('still applies on webpack when the Next.js version is unknown', () => {
    expect(resolveBuildTimeInstrumentationOption({}, webpack, undefined)).toBe(true);
  });

  // Same reasoning as the Turbopack gate: without Sentry's webpack config there is no transform.
  it("stays off on webpack when Sentry's webpack config is disabled", () => {
    expect(resolveBuildTimeInstrumentationOption({ webpack: { disableSentryConfig: true } }, webpack, '15.0.0')).toBe(
      false,
    );
  });
});
