import type { ConfigEnv, UserConfig } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import sentryRemixVitePluginDefault, { sentryRemixVitePlugin } from '../../src/vite';

// Stub the orchestrion plugin so these stay pure wiring tests (no apm code transformer pulled in),
// mirroring the real plugin's two shapes.
const orchestrionConfig = vi.fn((_config: UserConfig, env: ConfigEnv) =>
  env.command === 'serve' ? null : { ssr: { noExternal: ['mysql'] } },
);
const orchestrionConfigResolved = vi.fn();
const orchestrionTransform = vi.fn(() => ({ code: 'transformed' }));

const orchestrionVite = vi.fn((options?: { buildTimeInstrumentation?: boolean }) =>
  options?.buildTimeInstrumentation === false
    ? { name: 'sentry-orchestrion-disabled' }
    : {
        name: 'code-transformer',
        enforce: 'pre',
        config: orchestrionConfig,
        configResolved: orchestrionConfigResolved,
        transform: orchestrionTransform,
      },
);

vi.mock('@sentry/server-utils/orchestrion/vite', () => ({
  sentryOrchestrionPlugin: (options?: { buildTimeInstrumentation?: boolean }) => orchestrionVite(options),
}));

type CapturedSentryOptions = {
  applicationKey?: string;
  bundleSizeOptimizations?: { excludeTracing?: boolean };
  sourcemaps?: { filesToDeleteAfterUpload?: Promise<unknown> };
};

let capturedSentryOptions: CapturedSentryOptions | undefined;

vi.mock('@sentry/bundler-plugins/vite', () => ({
  sentryVitePlugin: (options: CapturedSentryOptions) => {
    capturedSentryOptions = options;
    return [{ name: 'sentry-vite-plugin' }];
  },
}));

const SOURCE_MAP_PLUGINS = [
  'sentry-remix-files-to-delete-after-upload',
  'sentry-vite-plugin',
  'sentry-remix-update-source-map-setting',
];

const NODE_CONFIG = { ssr: { target: 'node' } } as UserConfig;
const WORKER_CONFIG = { ssr: { target: 'webworker' } } as UserConfig;
// Remix's own Vite plugin never sets `ssr.target`, so a Cloudflare app is only recognizable by its
// workerd resolve conditions: `cloudflareDevProxyVitePlugin` contributes `externalConditions`, the
// Cloudflare template sets `conditions` in the user's own config.
const WORKER_CONFIGS: Array<[string, UserConfig]> = [
  ['ssr.target', WORKER_CONFIG],
  ['ssr.resolve.conditions', { ssr: { resolve: { conditions: ['workerd', 'worker', 'browser'] } } } as UserConfig],
  ['ssr.resolve.externalConditions', { ssr: { resolve: { externalConditions: ['workerd', 'worker'] } } } as UserConfig],
];
const BUILD_ENV = { command: 'build', mode: 'production' } as ConfigEnv;
const SERVE_ENV = { command: 'serve', mode: 'development' } as ConfigEnv;

/** Calls a hook declared in either the bare-function or the `{ handler }` form. */
function callHook(hook: unknown, ...args: unknown[]): unknown {
  const handler = typeof hook === 'function' ? hook : (hook as { handler: (...a: unknown[]) => unknown }).handler;
  return (handler as (...a: unknown[]) => unknown)(...args);
}

describe('sentryRemixVitePlugin', () => {
  it('is the default export of the vite entry point', () => {
    expect(sentryRemixVitePluginDefault).toBe(sentryRemixVitePlugin);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    capturedSentryOptions = undefined;
  });

  // Vite hands every `config` hook the already-merged config, so the deletion plugin has to read
  // `build.sourcemap` before `makeEnableSourceMapsPlugin` sets it. Running the hooks in isolation
  // hides that, which is why this drives them in plugin order over one shared config.
  it('still deletes the generated source maps once the hooks run in plugin order', async () => {
    const plugins = sentryRemixVitePlugin();
    const config: UserConfig = {};

    for (const plugin of plugins) {
      if (!plugin.config) {
        continue;
      }

      const result = callHook(plugin.config, config, BUILD_ENV) as UserConfig | null;
      const sourcemap = result?.build?.sourcemap;

      if (sourcemap !== undefined) {
        config.build = { ...config.build, sourcemap };
      }
    }

    await expect(capturedSentryOptions?.sourcemaps?.filesToDeleteAfterUpload).resolves.toEqual(['./build/**/*.map']);
  });

  it('returns the route manifest, orchestrion and source map plugins', () => {
    const plugins = sentryRemixVitePlugin();

    expect(plugins.map(plugin => plugin.name)).toEqual([
      'sentry-remix-route-manifest',
      'code-transformer',
      ...SOURCE_MAP_PLUGINS,
    ]);
    expect(orchestrionVite).toHaveBeenCalledWith({ buildTimeInstrumentation: undefined });
  });

  // Uploading from the dev server would upload a new set of artifacts on every restart.
  it('leaves out the source map plugins in development', () => {
    vi.stubEnv('NODE_ENV', 'development');

    const plugins = sentryRemixVitePlugin();

    expect(plugins.map(plugin => plugin.name)).toEqual(['sentry-remix-route-manifest', 'code-transformer']);
  });

  // Disabling source maps must not drop the bundler plugin: it also applies bundle size
  // optimizations, module metadata, the application key and release management, and it skips the
  // upload on its own.
  it('only drops the source map setting plugin when source maps are disabled', () => {
    const plugins = sentryRemixVitePlugin({ sourcemaps: { disable: true } });

    expect(plugins.map(plugin => plugin.name)).toEqual([
      'sentry-remix-route-manifest',
      'code-transformer',
      'sentry-remix-files-to-delete-after-upload',
      'sentry-vite-plugin',
    ]);
  });

  it('forwards the non-source-map options when source maps are disabled', () => {
    sentryRemixVitePlugin({
      sourcemaps: { disable: true },
      applicationKey: 'my-app-key',
      bundleSizeOptimizations: { excludeTracing: true },
    });

    expect(capturedSentryOptions?.applicationKey).toBe('my-app-key');
    expect(capturedSentryOptions?.bundleSizeOptimizations).toEqual({ excludeTracing: true });
  });

  it('adds an inert orchestrion plugin when `buildTimeInstrumentation` is `false`', () => {
    const plugins = sentryRemixVitePlugin({ buildTimeInstrumentation: false });

    expect(orchestrionVite).toHaveBeenCalledWith({ buildTimeInstrumentation: false });
    expect(plugins.map(plugin => plugin.name)).toContain('sentry-orchestrion-disabled');
  });

  // Turning off the build-time transform says nothing about source maps.
  it('keeps the source map plugins when `buildTimeInstrumentation` is `false`', () => {
    const plugins = sentryRemixVitePlugin({ buildTimeInstrumentation: false });

    expect(plugins.map(plugin => plugin.name)).toEqual(expect.arrayContaining(SOURCE_MAP_PLUGINS));
  });

  it('keeps the upstream `enforce: "pre"` but defers its `config` hook to the end', () => {
    const orchestrion = sentryRemixVitePlugin()[1] as { enforce?: string; config?: { order?: string } };

    expect(orchestrion.enforce).toBe('pre');
    expect(orchestrion.config?.order).toBe('post');
  });

  // The dev server keeps instrumented deps external and lets the runtime `--import` hook inject the
  // channels, which the orchestrion plugin decides from `env.command` — so the wrapper has to pass
  // it through untouched.
  it('forwards the config env so the plugin can opt out in the dev server', () => {
    const orchestrion = sentryRemixVitePlugin()[1]!;

    expect(callHook(orchestrion.config, NODE_CONFIG, SERVE_ENV)).toBeNull();
    expect(orchestrionConfig).toHaveBeenCalledWith(NODE_CONFIG, SERVE_ENV);
  });

  describe('worker targets', () => {
    it('applies the orchestrion hooks for node builds', () => {
      const orchestrion = sentryRemixVitePlugin()[1]!;

      expect(callHook(orchestrion.config, NODE_CONFIG, BUILD_ENV)).toEqual({ ssr: { noExternal: ['mysql'] } });

      callHook(orchestrion.configResolved, NODE_CONFIG);
      expect(orchestrionConfigResolved).toHaveBeenCalledTimes(1);

      expect(callHook(orchestrion.transform, 'code', 'mysql.js', { ssr: true })).toEqual({ code: 'transformed' });
    });

    it.each(WORKER_CONFIGS)('skips force-bundling and transforming when %s marks a worker', (_signal, config) => {
      const orchestrion = sentryRemixVitePlugin()[1]!;

      expect(callHook(orchestrion.config, config, BUILD_ENV)).toBeNull();
      expect(orchestrionConfig).not.toHaveBeenCalled();

      callHook(orchestrion.configResolved, config);
      expect(orchestrionConfigResolved).not.toHaveBeenCalled();

      expect(callHook(orchestrion.transform, 'code', 'mysql.js', { ssr: true })).toBeNull();
      expect(orchestrionTransform).not.toHaveBeenCalled();
    });

    // Framework plugins can set `ssr.target` after our `config` hook ran, so `configResolved` is
    // what actually has to keep the transform out of a worker bundle.
    it('skips the transform when the worker target only shows up in the resolved config', () => {
      const orchestrion = sentryRemixVitePlugin()[1]!;

      callHook(orchestrion.config, {} as UserConfig, BUILD_ENV);
      callHook(orchestrion.configResolved, WORKER_CONFIG);

      expect(callHook(orchestrion.transform, 'code', 'mysql.js', { ssr: true })).toBeNull();
      expect(orchestrionTransform).not.toHaveBeenCalled();
    });
  });
});
