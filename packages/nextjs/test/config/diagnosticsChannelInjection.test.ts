import { describe, expect, it } from 'vitest';
import {
  BUNDLE_SAFE_INSTRUMENTED_PACKAGES,
  externalizeEsmOnlyOrchestrionSpecifiers,
  filterInstrumentedExternals,
} from '../../src/config/diagnosticsChannelInjection';
import { setUpBuildTimeVariables } from '../../src/config/withSentryConfig/buildTime';
import { getServerExternalPackagesPatch } from '../../src/config/withSentryConfig/getFinalConfigObjectBundlerUtils';
import type { NextConfigObject } from '../../src/config/types';

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

describe('getServerExternalPackagesPatch (diagnostics-channel injection)', () => {
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
    expect(externals).toContain('@apm-js-collab/tracing-hooks');
    expect(externals).toContain('@apm-js-collab/code-transformer');
  });

  it('respects user-provided externals even for bundle-safe packages', () => {
    const patch = getServerExternalPackagesPatch({ serverExternalPackages: ['ioredis'] }, 16, true);
    expect(patch.serverExternalPackages).toContain('ioredis');
  });

  it('is unchanged with the flag off', () => {
    const patch = getServerExternalPackagesPatch({}, 16, false);
    const externals = patch.serverExternalPackages ?? [];
    expect(externals).toContain('ioredis');
    expect(externals).toContain('mysql');
    expect(externals).not.toContain('@apm-js-collab/tracing-hooks');
  });
});

describe('externalizeEsmOnlyOrchestrionSpecifiers', () => {
  it('externalizes the ESM-only orchestrion specifier as a plain commonjs require', async () => {
    await expect(
      externalizeEsmOnlyOrchestrionSpecifiers({ request: '@apm-js-collab/tracing-hooks/hook-sync.mjs' }),
    ).resolves.toBe('commonjs @apm-js-collab/tracing-hooks/hook-sync.mjs');
  });

  it('ignores unrelated requests so later externals handlers still run', async () => {
    await expect(externalizeEsmOnlyOrchestrionSpecifiers({ request: 'some-other-package' })).resolves.toBeUndefined();
    await expect(externalizeEsmOnlyOrchestrionSpecifiers({})).resolves.toBeUndefined();
  });
});

describe('setUpBuildTimeVariables (diagnostics-channel injection)', () => {
  it('injects the flag marker and the tracing-hooks location', () => {
    const nextConfig: NextConfigObject = {};
    setUpBuildTimeVariables(nextConfig, { _experimental: { useDiagnosticsChannelInjection: true } }, undefined);

    expect(nextConfig.env).toMatchObject({
      _sentryUseDiagnosticsChannelInjection: 'true',
    });
  });

  it('injects neither with the flag off', () => {
    const nextConfig: NextConfigObject = {};
    setUpBuildTimeVariables(nextConfig, {}, undefined);

    expect(nextConfig.env).not.toHaveProperty('_sentryUseDiagnosticsChannelInjection');
  });
});
