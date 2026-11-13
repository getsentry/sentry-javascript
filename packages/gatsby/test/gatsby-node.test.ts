import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
            deleteSourcemapsAfterUpload: expected.deleteOptions,
            sdkEnabledSourceMaps: expected.deleteOptions,
            ignore: ['polyfill-*', 'framework-*', 'webpack-runtime-*'],
          },
        }),
      );
    });
  });
});
