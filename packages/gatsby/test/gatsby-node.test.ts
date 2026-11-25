import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { onCreateWebpackConfig } from '../gatsby-node';

vi.hoisted(
  () =>
    void mock('@sentry/bundler-plugins/webpack', {
      sentryWebpackPlugin: vi.fn().mockReturnValue({}),
    }),
);

// Need to override mock because `gatsby-node.js` loads `@sentry/bundler-plugins/webpack` as a CJS file.
async function mock(mockedUri: string, stub: any) {
  const { Module } = await import('module');

  // @ts-expect-error test
  Module._load_original = Module._load;
  // @ts-expect-error test
  Module._load = (uri, parent) => {
    if (uri === mockedUri) return stub;
    // @ts-expect-error test
    return Module._load_original(uri, parent);
  };
}

describe('onCreateWebpackConfig', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { sentryWebpackPlugin } = require('@sentry/bundler-plugins/webpack');
  let originalNodeEnv: string | undefined;

  beforeAll(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets a webpack config', () => {
    const actions = {
      setWebpackConfig: vi.fn(),
    };

    const getConfig = vi.fn().mockReturnValue({ devtool: 'source-map' });

    onCreateWebpackConfig({ actions, getConfig }, {});

    expect(actions.setWebpackConfig).toHaveBeenCalledTimes(1);
    expect(actions.setWebpackConfig).toHaveBeenLastCalledWith({ devtool: 'source-map', plugins: expect.any(Array) });
  });

  it('does not set a webpack config if enableClientWebpackPlugin is false', () => {
    const actions = {
      setWebpackConfig: vi.fn(),
    };

    const getConfig = vi.fn().mockReturnValue({ devtool: 'source-map' });

    onCreateWebpackConfig({ actions, getConfig }, { enableClientWebpackPlugin: false });

    expect(actions.setWebpackConfig).toHaveBeenCalledTimes(0);
  });

  describe('errorHandler', () => {
    function getErrorHandler(): (err: Error) => void {
      const actions = { setWebpackConfig: vi.fn() };
      const getConfig = vi.fn().mockReturnValue({ devtool: 'source-map' });

      onCreateWebpackConfig({ actions, getConfig }, {});

      const pluginOptions = sentryWebpackPlugin.mock.calls[0][0];
      return pluginOptions.errorHandler;
    }

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('accepts a single error argument (bundler-plugin-core v5 API)', () => {
      const errorHandler = getErrorHandler();
      expect(() => errorHandler(new Error('some error'))).toThrow('some error');
    });

    it('does not throw for missing organization slug', () => {
      const errorHandler = getErrorHandler();
      expect(() => errorHandler(new Error('Organization slug is required'))).not.toThrow();
    });

    it('does not throw for missing project slug', () => {
      const errorHandler = getErrorHandler();
      expect(() => errorHandler(new Error('Project slug is required'))).not.toThrow();
    });

    it('does not throw for missing auth token', () => {
      const errorHandler = getErrorHandler();
      expect(() => errorHandler(new Error('Authentication credentials were not provided'))).not.toThrow();
    });

    it('re-throws unknown errors', () => {
      const errorHandler = getErrorHandler();
      expect(() => errorHandler(new Error('Something unexpected'))).toThrow('Something unexpected');
    });
  });

  describe('source maps', () => {
    beforeEach(() => {
      vi.stubEnv('SENTRY_AUTH_TOKEN', 'token');
      vi.stubEnv('SENTRY_ORG', 'org');
      vi.stubEnv('SENTRY_PROJECT', 'project');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each([
      [{}, undefined],
      [{ sourcemaps: { delete: false } }, 'hidden-source-map'],
    ])('without upload credentials, with the options %j it sets devtool %s', (options, devtool) => {
      vi.stubEnv('SENTRY_AUTH_TOKEN', '');
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const actions = { setWebpackConfig: vi.fn() };

      onCreateWebpackConfig({ actions, getConfig: () => ({}), stage: 'build-javascript' }, options);

      expect(actions.setWebpackConfig).toHaveBeenCalledWith(expect.objectContaining({ devtool }));
    });

    it.each([
      {
        name: 'build-javascript, devtool unset: enables hidden source maps and passes delete options',
        stage: 'build-javascript',
        initialConfig: undefined,
        options: {},
        expected: { devtool: 'hidden-source-map', deleteOptions: true },
      },
      {
        name: 'build-javascript, devtool false: enables hidden source maps and passes delete options',
        stage: 'build-javascript',
        initialConfig: { devtool: false },
        options: {},
        expected: { devtool: 'hidden-source-map', deleteOptions: true },
      },
      {
        name: 'build-javascript, devtool eval: enables hidden source maps and passes delete options',
        stage: 'build-javascript',
        initialConfig: { devtool: 'eval' },
        options: {},
        expected: { devtool: 'hidden-source-map', deleteOptions: true },
      },
      {
        name: 'build-javascript, source-map: keeps it and passes no delete options',
        stage: 'build-javascript',
        initialConfig: { devtool: 'source-map' },
        options: {},
        expected: { devtool: 'source-map', deleteOptions: undefined },
      },
      {
        name: 'build-javascript, hidden-source-map: keeps it and passes no delete options',
        stage: 'build-javascript',
        initialConfig: { devtool: 'hidden-source-map' },
        options: {},
        expected: { devtool: 'hidden-source-map', deleteOptions: undefined },
      },
      {
        name: 'build-javascript, devtool false, user false: enables hidden source maps and passes no delete options',
        stage: 'build-javascript',
        initialConfig: { devtool: false },
        options: { deleteSourcemapsAfterUpload: false },
        expected: { devtool: 'hidden-source-map', deleteOptions: undefined },
      },
      {
        name: 'build-javascript, source-map, user true: passes delete options',
        stage: 'build-javascript',
        initialConfig: { devtool: 'source-map' },
        options: { deleteSourcemapsAfterUpload: true },
        expected: { devtool: 'source-map', deleteOptions: true },
      },
      {
        name: 'build-javascript, hidden-source-map, user true: passes delete options',
        stage: 'build-javascript',
        initialConfig: { devtool: 'hidden-source-map' },
        options: { deleteSourcemapsAfterUpload: true },
        expected: { devtool: 'hidden-source-map', deleteOptions: true },
      },
      {
        name: 'build-javascript, source-map, user truthy value: passes delete options as true',
        stage: 'build-javascript',
        initialConfig: { devtool: 'source-map' },
        options: { deleteSourcemapsAfterUpload: 'true' },
        expected: { devtool: 'source-map', deleteOptions: true },
      },
      {
        name: 'build-javascript, hidden-source-map, user false: passes no delete options',
        stage: 'build-javascript',
        initialConfig: { devtool: 'hidden-source-map' },
        options: { deleteSourcemapsAfterUpload: false },
        expected: { devtool: 'hidden-source-map', deleteOptions: undefined },
      },
      {
        name: 'build-html, devtool false: enables hidden source maps and passes no delete options',
        stage: 'build-html',
        initialConfig: { devtool: false },
        options: {},
        expected: { devtool: 'hidden-source-map', deleteOptions: undefined },
      },
      {
        name: 'build-html, source-map, user true: passes no delete options',
        stage: 'build-html',
        initialConfig: { devtool: 'source-map' },
        options: { deleteSourcemapsAfterUpload: true },
        expected: { devtool: 'source-map', deleteOptions: undefined },
      },
    ])('$name', ({ stage, initialConfig, options, expected }) => {
      const actions = { setWebpackConfig: vi.fn() };
      const getConfig = vi.fn().mockReturnValue(initialConfig);

      onCreateWebpackConfig({ actions, getConfig, stage }, options);

      expect(actions.setWebpackConfig).toHaveBeenCalledTimes(1);
      expect(actions.setWebpackConfig).toHaveBeenCalledWith({
        devtool: expected.devtool,
        plugins: [expect.any(Object)],
      });
      expect(sentryWebpackPlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcemaps: {
            assets: ['./public/**'],
            sdkDeleteSourceMaps: expected.deleteOptions,
            ignore: ['polyfill-*', 'framework-*', 'webpack-runtime-*'],
          },
        }),
      );
    });

    // Each row: the stage, the `devtool` Gatsby hands over, the `sourcemaps` options, the `devtool`
    // of the final config, and whether the plugin removes every source map of the stage.
    it.each([
      ['build-javascript', undefined, { upload: false }, undefined, undefined],
      ['build-javascript', false, { injectDebugIds: false }, false, undefined],
      ['build-javascript', 'source-map', { upload: false }, 'source-map', undefined],
      ['build-javascript', undefined, { upload: false, delete: false }, 'hidden-source-map', undefined],
      ['build-javascript', undefined, { injectDebugIds: false, delete: false }, undefined, undefined],
      ['build-javascript', 'source-map', { upload: false, delete: true }, 'source-map', true],
      ['build-javascript', undefined, { delete: false }, 'hidden-source-map', undefined],
      ['build-javascript', 'source-map', { delete: true }, 'source-map', true],
      ['build-javascript', undefined, { delete: true }, 'hidden-source-map', true],
      ['build-html', 'source-map', { delete: true }, 'source-map', undefined],
    ] as const)(
      '%s, devtool %s, `sourcemaps: %j`: sets devtool %s',
      (stage, devtool, sourcemaps, expectedDevtool, deletes) => {
        const actions = { setWebpackConfig: vi.fn() };
        const getConfig = vi.fn().mockReturnValue(devtool === undefined ? undefined : { devtool });

        onCreateWebpackConfig({ actions, getConfig, stage }, { sourcemaps });

        expect(actions.setWebpackConfig).toHaveBeenCalledWith({
          devtool: expectedDevtool,
          plugins: [expect.any(Object)],
        });
        expect(sentryWebpackPlugin).toHaveBeenCalledWith(
          expect.objectContaining({
            sourcemaps: {
              assets: ['./public/**'],
              upload: 'upload' in sourcemaps ? sourcemaps.upload : undefined,
              injectDebugIds: 'injectDebugIds' in sourcemaps ? sourcemaps.injectDebugIds : undefined,
              sdkDeleteSourceMaps: deletes,
              ignore: ['polyfill-*', 'framework-*', 'webpack-runtime-*'],
            },
          }),
        );
      },
    );

    it.each([
      ['build-javascript', {}, 'will be deleted after they were uploaded'],
      ['build-html', {}, 'stay in the build output'],
      ['build-javascript', { delete: false }, 'stay in the build output'],
    ] as const)('logs for stage %s and `sourcemaps: %j` that the maps %s', (stage, sourcemaps, message) => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const actions = { setWebpackConfig: vi.fn() };

      onCreateWebpackConfig({ actions, getConfig: vi.fn().mockReturnValue(undefined), stage }, { sourcemaps });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(message));
      logSpy.mockRestore();
    });

    it('warns once when `sourcemaps.delete` and the flat option are both set', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const getConfig = vi.fn().mockReturnValue({ devtool: 'source-map' });
      const options = { deleteSourcemapsAfterUpload: true, sourcemaps: { delete: false } };

      for (const stage of ['build-javascript', 'build-html']) {
        onCreateWebpackConfig({ actions: { setWebpackConfig: vi.fn() }, getConfig, stage }, options);
      }

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('`deleteSourcemapsAfterUpload` is ignored because `sourcemaps.delete` is set'),
      );
      warnSpy.mockRestore();
    });

    it.each([
      [{ delete: false }, { deleteSourcemapsAfterUpload: true }, undefined],
      [{ delete: true }, { deleteSourcemapsAfterUpload: false }, true],
    ])('lets `sourcemaps: %j` win over the flat option %j', (sourcemaps, flatOptions, deletes) => {
      const actions = { setWebpackConfig: vi.fn() };
      const getConfig = vi.fn().mockReturnValue({ devtool: 'source-map' });

      onCreateWebpackConfig({ actions, getConfig, stage: 'build-javascript' }, { ...flatOptions, sourcemaps });

      expect(sentryWebpackPlugin).toHaveBeenCalledWith(
        expect.objectContaining({ sourcemaps: expect.objectContaining({ sdkDeleteSourceMaps: deletes }) }),
      );
    });
  });
});
