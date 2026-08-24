import type * as FsModule from 'fs';
import type { AstroConfig, AstroIntegrationLogger } from 'astro';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _getUpdatedSourceMapSettings, sentryAstro } from '../../src/integration';
import type { SentryOptions } from '../../src/integration/types';

const sentryVitePluginSpy = vi.fn(() => 'sentryVitePlugin');

vi.mock('@sentry/bundler-plugins/vite', () => ({
  // @ts-expect-error - just mocking around
  sentryVitePlugin: vi.fn(args => sentryVitePluginSpy(args)),
}));

// Stub the orchestrion plugin so these stay pure wiring tests (no apm code transformer pulled in).
// Mirror the real plugin's contract: `buildTimeInstrumentation: false` yields the inert variant.
const orchestrionVite = vi.fn((options?: { buildTimeInstrumentation?: boolean }) => ({
  name: options?.buildTimeInstrumentation === false ? 'sentry-orchestrion-disabled' : 'sentry-orchestrion-vite',
}));
vi.mock('@sentry/server-utils/orchestrion/vite', () => ({
  sentryOrchestrionPlugin: (options?: { buildTimeInstrumentation?: boolean }) => orchestrionVite(options),
}));

// The cloudflare adapter path resolves `@sentry/cloudflare` via `createRequire` and calls
// `process.exit(1)` when it's missing. Stub the resolver so it always "finds" the package,
// keeping these tests hermetic regardless of what's installed in `node_modules`.
vi.mock('module', async requireActual => {
  const actual = await requireActual<any>();
  return {
    ...actual,
    createRequire: () => ({ resolve: () => '@sentry/cloudflare' }),
  };
});

// `isCloudflarePages()` probes for a wrangler config with `pages_build_output_dir`. By default no
// such file exists (Workers); the Pages test flips `wranglerPagesConfig` to a Pages config.
let wranglerPagesConfig: string | undefined;
vi.mock('fs', async requireActual => {
  const actual = await requireActual<typeof FsModule>();
  return {
    ...actual,
    existsSync: (p: unknown) =>
      wranglerPagesConfig !== undefined && String(p).endsWith('wrangler.jsonc') ? true : actual.existsSync(p as string),
    readFileSync: (p: unknown, ...rest: unknown[]) =>
      wranglerPagesConfig !== undefined && String(p).endsWith('wrangler.jsonc')
        ? wranglerPagesConfig
        : (actual.readFileSync as (...args: unknown[]) => string)(p, ...rest),
  };
});

process.env = {
  ...process.env,
  SENTRY_AUTH_TOKEN: 'my-token',
};

const updateConfig = vi.fn();
const injectScript = vi.fn();
const config = {
  root: new URL('file://path/to/project'),
  outDir: new URL('file://path/to/project/out'),
} as AstroConfig;

const baseConfigHookObject = {
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  addMiddleware: vi.fn(),
};

describe('sentryAstro integration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('has a name', () => {
    const integration = sentryAstro({});
    expect(integration.name).toBe('@sentry/astro');
  });

  it('enables "hidden" source maps, adds filesToDeleteAfterUpload and adds the sentry vite plugin if an auth token is detected', async () => {
    const integration = sentryAstro({
      sourceMapsUploadOptions: { enabled: true, org: 'my-org', project: 'my-project', telemetry: false },
    });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    // one call for the sourcemaps vite plugin, one for the orchestrion plugin
    expect(updateConfig).toHaveBeenCalledTimes(2);
    expect(updateConfig).toHaveBeenCalledWith({
      vite: {
        build: {
          sourcemap: 'hidden',
        },
        plugins: ['sentryVitePlugin'],
      },
    });
    expect(updateConfig).toHaveBeenCalledWith({
      vite: {
        plugins: [{ name: 'sentry-orchestrion-vite' }],
      },
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(1);
    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: 'my-token',
        org: 'my-org',
        project: 'my-project',
        telemetry: false,
        debug: false,
        bundleSizeOptimizations: {},
        sourcemaps: {
          assets: ['out/**/*'],
          filesToDeleteAfterUpload: ['./dist/**/client/**/*.map', './dist/**/server/**/*.map'],
        },
        _metaOptions: {
          telemetry: {
            metaFramework: 'astro',
          },
        },
      }),
    );
  });

  it('falls back to default output dir, if out and root dir are not available', async () => {
    const integration = sentryAstro({
      sourceMapsUploadOptions: { enabled: true, org: 'my-org', project: 'my-project', telemetry: false },
    });
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config: {} });

    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(1);
    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: 'my-token',
        org: 'my-org',
        project: 'my-project',
        telemetry: false,
        debug: false,
        bundleSizeOptimizations: {},
        sourcemaps: {
          assets: ['dist/**/*'],
          filesToDeleteAfterUpload: ['./dist/**/client/**/*.map', './dist/**/server/**/*.map'],
        },
        _metaOptions: {
          telemetry: {
            metaFramework: 'astro',
          },
        },
      }),
    );
  });

  it('sets the correct assets glob for vercel if the Vercel adapter is used', async () => {
    const integration = sentryAstro({
      sourceMapsUploadOptions: { enabled: true, org: 'my-org', project: 'my-project', telemetry: false },
    });
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({
      ...baseConfigHookObject,
      updateConfig,
      injectScript,
      config: {
        // @ts-expect-error - we only need to pass what we actually use
        adapter: { name: '@astrojs/vercel/serverless' },
      },
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(1);
    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: 'my-token',
        org: 'my-org',
        project: 'my-project',
        telemetry: false,
        debug: false,
        bundleSizeOptimizations: {},
        sourcemaps: {
          assets: ['{.vercel,dist}/**/*'],
          filesToDeleteAfterUpload: ['./dist/**/client/**/*.map', './dist/**/server/**/*.map'],
        },
        _metaOptions: {
          telemetry: {
            metaFramework: 'astro',
          },
        },
      }),
    );
  });

  it('prefers user-specified assets-globs over the default values', async () => {
    const integration = sentryAstro({
      sourceMapsUploadOptions: {
        enabled: true,
        org: 'my-org',
        project: 'my-project',
        assets: ['dist/server/**/*, dist/client/**/*'],
      },
    });
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({
      ...baseConfigHookObject,
      updateConfig,
      injectScript,
      // @ts-expect-error - only passing in partial config
      config: {
        outDir: new URL('file://path/to/project/build'),
      },
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(1);
    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: 'my-token',
        org: 'my-org',
        project: 'my-project',
        telemetry: true,
        debug: false,
        bundleSizeOptimizations: {},
        sourcemaps: {
          assets: ['dist/server/**/*, dist/client/**/*'],
          filesToDeleteAfterUpload: ['./dist/**/client/**/*.map', './dist/**/server/**/*.map'],
        },
        _metaOptions: {
          telemetry: {
            metaFramework: 'astro',
          },
        },
      }),
    );
  });

  it('prefers user-specified filesToDeleteAfterUpload over the default values', async () => {
    const integration = sentryAstro({
      sourceMapsUploadOptions: {
        enabled: true,
        org: 'my-org',
        project: 'my-project',
        filesToDeleteAfterUpload: ['./custom/path/**/*'],
      },
    });
    // @ts-expect-error - the hook exists, and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({
      ...baseConfigHookObject,
      updateConfig,
      injectScript,
      // @ts-expect-error - only passing in partial config
      config: {
        outDir: new URL('file://path/to/project/build'),
      },
    });

    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(1);
    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({
          filesToDeleteAfterUpload: ['./custom/path/**/*'],
        }),
      }),
    );
  });

  // No `@ts-expect-error` here on purpose: `SentryOptions` intersects `Record<string, unknown>`, so
  // TypeScript accepts any key and this runtime warning is the only signal an Astro user ever gets.
  it('warns for the removed option nested inside `sourceMapsUploadOptions`', async () => {
    const integration = sentryAstro({
      // @ts-expect-error - removed in v11
      sourceMapsUploadOptions: { unstable_sentryVitePluginOptions: { org: 'my-other-org' } },
    });
    // @ts-expect-error - the hook exists, and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    expect(baseConfigHookObject.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unstable_sentryVitePluginOptions'),
    );
  });

  it('forwards moduleMetadata to the vite plugin', async () => {
    const integration = sentryAstro({ moduleMetadata: { team: 'sdk' } });
    // @ts-expect-error - the hook exists, and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(expect.objectContaining({ moduleMetadata: { team: 'sdk' } }));
  });

  // TypeScript rejects the key (see `buildOptions.test-d.ts`); this covers JS configs, which get no
  // type checking.
  it('warns via the Astro logger when the removed `unstable_sentryVitePluginOptions` is still set', async () => {
    const integration = sentryAstro({
      // @ts-expect-error - removed in v11
      unstable_sentryVitePluginOptions: { org: 'my-other-org' },
    });
    // @ts-expect-error - the hook exists, and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    expect(baseConfigHookObject.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unstable_sentryVitePluginOptions'),
    );
  });

  it('passes top-level applicationKey to the vite plugin', async () => {
    const integration = sentryAstro({
      applicationKey: 'my-app-key',
      sourceMapsUploadOptions: { enabled: true, org: 'my-org', project: 'my-project' },
    });
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationKey: 'my-app-key',
      }),
    );
  });

  it("doesn't enable source maps if `sourceMapsUploadOptions.enabled` is `false`", async () => {
    const integration = sentryAstro({
      sourceMapsUploadOptions: { enabled: false },
    });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    // only the orchestrion plugin is wired, no sourcemaps plugin
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith({
      vite: {
        plugins: [{ name: 'sentry-orchestrion-vite' }],
      },
    });
    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(0);
  });

  it("doesn't enable source maps if `sourcemaps.disable` is `true`", async () => {
    const integration = sentryAstro({
      sourcemaps: { disable: true },
    });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    // only the orchestrion plugin is wired, no sourcemaps plugin
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith({
      vite: {
        plugins: [{ name: 'sentry-orchestrion-vite' }],
      },
    });
    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(0);
  });

  it('enables source maps if `sourcemaps.disable` is not defined', async () => {
    const integration = sentryAstro({});

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    // one call for the sourcemaps vite plugin, one for the orchestrion plugin
    expect(updateConfig).toHaveBeenCalledTimes(2);
    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(1);
  });

  it("doesn't add the sourcemaps Vite plugin in dev mode", async () => {
    const integration = sentryAstro({
      sourceMapsUploadOptions: { enabled: true },
    });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({
      ...baseConfigHookObject,
      updateConfig,
      injectScript,
      config,
      command: 'dev',
    });

    // the sourcemaps plugin is skipped in dev, but the orchestrion plugin is still wired
    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith({
      vite: {
        plugins: [{ name: 'sentry-orchestrion-vite' }],
      },
    });
    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(0);
  });

  it("doesn't add the plugin or enable source maps if the SDK is disabled", async () => {
    const integration = sentryAstro({
      enabled: false,
    });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    // neither the sourcemaps nor the orchestrion plugin should be wired
    expect(updateConfig).toHaveBeenCalledTimes(0);
    expect(orchestrionVite).not.toHaveBeenCalled();
    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(0);
  });

  it('adds the orchestrion plugin by default', async () => {
    const integration = sentryAstro({});

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    expect(orchestrionVite).toHaveBeenCalledWith({ buildTimeInstrumentation: undefined });
    expect(updateConfig).toHaveBeenCalledWith({
      vite: {
        plugins: [{ name: 'sentry-orchestrion-vite' }],
      },
    });
  });

  it('adds an inert orchestrion plugin when `buildTimeInstrumentation` is `false`', async () => {
    const integration = sentryAstro({ buildTimeInstrumentation: false });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    expect(orchestrionVite).toHaveBeenCalledWith({ buildTimeInstrumentation: false });
    expect(updateConfig).toHaveBeenCalledWith({
      vite: {
        plugins: [{ name: 'sentry-orchestrion-disabled' }],
      },
    });
  });

  it('adds the orchestrion plugin for the cloudflare workers adapter', async () => {
    const integration = sentryAstro({});

    const cloudflareConfig = { ...config, adapter: { name: '@astrojs/cloudflare' } } as AstroConfig;

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({
      ...baseConfigHookObject,
      updateConfig,
      injectScript,
      config: cloudflareConfig,
    });

    // No wrangler config with `pages_build_output_dir` is present, so this resolves as Workers.
    expect(orchestrionVite).toHaveBeenCalledWith({ buildTimeInstrumentation: undefined });
    expect(updateConfig).toHaveBeenCalledWith({
      vite: {
        plugins: [{ name: 'sentry-orchestrion-vite' }],
      },
    });
  });

  it("doesn't add the orchestrion plugin for the cloudflare pages adapter", async () => {
    // Simulate a Pages project: a wrangler config containing `pages_build_output_dir`.
    wranglerPagesConfig = '{ "pages_build_output_dir": "./dist" }';

    try {
      const integration = sentryAstro({});
      const cloudflareConfig = { ...config, adapter: { name: '@astrojs/cloudflare' } } as AstroConfig;

      expect(integration.hooks['astro:config:setup']).toBeDefined();
      // @ts-expect-error - the hook exists and we only need to pass what we actually use
      await integration.hooks['astro:config:setup']({
        ...baseConfigHookObject,
        updateConfig,
        injectScript,
        config: cloudflareConfig,
      });

      // Pages has no `withSentry` wrap to read the marker, so orchestrion stays off there.
      expect(orchestrionVite).not.toHaveBeenCalled();
      expect(updateConfig).not.toHaveBeenCalledWith({
        vite: {
          plugins: [{ name: 'sentry-orchestrion-vite' }],
        },
      });
    } finally {
      wranglerPagesConfig = undefined;
    }
  });

  it("doesn't warn about deprecated options when `buildTimeInstrumentation` is set", async () => {
    const integration = sentryAstro({ buildTimeInstrumentation: false });

    const logger = { warn: vi.fn(), info: vi.fn() };

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ updateConfig, injectScript, config, logger });

    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('buildTimeInstrumentation'));
  });

  it.each([{}, { enabled: true }])('injects client and server init scripts', async options => {
    const integration = sentryAstro(options);

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ updateConfig, injectScript, config });

    expect(injectScript).toHaveBeenCalledTimes(2);
    expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('Sentry.init'));
    expect(injectScript).toHaveBeenCalledWith('page-ssr', expect.stringContaining('Sentry.init'));
  });

  it('passes build-time release options to the Sentry vite plugin and init snippets', async () => {
    const integration = sentryAstro({
      project: 'my-project',
      release: { name: '1.0.0' },
      debug: true,
    });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    expect(sentryVitePluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        release: { name: '1.0.0' },
        debug: true,
      }),
    );

    expect(injectScript).toHaveBeenCalledTimes(2);
    expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('Sentry.init'));
    expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('release: "1.0.0"'));
    expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('debug: true'));
    expect(injectScript).toHaveBeenCalledWith(
      'page',
      expect.stringContaining('dsn: import.meta.env.PUBLIC_SENTRY_DSN'),
    );
    expect(injectScript).toHaveBeenCalledWith('page-ssr', expect.stringContaining('release: "1.0.0"'));
  });

  it("doesn't inject client init script if `enabled.client` is `false`", async () => {
    const integration = sentryAstro({ enabled: { client: false } });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ updateConfig, injectScript, config });

    expect(injectScript).toHaveBeenCalledTimes(1);
    expect(injectScript).toHaveBeenCalledWith('page-ssr', expect.stringContaining('Sentry.init'));
  });

  it("doesn't inject server init script if `enabled.server` is `false`", async () => {
    const integration = sentryAstro({ enabled: { server: false } });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ updateConfig, injectScript, config });

    expect(injectScript).toHaveBeenCalledTimes(1);
    expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('Sentry.init'));
  });

  it.each([false, { client: false, server: false }])(
    "doesn't inject any init script if `enabled` is generally false (`%s`)",
    async enabled => {
      const integration = sentryAstro({ enabled });

      expect(integration.hooks['astro:config:setup']).toBeDefined();
      // @ts-expect-error - the hook exists and we only need to pass what we actually use
      await integration.hooks['astro:config:setup']({ updateConfig, injectScript, config });

      expect(injectScript).toHaveBeenCalledTimes(0);
    },
  );

  it('injects client and server init scripts from custom paths', async () => {
    const integration = sentryAstro({
      clientInitPath: 'my-client-init-path.js',
      serverInitPath: 'my-server-init-path.js',
    });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ updateConfig, injectScript, config });

    expect(injectScript).toHaveBeenCalledTimes(2);
    expect(injectScript).toHaveBeenCalledWith('page', expect.stringMatching(/^import ".*\/my-client-init-path.js"/));
    expect(injectScript).toHaveBeenCalledWith(
      'page-ssr',
      expect.stringMatching(/^import ".*\/my-server-init-path.js"/),
    );
  });

  it.each(['server', 'hybrid'])('adds middleware by default if in %s mode', async mode => {
    const integration = sentryAstro({});
    const addMiddleware = vi.fn();
    const updateConfig = vi.fn();
    const injectScript = vi.fn();

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({
      // @ts-expect-error - we only need to pass what we actually use
      config: { output: mode },
      addMiddleware,
      updateConfig,
      injectScript,
    });

    expect(addMiddleware).toHaveBeenCalledTimes(1);
    expect(addMiddleware).toHaveBeenCalledWith({
      order: 'pre',
      entrypoint: '@sentry/astro/middleware',
    });
  });

  it.each([{ output: 'static' }, { output: undefined }])(
    "doesn't add middleware if in static mode (config %s)",
    async (config: any) => {
      const integration = sentryAstro({});
      const addMiddleware = vi.fn();
      const updateConfig = vi.fn();
      const injectScript = vi.fn();

      expect(integration.hooks['astro:config:setup']).toBeDefined();
      // @ts-expect-error - the hook exists and we only need to pass what we actually use
      await integration.hooks['astro:config:setup']({
        config,
        addMiddleware,
        updateConfig,
        injectScript,
      });

      expect(addMiddleware).toHaveBeenCalledTimes(0);
    },
  );

  it("doesn't add middleware if disabled by users", async () => {
    const integration = sentryAstro({ autoInstrumentation: { requestHandler: false } });
    const addMiddleware = vi.fn();
    const updateConfig = vi.fn();
    const injectScript = vi.fn();

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({
      // @ts-expect-error - we only need to pass what we actually use
      config: { output: 'server' },
      addMiddleware,
      updateConfig,
      injectScript,
    });

    expect(addMiddleware).toHaveBeenCalledTimes(0);
  });

  it("doesn't add middleware if the SDK is disabled", () => {
    const integration = sentryAstro({ enabled: false });
    const addMiddleware = vi.fn();
    const updateConfig = vi.fn();
    const injectScript = vi.fn();

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    integration.hooks['astro:config:setup']({
      // @ts-expect-error - we only need to pass what we actually use
      config: { output: 'server' },
      addMiddleware,
      updateConfig,
      injectScript,
    });

    expect(addMiddleware).toHaveBeenCalledTimes(0);
  });
});

describe('_getUpdatedSourceMapSettings', () => {
  let astroConfig: Omit<AstroConfig, 'vite'> & { vite: { build: { sourcemap?: any } } };
  let sentryOptions: SentryOptions;
  let logger: AstroIntegrationLogger;

  beforeEach(() => {
    astroConfig = { vite: { build: {} } } as Omit<AstroConfig, 'vite'> & { vite: { build: { sourcemap?: any } } };
    sentryOptions = {};
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as AstroIntegrationLogger;
  });

  it('should keep explicitly disabled source maps disabled', () => {
    astroConfig.vite.build.sourcemap = false;
    const result = _getUpdatedSourceMapSettings(astroConfig, sentryOptions, logger);
    expect(result.previousUserSourceMapSetting).toBe('disabled');
    expect(result.updatedSourceMapSetting).toBe(false);
  });

  it('should keep explicitly enabled source maps enabled', () => {
    const cases = [
      { sourcemap: true, expected: true },
      { sourcemap: 'hidden', expected: 'hidden' },
      { sourcemap: 'inline', expected: 'inline' },
    ];

    cases.forEach(({ sourcemap, expected }) => {
      astroConfig.vite.build.sourcemap = sourcemap;
      const result = _getUpdatedSourceMapSettings(astroConfig, sentryOptions, logger);
      expect(result.previousUserSourceMapSetting).toBe('enabled');
      expect(result.updatedSourceMapSetting).toBe(expected);
    });
  });

  it('should enable "hidden" source maps when unset', () => {
    astroConfig.vite.build.sourcemap = undefined;
    const result = _getUpdatedSourceMapSettings(astroConfig, sentryOptions, logger);
    expect(result.previousUserSourceMapSetting).toBe('unset');
    expect(result.updatedSourceMapSetting).toBe('hidden');
  });

  it('should log warnings and messages when debug is enabled', () => {
    sentryOptions = { debug: true };

    astroConfig.vite.build.sourcemap = false;
    _getUpdatedSourceMapSettings(astroConfig, sentryOptions, logger);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Source map generation is currently disabled'));
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('This setting is either a default setting or was explicitly set in your configuration.'),
    );

    astroConfig.vite.build.sourcemap = 'hidden';
    _getUpdatedSourceMapSettings(astroConfig, sentryOptions, logger);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Sentry will keep this source map setting'));
  });

  it('should show short warnings debug is disabled', () => {
    sentryOptions = { debug: false };

    astroConfig.vite.build.sourcemap = false;
    _getUpdatedSourceMapSettings(astroConfig, sentryOptions, logger);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(logger.warn).toHaveBeenCalledWith('Source map generation is disabled in your Astro configuration.');

    astroConfig.vite.build.sourcemap = 'hidden';
    _getUpdatedSourceMapSettings(astroConfig, sentryOptions, logger);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(logger.info).not.toHaveBeenCalled();
  });
});
