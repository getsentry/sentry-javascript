import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { onCreateWebpackConfig } from '../gatsby-node';

vi.hoisted(
  () =>
    void mock('@sentry/webpack-plugin', {
      sentryWebpackPlugin: vi.fn().mockReturnValue({}),
    }),
);

// Need to override mock because `gatsby-node.js` loads `@sentry/webpack-plugin` as a CJS file.
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
  const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');
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

  describe('delete source maps after upload', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    const actions = {
      setWebpackConfig: vi.fn(),
    };

    const getConfig = vi.fn();

    it('sets sourceMapFilesToDeleteAfterUpload when provided in options', () => {
      const actions = {
        setWebpackConfig: vi.fn(),
      };

      const getConfig = vi.fn().mockReturnValue({ devtool: 'source-map' });

      onCreateWebpackConfig({ actions, getConfig }, { deleteSourcemapsAfterUpload: true });

      expect(actions.setWebpackConfig).toHaveBeenCalledTimes(1);

      expect(sentryWebpackPlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcemaps: expect.objectContaining({
            filesToDeleteAfterUpload: ['./public/**/*.map'],
          }),
        }),
      );
    });

    it.each([
      {
        name: 'without provided options: sets hidden source maps and deletes source maps',
        initialConfig: undefined,
        options: {},
        expected: {
          devtool: 'hidden-source-map',
          deleteSourceMaps: true,
        },
      },
      {
        name: "preserves enabled source-map and doesn't delete",
        initialConfig: { devtool: 'source-map' },
        options: {},
        expected: {
          devtool: 'source-map',
          deleteSourceMaps: false,
        },
      },
      {
        name: "preserves enabled hidden-source-map and doesn't delete",
        initialConfig: { devtool: 'hidden-source-map' },
        options: {},
        expected: {
          devtool: 'hidden-source-map',
          deleteSourceMaps: false,
        },
      },
      {
        name: 'deletes source maps, when user explicitly sets it',
        initialConfig: { devtool: 'eval' },
        options: {},
        expected: {
          devtool: 'hidden-source-map',
          deleteSourceMaps: true,
        },
      },
      {
        name: 'explicit deleteSourcemapsAfterUpload true',
        initialConfig: { devtool: 'source-map' },
        options: { deleteSourcemapsAfterUpload: true },
        expected: {
          devtool: 'source-map',
          deleteSourceMaps: true,
        },
      },
      {
        name: 'explicit deleteSourcemapsAfterUpload false',
        initialConfig: { devtool: 'hidden-source-map' },
        options: { deleteSourcemapsAfterUpload: false },
        expected: {
          devtool: 'hidden-source-map',
          deleteSourceMaps: false,
        },
      },
    ])('$name', ({ initialConfig, options, expected }) => {
      getConfig.mockReturnValue(initialConfig);

      onCreateWebpackConfig({ actions: actions, getConfig: getConfig }, options);

      expect(actions.setWebpackConfig).toHaveBeenCalledTimes(1);

      expect(actions.setWebpackConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          devtool: expected.devtool,
          plugins: expect.arrayContaining([expect.any(Object)]),
        }),
      );

      expect(sentryWebpackPlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcemaps: expect.objectContaining({
            assets: ['./public/**'],
            filesToDeleteAfterUpload: expected.deleteSourceMaps ? ['./public/**/*.map'] : undefined,
          }),
        }),
      );
    });
  });
});
