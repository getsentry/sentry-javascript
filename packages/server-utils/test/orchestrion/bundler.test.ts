import type { OnStartResult, PluginBuild } from 'esbuild';
import type { NormalizedInputOptions, PluginContext } from 'rollup';
import type { ResolvedConfig } from 'vite';
import type { Compiler } from 'webpack';
import { describe, expect, it, vi } from 'vitest';
import { sentryOrchestrionPlugin as esbuildPlugin } from '../../src/orchestrion/bundler/esbuild';
import { sentryOrchestrionPlugin as rollupPlugin } from '../../src/orchestrion/bundler/rollup';
import { sentryOrchestrionPlugin as vitePlugin } from '../../src/orchestrion/bundler/vite';
import { sentryOrchestrionWebpackPlugin } from '../../src/orchestrion/bundler/webpack';

// The upstream transform plugins are mocked so tests exercise only the hooks
// added on top of them (the externalized-modules warnings).
vi.mock('@apm-js-collab/code-transformer-bundler-plugins/esbuild', () => ({
  default: () => ({ name: 'code-transformer', setup: vi.fn() }),
}));
vi.mock('@apm-js-collab/code-transformer-bundler-plugins/vite', () => ({
  default: () => ({ name: 'code-transformer' }),
}));
vi.mock('@apm-js-collab/code-transformer-bundler-plugins/webpack', () => ({
  default: () => ({ apply: vi.fn() }),
}));

describe('sentryOrchestrionPlugin (rollup)', () => {
  // Mirrors what Rollup passes to buildStart: `external` is already normalized
  // into a predicate function, regardless of how the user configured it.
  function runBuildStart(external: (source: string) => boolean): ReturnType<typeof vi.fn> {
    const warn = vi.fn();
    const plugin = rollupPlugin();
    (plugin.buildStart as (this: unknown, options: unknown) => void).call(
      { warn } as unknown as PluginContext,
      { external } as unknown as NormalizedInputOptions,
    );
    return warn;
  }

  it('warns when instrumented modules are externalized', () => {
    const warn = runBuildStart(source => source === 'mysql' || source === 'pg');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('mysql, pg'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('need to be bundled'));
  });

  it('does not warn when no instrumented modules are externalized', () => {
    const warn = runBuildStart(source => source === 'some-other-package');

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('sentryOrchestrionPlugin (esbuild)', () => {
  function runSetup(external: string[] | undefined): OnStartResult[] {
    const onStartCallbacks: Array<() => OnStartResult> = [];
    const build = {
      initialOptions: { external },
      onStart: (callback: () => OnStartResult) => onStartCallbacks.push(callback),
    } as unknown as PluginBuild;
    void esbuildPlugin().setup(build);
    return onStartCallbacks.map(callback => callback());
  }

  it('warns when instrumented modules are externalized', () => {
    const results = runSetup(['mysql', 'pg/lib/client']);

    expect(results).toHaveLength(1);
    expect(results[0]?.warnings?.[0]?.text).toContain('mysql, pg');
  });

  it('matches wildcard external patterns', () => {
    const results = runSetup(['mysql*']);

    expect(results).toHaveLength(1);
    expect(results[0]?.warnings?.[0]?.text).toContain('mysql');
    expect(results[0]?.warnings?.[0]?.text).toContain('mysql2');
  });

  it('does not warn when no instrumented modules are externalized', () => {
    expect(runSetup(['lodash'])).toHaveLength(0);
    expect(runSetup(undefined)).toHaveLength(0);
  });
});

describe('sentryOrchestrionWebpackPlugin', () => {
  function runApply(externals: unknown): Error[] {
    const compilation = { warnings: [] as Error[] };
    const compiler = {
      options: { externals },
      hooks: {
        thisCompilation: { tap: (_name: string, callback: (compilation: unknown) => void) => callback(compilation) },
      },
      webpack: { WebpackError: Error },
    } as unknown as Compiler;
    sentryOrchestrionWebpackPlugin().apply(compiler);
    return compilation.warnings;
  }

  it('warns for string, RegExp and object externals', () => {
    expect(runApply(['mysql'])[0]?.message).toContain('mysql');
    expect(runApply('mysql')[0]?.message).toContain('mysql');
    expect(runApply([/^pg$/])[0]?.message).toContain('pg');
    expect(runApply({ mysql: 'commonjs mysql' })[0]?.message).toContain('mysql');
  });

  it('does not warn for unrelated or function externals', () => {
    expect(runApply(['lodash'])).toHaveLength(0);
    expect(runApply(() => undefined)).toHaveLength(0);
    expect(runApply(undefined)).toHaveLength(0);
  });
});

describe('sentryOrchestrionPlugin (vite)', () => {
  function runConfigResolved(ssrExternal: string[] | true | undefined): ReturnType<typeof vi.fn> {
    const warn = vi.fn();
    const plugin = vitePlugin();
    (plugin.configResolved as (config: unknown) => void)({
      ssr: { external: ssrExternal },
      logger: { warn },
    } as unknown as ResolvedConfig);
    return warn;
  }

  it('warns when instrumented modules are listed in ssr.external', () => {
    const warn = runConfigResolved(['mysql', 'lodash']);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('mysql'));
  });

  it('does not warn for ssr.external: true or unrelated entries', () => {
    // `ssr.external: true` does not override the plugin's noExternal entries.
    expect(runConfigResolved(true)).not.toHaveBeenCalled();
    expect(runConfigResolved(['lodash'])).not.toHaveBeenCalled();
    expect(runConfigResolved(undefined)).not.toHaveBeenCalled();
  });
});
