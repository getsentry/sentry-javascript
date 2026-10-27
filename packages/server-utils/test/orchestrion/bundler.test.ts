import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { OnResolveArgs, OnResolveResult, OnStartResult, Plugin as EsbuildPlugin, PluginBuild } from 'esbuild';
import type { NormalizedInputOptions, PluginContext } from 'rollup';
import type { ResolvedConfig, Plugin as VitePlugin } from 'vite';
import type { Compiler } from 'webpack';
import { describe, expect, it, vi } from 'vitest';
import { sentryOrchestrionPlugin as bunPlugin } from '../../src/orchestrion/bundler/bun';
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
vi.mock('@apm-js-collab/code-transformer-bundler-plugins/bun', () => ({
  default: () => ({ name: 'code-transformer', setup: vi.fn() }),
}));

describe('sentryOrchestrionPlugin (rollup)', () => {
  // Mirrors what Rollup passes to buildStart: `external` is already normalized
  // into a predicate function, regardless of how the user configured it.
  function runBuildStart(external: unknown): ReturnType<typeof vi.fn> {
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

  it.each([
    ['an absent external option', undefined],
    ['a string external option', 'mysql'],
    ['an array external option', ['mysql']],
    ['a regular expression external option', /^mysql$/],
  ])('does not check externalized modules for %s', (_description, external) => {
    const warn = runBuildStart(external);

    // skips the warning when external is not a normalized predicate
    expect(warn).not.toHaveBeenCalled();
  });

  it('forwards the resolveId options to this.resolve and falls back to self-resolution', async () => {
    const plugin = rollupPlugin();
    const resolveId = plugin.resolveId as (
      this: unknown,
      source: string,
      importer: string | undefined,
      opts: unknown,
    ) => Promise<unknown>;

    const resolve = vi.fn().mockResolvedValue(null);
    // `custom` is what `@rollup/plugin-commonjs` uses to recognise its own `require()` resolution;
    // dropping it makes the plugin warn (THIS_RESOLVE_WITHOUT_OPTIONS) and abandon the resolution.
    const options = { attributes: {}, custom: { 'node-resolve': { isRequire: true } }, isEntry: false };

    resolve.mockResolvedValueOnce({ id: '/resolved.js' });
    await expect(resolveId.call({ resolve }, '@sentry/server-utils', '/x.js', options)).resolves.toEqual({
      id: '/resolved.js',
    });
    expect(resolve).toHaveBeenCalledWith('@sentry/server-utils', '/x.js', { ...options, skipSelf: true });

    // When it fails (pnpm isolation), fall back to this package's own resolution.
    const fallback = await resolveId.call({ resolve }, '@sentry/server-utils', '/x.js', options);
    expect(typeof fallback).toBe('string');
    expect(fallback).toContain('server-utils');
  });

  it('ignores specifiers other than the injected snippet import', async () => {
    const plugin = rollupPlugin();
    const resolveId = plugin.resolveId as (
      this: unknown,
      source: string,
      importer: string | undefined,
      opts: unknown,
    ) => Promise<unknown>;

    const resolve = vi.fn();
    await expect(resolveId.call({ resolve }, 'mysql', '/x.js', { attributes: {}, isEntry: false })).resolves.toBeNull();
    expect(resolve).not.toHaveBeenCalled();
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
    // The snippet's `@sentry/server-utils` import is emitted inside transformed
    // node_modules files, where it doesn't resolve under isolated installs
    // (pnpm) — the plugin maps it to this package's own resolution.
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
      const target = (alias as Record<string, string>)['@sentry/server-utils$'];

      expect(target).toBeDefined();
      expect(isAbsolute(target!)).toBe(true);
    });

    it('appends an onlyModule entry to array-form alias config', () => {
      const existing = { name: 'other', alias: '/other' };
      const { alias } = applyWithResolve({ alias: [existing] });

      expect(alias).toEqual([
        existing,
        {
          name: '@sentry/server-utils',
          alias: expect.stringMatching(/server-utils/),
          onlyModule: true,
        },
      ]);
    });

    it('leaves an existing user alias for the specifier untouched', () => {
      const { alias: objectAlias } = applyWithResolve({ alias: { '@sentry/server-utils': '/user' } });
      expect(objectAlias).toEqual({ '@sentry/server-utils': '/user' });

      const userEntry = { name: '@sentry/server-utils', alias: '/user' };
      const { alias: arrayAlias } = applyWithResolve({ alias: [userEntry] });
      expect(arrayAlias).toEqual([userEntry]);
    });
  });
});

describe('sentryOrchestrionPlugin (vite)', () => {
  function runConfigResolved(
    ssrExternal: string[] | true | undefined,
    command: 'build' | 'serve' = 'build',
  ): ReturnType<typeof vi.fn> {
    const warn = vi.fn();
    const plugin = vitePlugin();
    (plugin.configResolved as (config: unknown) => void)({
      command,
      plugins: [plugin],
      ssr: { external: ssrExternal },
      logger: { warn },
    } as unknown as ResolvedConfig);
    return warn;
  }

  function runConfig(
    command: 'build' | 'serve',
    userConfig: Record<string, unknown> = { build: { ssr: true } },
  ): { ssr: { noExternal: string[] } } | null {
    const plugin = vitePlugin();
    const config = plugin.config as {
      handler: (config: unknown, env: unknown) => { ssr: { noExternal: string[] } } | null;
    };
    return config.handler.call(plugin, userConfig, { command, mode: 'production' });
  }

  type EnvironmentConfigResult = {
    resolve?: { noExternal: string[] };
    optimizeDeps?: {
      esbuildOptions?: { plugins: EsbuildPlugin[] };
      rolldownOptions?: { plugins: VitePlugin[] };
    };
  } | null;

  function runConfigEnvironment(
    name: string,
    environmentConfig: Record<string, unknown>,
    command: 'build' | 'serve' = 'build',
    // Vite 6 passes no context, Vite 8 passes `rolldownVersion`.
    context?: { meta: { rolldownVersion?: string } },
    plugin = vitePlugin(),
  ): EnvironmentConfigResult {
    const configEnvironment = plugin.configEnvironment as (
      name: string,
      config: unknown,
      env: unknown,
    ) => EnvironmentConfigResult;
    return configEnvironment.call(context, name, environmentConfig, { command, mode: 'production' });
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
    const config = runConfig('build');

    // Left external, Vite 5's CommonJS interop turns the snippet's `require`
    // into a default import of the named-exports-only ESM entry — a link-time
    // crash at server startup.
    expect(config?.ssr.noExternal).toContain('@sentry/server-utils');
    expect(config?.ssr.noExternal).toContain('mysql');
  });

  it('does not force-bundle instrumented modules on the dev server', () => {
    // Inlined in dev, the CommonJS drivers throw `exports is not defined` on import.
    expect(runConfig('serve')).toBeNull();
    expect(runConfigEnvironment('ssr', {}, 'serve')?.resolve).toBeUndefined();
  });

  it('runs the transform in the dependency optimizer of server environments on the dev server', () => {
    expect(runConfigEnvironment('ssr', {}, 'serve')).toEqual({
      optimizeDeps: {
        esbuildOptions: { plugins: [expect.objectContaining({ name: 'sentry-orchestrion-dep-optimizer' })] },
      },
    });
    expect(
      runConfigEnvironment('worker', { consumer: 'server' }, 'serve', { meta: { rolldownVersion: '1.2.14' } }),
    ).toEqual({
      optimizeDeps: {
        rolldownOptions: { plugins: [expect.objectContaining({ name: 'sentry-orchestrion-dep-optimizer' })] },
      },
    });
    expect(runConfigEnvironment('client', {}, 'serve')).toBeNull();
    expect(
      runConfigEnvironment('browser', { consumer: 'client' }, 'serve', { meta: { rolldownVersion: '1.2.14' } }),
    ).toBeNull();
  });

  it('transforms in the Rolldown dependency optimizer without the ssr flag, only in the first instance', () => {
    const first = vitePlugin();
    const second = vitePlugin();
    const config = {
      command: 'serve',
      plugins: [first, second],
      ssr: {},
      logger: { warn: vi.fn() },
    } as unknown as ResolvedConfig;
    const context = { meta: { rolldownVersion: '1.2.14' } };
    const firstOptimizerPlugin = runConfigEnvironment('worker', {}, 'serve', context, first)?.optimizeDeps
      ?.rolldownOptions?.plugins[0];
    const secondOptimizerPlugin = runConfigEnvironment('worker', {}, 'serve', context, second)?.optimizeDeps
      ?.rolldownOptions?.plugins[0];

    (first.configResolved as (config: unknown) => void)(config);
    (second.configResolved as (config: unknown) => void)(config);

    const firstTransform = firstOptimizerPlugin?.transform as (this: unknown, code: string, id: string) => unknown;
    const secondTransform = secondOptimizerPlugin?.transform as (this: unknown, code: string, id: string) => unknown;
    expect(firstTransform.call({}, 'code', 'id')).toBe('transformed');
    expect(secondTransform.call({}, 'code', 'id')).toBeNull();
  });

  it('resolves the snippet import to the ESM entry in the Rolldown dependency optimizer', async () => {
    const optimizerPlugin = runConfigEnvironment('worker', {}, 'serve', { meta: { rolldownVersion: '1.2.14' } })
      ?.optimizeDeps?.rolldownOptions?.plugins[0];
    const resolveId = optimizerPlugin?.resolveId as (
      this: unknown,
      source: string,
      importer: string,
      opts: { kind: string },
    ) => unknown;
    const resolve = vi.fn().mockResolvedValue({ id: '/app/node_modules/@sentry/server-utils/build/cjs/index.js' });

    await expect(
      resolveId.call({ resolve }, '@sentry/server-utils', '/app/node_modules/mysql/index.js', { kind: 'require-call' }),
    ).resolves.toEqual({ id: '/app/node_modules/@sentry/server-utils/build/esm/index.js' });
    expect(resolveId.call({ resolve }, 'mysql', '/app/src/index.ts', { kind: 'import-statement' })).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('resolves the snippet import to the ESM entry in the esbuild dependency optimizer', async () => {
    const optimizerPlugin = runConfigEnvironment('ssr', {}, 'serve')?.optimizeDeps?.esbuildOptions?.plugins[0];
    const onResolve = vi.fn();
    const resolve = vi.fn().mockResolvedValue({
      errors: [],
      path: '/app/node_modules/@sentry/server-utils/build/cjs/index.js',
    });
    await optimizerPlugin?.setup({ onResolve, resolve } as unknown as PluginBuild);

    expect(onResolve).toHaveBeenCalledWith({ filter: /^@sentry\/server-utils$/ }, expect.any(Function));
    const callback = onResolve.mock.lastCall?.[1] as (args: Partial<OnResolveArgs>) => Promise<OnResolveResult | null>;
    await expect(
      callback({ path: '@sentry/server-utils', importer: '/app/node_modules/mysql/index.js', kind: 'require-call' }),
    ).resolves.toEqual({ errors: [], path: '/app/node_modules/@sentry/server-utils/build/esm/index.js' });

    // When it fails (pnpm isolation), fall back to this package's own resolution.
    resolve.mockResolvedValueOnce({ errors: [{ text: 'Could not resolve' }] });
    const fallback = await callback({ path: '@sentry/server-utils', importer: '/x.js', kind: 'require-call' });
    expect(fallback?.path).toMatch(/[/\\]build[/\\]esm[/\\]index\.js$/);
  });

  it('sets up the esbuild dependency optimizer plugin only in the first instance', async () => {
    const first = vitePlugin();
    const second = vitePlugin();
    const config = {
      command: 'serve',
      plugins: [first, second],
      ssr: {},
      logger: { warn: vi.fn() },
    } as unknown as ResolvedConfig;
    const firstOptimizerPlugin = runConfigEnvironment('ssr', {}, 'serve', undefined, first)?.optimizeDeps
      ?.esbuildOptions?.plugins[0];
    const secondOptimizerPlugin = runConfigEnvironment('ssr', {}, 'serve', undefined, second)?.optimizeDeps
      ?.esbuildOptions?.plugins[0];

    (first.configResolved as (config: unknown) => void)(config);
    (second.configResolved as (config: unknown) => void)(config);

    const firstOnResolve = vi.fn();
    const secondOnResolve = vi.fn();
    await firstOptimizerPlugin?.setup({ onResolve: firstOnResolve } as unknown as PluginBuild);
    await secondOptimizerPlugin?.setup({ onResolve: secondOnResolve } as unknown as PluginBuild);

    expect(firstOnResolve).toHaveBeenCalledTimes(1);
    expect(secondOnResolve).not.toHaveBeenCalled();
  });

  it('adds the top-level ssr option only when the config already has ssr or build.ssr', () => {
    expect(runConfig('build', {})).toBeNull();
    expect(runConfig('build', { ssr: { target: 'node' } })?.ssr.noExternal).toContain('mysql');
    expect(runConfig('build', { build: { ssr: 'src/server.ts' } })?.ssr.noExternal).toContain('mysql');
  });

  it('force-bundles instrumented modules in server environments', () => {
    expect(runConfigEnvironment('ssr', {})?.resolve?.noExternal).toEqual(
      expect.arrayContaining(['mysql', '@sentry/server-utils']),
    );
    expect(runConfigEnvironment('worker', { consumer: 'server' })?.resolve?.noExternal).toContain('mysql');
    expect(runConfigEnvironment('client', {})).toBeNull();
    expect(runConfigEnvironment('browser', { consumer: 'client' })).toBeNull();
  });

  it('does not warn about externalized instrumented modules on the dev server', () => {
    expect(runConfigResolved(['mysql', 'lodash'], 'serve')).not.toHaveBeenCalled();
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

  it('transforms and warns only in the first instance when two Sentry plugins add it to one build', () => {
    const first = vitePlugin();
    const second = vitePlugin();
    const warn = vi.fn();
    const config = {
      command: 'build',
      plugins: [{ name: 'other' }, first, second],
      ssr: { external: ['mysql'] },
      logger: { warn },
    } as unknown as ResolvedConfig;

    (first.configResolved as (config: unknown) => void)(config);
    (second.configResolved as (config: unknown) => void)(config);

    const firstTransform = first.transform as (
      this: unknown,
      code: string,
      id: string,
      opts?: { ssr?: boolean },
    ) => unknown;
    const secondTransform = second.transform as (
      this: unknown,
      code: string,
      id: string,
      opts?: { ssr?: boolean },
    ) => unknown;
    expect(firstTransform.call({}, 'code', 'id', { ssr: true })).toBe('transformed');
    expect(secondTransform.call({}, 'code', 'id', { ssr: true })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('still transforms when an SDK wraps the plugin with an object spread', () => {
    // `@sentry/remix` puts `{ ...orchestrion, configResolved, transform }` into the build and calls the original hooks.
    const plugin = vitePlugin();
    const wrapper = { ...plugin, configResolved: vi.fn(), transform: vi.fn() };
    const config = {
      command: 'build',
      plugins: [wrapper],
      ssr: {},
      logger: { warn: vi.fn() },
    } as unknown as ResolvedConfig;

    (plugin.configResolved as (config: unknown) => void)(config);

    const transform = plugin.transform as (
      this: unknown,
      code: string,
      id: string,
      opts?: { ssr?: boolean },
    ) => unknown;
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
    await expect(resolveId.call({ resolve }, '@sentry/server-utils', '/x.js', { ssr: false })).resolves.toBeNull();
    expect(resolve).not.toHaveBeenCalled();

    // Normal resolution wins when it succeeds.
    resolve.mockResolvedValueOnce({ id: '/resolved.js' });
    await expect(resolveId.call({ resolve }, '@sentry/server-utils', '/x.js', { ssr: true })).resolves.toEqual({
      id: '/resolved.js',
    });

    // When it fails (pnpm isolation), fall back to this package's own resolution.
    const fallback = await resolveId.call({ resolve }, '@sentry/server-utils', '/x.js', { ssr: true });
    expect(typeof fallback).toBe('string');
    expect(fallback).toContain('server-utils');
  });

  it('resolves the snippet import to the ESM entry, also for require() calls', async () => {
    const plugin = vitePlugin();
    const resolveId = plugin.resolveId as (
      this: unknown,
      source: string,
      importer: string | undefined,
      opts?: { ssr?: boolean },
    ) => Promise<unknown>;

    const resolve = vi.fn().mockResolvedValue(null);
    // How Vite 5-7 resolve a `require()` in a CommonJS module.
    const requireOptions = { ssr: true, custom: { 'node-resolve': { isRequire: true } } };

    resolve.mockResolvedValueOnce({
      id: '/app/node_modules/@sentry/server-utils/build/cjs/index.js',
      moduleSideEffects: false,
    });
    await expect(
      resolveId.call({ resolve }, '@sentry/server-utils', '/app/node_modules/mysql/index.js', requireOptions),
    ).resolves.toEqual({
      id: '/app/node_modules/@sentry/server-utils/build/esm/index.js',
      moduleSideEffects: false,
    });
    expect(resolve).toHaveBeenCalledWith('@sentry/server-utils', '/app/node_modules/mysql/index.js', {
      ...requireOptions,
      skipSelf: true,
    });

    resolve.mockResolvedValueOnce({ id: 'C:\\app\\node_modules\\@sentry\\server-utils\\build\\cjs\\index.js' });
    await expect(resolveId.call({ resolve }, '@sentry/server-utils', '/x.js', requireOptions)).resolves.toEqual({
      id: 'C:\\app\\node_modules\\@sentry\\server-utils\\build\\esm\\index.js',
    });

    resolve.mockResolvedValueOnce({ id: '@sentry/server-utils', external: true });
    await expect(resolveId.call({ resolve }, '@sentry/server-utils', '/x.js', requireOptions)).resolves.toEqual({
      id: '@sentry/server-utils',
      external: true,
    });

    const fallback = await resolveId.call({ resolve }, '@sentry/server-utils', '/x.js', requireOptions);
    expect(fallback).toMatch(/[/\\]build[/\\]esm[/\\]index\.js$/);
    expect(existsSync(fallback as string)).toBe(true);
  });

  it('resolves the snippet require() to the ESM entry before it handles other requires on Rolldown', async () => {
    const resolveId = vitePlugin().resolveId as (
      this: unknown,
      source: string,
      importer: string,
      opts: { ssr: boolean; kind: string },
    ) => Promise<unknown>;
    const context = {
      meta: { rolldownVersion: '1.2.14' },
      environment: { name: 'ssr', mode: 'build', config: { resolve: { external: [] } } },
      resolve: vi.fn().mockResolvedValue({ id: '/app/node_modules/@sentry/server-utils/build/cjs/index.js' }),
    };

    const resolved = await resolveId.call(context, '@sentry/server-utils', '/app/node_modules/pg/lib/client.js', {
      ssr: true,
      kind: 'require-call',
    });

    expect(resolved).toEqual({ id: '/app/node_modules/@sentry/server-utils/build/esm/index.js' });
  });
});

describe('sentryOrchestrionPlugin (bun)', () => {
  type BunConfig = { banner?: string; external?: string[]; packages?: 'bundle' | 'external' };

  function runSetup(config: BunConfig, options?: Parameters<typeof bunPlugin>[0]): BunConfig {
    const build = { config };
    bunPlugin(options).setup(build);
    return build.config;
  }

  it('strips instrumented modules from external so they get bundled and transformed', () => {
    const config = runSetup({ external: ['mysql', 'some-other-package'] });

    expect(config.external).toEqual(['some-other-package']);
  });

  it('strips custom instrumentations passed via options from external', () => {
    const config = runSetup(
      { external: ['my-custom-lib', 'some-other-package'] },
      {
        instrumentations: [
          {
            channelName: 'x',
            module: { name: 'my-custom-lib', versionRange: '*', filePath: 'index.js' },
            functionQuery: { expressionName: 'x', kind: 'Sync' },
          },
        ],
      },
    );

    expect(config.external).toEqual(['some-other-package']);
  });

  it('warns and names custom instrumentations for a blanket external strategy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    runSetup(
      { packages: 'external' },
      {
        instrumentations: [
          {
            channelName: 'x',
            module: { name: 'my-custom-lib', versionRange: '*', filePath: 'index.js' },
            functionQuery: { expressionName: 'x', kind: 'Sync' },
          },
        ],
      },
    );

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('my-custom-lib'));
    warn.mockRestore();
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

  it('returns an inert bun plugin that neither banners nor force-bundles', () => {
    const build = { config: { banner: '', external: ['*'] } };
    const plugin = bunPlugin(disabled);

    expect(plugin.name).toBe('sentry-orchestrion-disabled');
    expect(plugin.setup(build)).toBeUndefined();
    expect(build.config.banner).toBe('');
    expect(build.config.external).toEqual(['*']);
  });
});

describe('resolveOrchestrionRuntimeRequest', () => {
  it.each([
    // Self-references — resolve through this package's own exports map to the CJS build.
    '@sentry/server-utils/orchestrion/config',
    // Dependencies of this package, resolvable only from its location.
    '@apm-js-collab/code-transformer',
  ])('resolves %s to an existing absolute path', request => {
    const resolved = resolveOrchestrionRuntimeRequest(request);

    expect(resolved).toBeDefined();
    expect(isAbsolute(resolved!)).toBe(true);
    expect(existsSync(resolved!)).toBe(true);
  });

  it('resolves self-references with require conditions, so the paths are loadable via require()', () => {
    expect(resolveOrchestrionRuntimeRequest('@sentry/server-utils/orchestrion/config')).toMatch(/[/\\]cjs[/\\]/);
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

  it('injects the marker banner by default', () => {
    expect(orchestrionTransformOptions({}).injectDiagnostics).toBeTypeOf('function');
  });

  it('omits injectDiagnostics when opted out (Bun injects the banner natively instead)', () => {
    const opts = orchestrionTransformOptions({}, { injectDiagnostics: false });

    expect(opts.injectDiagnostics).toBeUndefined();
    // The other options still come through the shared assembly point.
    expect(typeof opts.customTransforms?.tracingChannelImport).toBe('function');
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

    it('marks the plugin as ran with an empty module set', () => {
      const global: Record<string, unknown> = {};

      runBanner(global);

      expect((global.__SENTRY_ORCHESTRION__ as { bundler?: Set<string> }).bundler).toEqual(new Set());
    });

    it('never clobbers module names an injected snippet already recorded', () => {
      const global: Record<string, unknown> = { __SENTRY_ORCHESTRION__: { bundler: new Set(['mysql']) } };

      runBanner(global);

      expect((global.__SENTRY_ORCHESTRION__ as { bundler?: Set<string> }).bundler).toEqual(new Set(['mysql']));
    });

    it('runs twice without resetting the recorded modules', () => {
      const global: Record<string, unknown> = {};

      runBanner(global);
      (global.__SENTRY_ORCHESTRION__ as { bundler: Set<string> }).bundler.add('mysql');
      runBanner(global);

      expect((global.__SENTRY_ORCHESTRION__ as { bundler?: Set<string> }).bundler).toEqual(new Set(['mysql']));
    });
  });
});
