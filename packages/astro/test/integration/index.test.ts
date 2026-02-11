import type { AstroConfig, AstroIntegrationLogger } from 'astro';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _getUpdatedSourceMapSettings, sentryAstro } from '../../src/integration';
import type { SentryOptions } from '../../src/integration/types';

const sentryVitePluginSpy = vi.fn(() => 'sentryVitePlugin');

vi.mock('@sentry/vite-plugin', () => ({
  // @ts-expect-error - just mocking around
  sentryVitePlugin: vi.fn(args => sentryVitePluginSpy(args)),
}));

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
  logger: { warn: vi.fn(), info: vi.fn() },
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

    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(updateConfig).toHaveBeenCalledWith({
      vite: {
        build: {
          sourcemap: 'hidden',
        },
        plugins: ['sentryVitePlugin'],
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

  it('prefers user-specified unstable vite plugin options and merges them with default values', async () => {
    const integration = sentryAstro({
      bundleSizeOptimizations: {
        excludeReplayShadowDom: true,
      },
      sourceMapsUploadOptions: {
        enabled: true,
        org: 'my-org',
        project: 'my-project',
        assets: ['dist/server/**/*, dist/client/**/*'],
        unstable_sentryVitePluginOptions: {
          org: 'my-other-org',
          project: 'my-other-project',
          applicationKey: 'my-application-key',
          sourcemaps: {
            assets: ['foo/*.js'],
            ignore: ['bar/*.js'],
          },
          bundleSizeOptimizations: {
            excludeReplayIframe: true,
          },
        },
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
        org: 'my-other-org',
        project: 'my-other-project',
        applicationKey: 'my-application-key',
        sourcemaps: {
          assets: ['foo/*.js'],
          ignore: ['bar/*.js'],
          filesToDeleteAfterUpload: ['./dist/**/client/**/*.map', './dist/**/server/**/*.map'],
        },
        bundleSizeOptimizations: {
          excludeReplayShadowDom: true,
          excludeReplayIframe: true,
        },
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

    expect(updateConfig).toHaveBeenCalledTimes(0);
    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(0);
  });

  it("doesn't enable source maps if `sourcemaps.disable` is `true`", async () => {
    const integration = sentryAstro({
      sourcemaps: { disable: true },
    });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    expect(updateConfig).toHaveBeenCalledTimes(0);
    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(0);
  });

  it('enables source maps if `sourcemaps.disable` is not defined', async () => {
    const integration = sentryAstro({});

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ ...baseConfigHookObject, updateConfig, injectScript, config });

    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(1);
  });

  it("doesn't add the Vite plugin in dev mode", async () => {
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

    expect(updateConfig).toHaveBeenCalledTimes(0);
    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(0);
  });

  it("doesn't add the plugin or enable source maps if the SDK is disabled", async () => {
    const integration = sentryAstro({
      enabled: false,
    });

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ updateConfig, injectScript, config });

    expect(updateConfig).toHaveBeenCalledTimes(0);
    expect(sentryVitePluginSpy).toHaveBeenCalledTimes(0);
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

  it('injects runtime config into client and server init scripts and warns about deprecation', async () => {
    const integration = sentryAstro({
      project: 'my-project',
      environment: 'test',
      release: '1.0.0',
      dsn: 'https://test.sentry.io/123',
      bundleSizeOptimizations: {},
      // this also warns when debug is not enabled
    });

    const logger = {
      warn: vi.fn(),
      info: vi.fn(),
    };

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({ updateConfig, injectScript, config, logger });

    expect(logger.warn).toHaveBeenCalledWith(
      'You passed in additional options (environment, release, dsn) to the Sentry integration. This is deprecated and will stop working in a future version. Instead, configure the Sentry SDK in your `sentry.client.config.(js|ts)` or `sentry.server.config.(js|ts)` files.',
    );

    expect(injectScript).toHaveBeenCalledTimes(2);
    expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('Sentry.init'));
    expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('dsn: "https://test.sentry.io/123"'));
    expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('release: "1.0.0"'));
    expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('environment: "test"'));
    expect(injectScript).toHaveBeenCalledWith('page-ssr', expect.stringContaining('Sentry.init'));
    expect(injectScript).toHaveBeenCalledWith('page-ssr', expect.stringContaining('dsn: "https://test.sentry.io/123"'));
    expect(injectScript).toHaveBeenCalledWith('page-ssr', expect.stringContaining('release: "1.0.0"'));
    expect(injectScript).toHaveBeenCalledWith('page-ssr', expect.stringContaining('environment: "test"'));
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

  it.each(['server', 'hybrid'])(
    'adds middleware by default if in %s mode and `addMiddleware` is available',
    async mode => {
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
    },
  );

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

  it("doesn't add middleware (i.e. crash) if `addMiddleware` is N/A", async () => {
    const integration = sentryAstro({ autoInstrumentation: { requestHandler: false } });
    const updateConfig = vi.fn();
    const injectScript = vi.fn();

    expect(integration.hooks['astro:config:setup']).toBeDefined();
    // @ts-expect-error - the hook exists and we only need to pass what we actually use
    await integration.hooks['astro:config:setup']({
      // @ts-expect-error - we only need to pass what we actually use
      config: { output: 'server' },
      updateConfig,
      injectScript,
    });

    expect(updateConfig).toHaveBeenCalledTimes(1);
    expect(injectScript).toHaveBeenCalledTimes(2);
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
