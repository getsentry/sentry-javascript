import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { OnStartResult, PluginBuild } from 'esbuild';
import type { NormalizedInputOptions, PluginContext } from 'rollup';
import type { ResolvedConfig } from 'vite';
import type { Compiler } from 'webpack';
import { describe, expect, it, vi } from 'vitest';
import { sentryOrchestrionPlugin as esbuildPlugin } from '../../src/orchestrion/bundler/esbuild';
import { orchestrionTransformOptions } from '../../src/orchestrion/bundler/options';
import { sentryOrchestrionPlugin as rollupPlugin } from '../../src/orchestrion/bundler/rollup';
import { sentryOrchestrionPlugin as vitePlugin } from '../../src/orchestrion/bundler/vite';
import {
  resolveOrchestrionRuntimeRequest,
  sentryOrchestrionWebpackPlugin,
} from '../../src/orchestrion/bundler/webpack';

// The upstream transform plugins are mocked so tests exercise only the hooks
// added on top of them (the externalized-modules warnings).
vi.mock('@apm-js-collab/code-transformer-bundler-plugins/esbuild', () => ({
  default: () => ({ name: 'code-transformer', setup: vi.fn() }),
}));
vi.mock('@apm-js-collab/code-transformer-bundler-plugins/vite', () => ({
  default: () => ({ name: 'code-transformer', transform: () => 'transformed' }),
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
      onResolve: vi.fn(),
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

  describe('snippet resolve alias', () => {
    // The snippet's `@sentry/server-utils/orchestrion` import is emitted inside
    // transformed node_modules files, where it doesn't resolve under isolated
    // installs (pnpm) — the plugin maps it to this package's own resolution.
    function applyWithResolve(resolve: unknown): { alias?: unknown } {
      const options = { externals: undefined, resolve } as { resolve?: { alias?: unknown } };
      const compiler = {
        options,
        hooks: { thisCompilation: { tap: vi.fn() } },
        webpack: { WebpackError: Error },
      } as unknown as Compiler;
      sentryOrchestrionWebpackPlugin().apply(compiler);
      return options.resolve ?? {};
    }

    it('adds an exact-match alias to object-form (and absent) alias config', () => {
      const { alias } = applyWithResolve(undefined);
      const target = (alias as Record<string, string>)['@sentry/server-utils/orchestrion$'];

      expect(target).toBeDefined();
      expect(isAbsolute(target!)).toBe(true);
    });

    it('appends an onlyModule entry to array-form alias config', () => {
      const existing = { name: 'other', alias: '/other' };
      const { alias } = applyWithResolve({ alias: [existing] });

      expect(alias).toEqual([
        existing,
        {
          name: '@sentry/server-utils/orchestrion',
          alias: expect.stringMatching(/orchestrion/),
          onlyModule: true,
        },
      ]);
    });

    it('leaves an existing user alias for the specifier untouched', () => {
      const { alias: objectAlias } = applyWithResolve({ alias: { '@sentry/server-utils/orchestrion': '/user' } });
      expect(objectAlias).toEqual({ '@sentry/server-utils/orchestrion': '/user' });

      const userEntry = { name: '@sentry/server-utils/orchestrion', alias: '/user' };
      const { alias: arrayAlias } = applyWithResolve({ alias: [userEntry] });
      expect(arrayAlias).toEqual([userEntry]);
    });
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

  it('force-bundles the orchestrion helper package alongside instrumented modules', () => {
    const plugin = vitePlugin();
    const config = (plugin.config as () => { ssr: { noExternal: string[] } })();

    // Left external, Vite 5's CommonJS interop turns the snippet's `require`
    // into a default import of the named-exports-only ESM entry — a link-time
    // crash at server startup.
    expect(config.ssr.noExternal).toContain('@sentry/server-utils');
    expect(config.ssr.noExternal).toContain('mysql');
  });

  it('gates the transform on the ssr flag (Vite 5 ignores applyToEnvironment)', () => {
    const plugin = vitePlugin();
    const transform = plugin.transform as (
      this: unknown,
      code: string,
      id: string,
      opts?: { ssr?: boolean },
    ) => unknown;

    // Client-build transforms must be skipped: transformed modules in the
    // client graph would import the subscriber factories, whose
    // `node:diagnostics_channel` imports break against the browser shim.
    expect(transform.call({}, 'code', 'id', { ssr: false })).toBeNull();
    expect(transform.call({}, 'code', 'id', undefined)).toBeNull();
    expect(transform.call({}, 'code', 'id', { ssr: true })).toBe('transformed');
  });

  it('gates resolveId on the ssr flag and falls back to self-resolution', async () => {
    const plugin = vitePlugin();
    const resolveId = plugin.resolveId as (
      this: unknown,
      source: string,
      importer: string | undefined,
      opts?: { ssr?: boolean },
    ) => Promise<unknown>;

    const resolve = vi.fn().mockResolvedValue(null);
    await expect(
      resolveId.call({ resolve }, '@sentry/server-utils/orchestrion', '/x.js', { ssr: false }),
    ).resolves.toBeNull();
    expect(resolve).not.toHaveBeenCalled();

    // Normal resolution wins when it succeeds.
    resolve.mockResolvedValueOnce({ id: '/resolved.js' });
    await expect(
      resolveId.call({ resolve }, '@sentry/server-utils/orchestrion', '/x.js', { ssr: true }),
    ).resolves.toEqual({
      id: '/resolved.js',
    });

    // When it fails (pnpm isolation), fall back to this package's own resolution.
    const fallback = await resolveId.call({ resolve }, '@sentry/server-utils/orchestrion', '/x.js', { ssr: true });
    expect(typeof fallback).toBe('string');
    expect(fallback).toContain('orchestrion');
  });
});

describe('buildTimeInstrumentation: false', () => {
  const disabled = { buildTimeInstrumentation: false };

  it('returns an inert vite plugin without the transform hooks', () => {
    const plugin = vitePlugin(disabled);

    expect(plugin.name).toBe('sentry-orchestrion-disabled');
    expect(plugin.config).toBeUndefined();
    expect(plugin.configResolved).toBeUndefined();
    expect(plugin.applyToEnvironment).toBeUndefined();
  });

  it('returns an inert rollup plugin without the transform hooks', () => {
    const plugin = rollupPlugin(disabled);

    expect(plugin.name).toBe('sentry-orchestrion-disabled');
    expect(plugin.buildStart).toBeUndefined();
    expect((plugin as { transform?: unknown }).transform).toBeUndefined();
  });

  it('returns an inert esbuild plugin whose setup is a no-op', () => {
    const build = { initialOptions: {}, onStart: vi.fn() } as unknown as PluginBuild;
    const plugin = esbuildPlugin(disabled);

    expect(plugin.name).toBe('sentry-orchestrion-disabled');
    expect(plugin.setup(build)).toBeUndefined();
    expect(build.onStart).not.toHaveBeenCalled();
  });

  it('returns an inert webpack plugin whose apply is a no-op', () => {
    const tap = vi.fn();
    const compiler = {
      options: { externals: ['mysql'] },
      hooks: { thisCompilation: { tap } },
    } as unknown as Compiler;

    expect(() => sentryOrchestrionWebpackPlugin(disabled).apply(compiler)).not.toThrow();
    expect(tap).not.toHaveBeenCalled();
  });
});

describe('resolveOrchestrionRuntimeRequest', () => {
  it.each([
    // Self-references — resolve through this package's own exports map to the CJS build.
    '@sentry/server-utils/orchestrion/register',
    '@sentry/server-utils/orchestrion',
    // Dependencies of this package, including subpaths only reachable from its location.
    '@apm-js-collab/tracing-hooks',
    '@apm-js-collab/tracing-hooks/hook.mjs',
    '@apm-js-collab/tracing-hooks/hook-sync.mjs',
    '@apm-js-collab/tracing-hooks/lib/diagnostics.js',
    '@apm-js-collab/code-transformer',
  ])('resolves %s to an existing absolute path', request => {
    const resolved = resolveOrchestrionRuntimeRequest(request);

    expect(resolved).toBeDefined();
    expect(isAbsolute(resolved!)).toBe(true);
    expect(existsSync(resolved!)).toBe(true);
  });

  it('resolves self-references with require conditions, so the paths are loadable via require()', () => {
    expect(resolveOrchestrionRuntimeRequest('@sentry/server-utils/orchestrion/register')).toMatch(/[/\\]cjs[/\\]/);
  });

  it('returns undefined for unresolvable requests', () => {
    expect(resolveOrchestrionRuntimeRequest('@sentry/server-utils/no-such-subpath')).toBeUndefined();
    expect(resolveOrchestrionRuntimeRequest('some-package-that-does-not-exist')).toBeUndefined();
  });
});

describe('orchestrionTransformOptions', () => {
  it('always includes the module-injected tracingChannelImport override', () => {
    const opts = orchestrionTransformOptions({});

    expect(typeof opts.customTransforms?.tracingChannelImport).toBe('function');
  });

  it('keeps user custom transforms and lets the module-injected override win a name clash', () => {
    const userTransform = vi.fn();
    const clashing = vi.fn();

    const opts = orchestrionTransformOptions({
      customTransforms: { myTransform: userTransform, tracingChannelImport: clashing },
    });

    expect(opts.customTransforms?.myTransform).toBe(userTransform);
    expect(opts.customTransforms?.tracingChannelImport).not.toBe(clashing);
  });

  describe('marker banner', () => {
    // Evaluate the emitted boot-banner snippet against a fake global, mirroring
    // what runs when a bundled app boots. The banner only marks "the bundler
    // plugin ran"; module names arrive per module via the injected snippets.
    function runBanner(global: Record<string, unknown>): void {
      const opts = orchestrionTransformOptions({});
      const banner = opts.injectDiagnostics?.({ transformedModules: [], failedModules: [] });
      expect(typeof banner).toBe('string');
      // `globalThis` inside the snippet resolves to the sandbox object we pass in.
      // oxlint-disable-next-line typescript/no-implied-eval -- executing the generated injection snippet is the behavior under test
      new Function('globalThis', banner as string)(global);
    }

    it('marks the plugin as ran with an empty module list', () => {
      const global: Record<string, unknown> = {};

      runBanner(global);

      expect((global.__SENTRY_ORCHESTRION__ as { bundler?: string[] }).bundler).toEqual([]);
    });

    it('never clobbers module names an injected snippet already recorded', () => {
      const global: Record<string, unknown> = { __SENTRY_ORCHESTRION__: { bundler: ['mysql'] } };

      runBanner(global);

      expect((global.__SENTRY_ORCHESTRION__ as { bundler?: string[] }).bundler).toEqual(['mysql']);
    });
  });
});
