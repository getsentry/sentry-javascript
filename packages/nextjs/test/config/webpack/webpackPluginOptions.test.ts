import type { BuildContext, NextConfigObject } from '../../../src/config/types';
import { getWebpackPluginOptions } from '../../../src/config/webpackPluginOptions';

function generateBuildContext(overrides: {
  isServer: boolean;
  nextjsConfig?: NextConfigObject;
}): BuildContext {
  return {
    dev: false, // The plugin is not included in dev mode
    isServer: overrides.isServer,
    buildId: 'test-build-id',
    dir: '/my/project/dir',
    config: overrides.nextjsConfig ?? {},
    totalPages: 2,
    defaultLoaders: true,
    webpack: {
      version: '4.0.0',
      DefinePlugin: {} as any,
    },
  };
}

describe('getWebpackPluginOptions()', () => {
  it('forwards relevant options', () => {
    const buildContext = generateBuildContext({ isServer: false });
    const generatedPluginOptions = getWebpackPluginOptions(buildContext, {
      authToken: 'my-auth-token',
      headers: { 'my-test-header': 'test' },
      org: 'my-org',
      project: 'my-project',
      telemetry: false,
      reactComponentAnnotation: {
        enabled: true,
      },
      silent: false,
      debug: true,
      sentryUrl: 'my-url',
      sourcemaps: {
        assets: ['my-asset'],
        ignore: ['my-ignore'],
      },
      release: {
        name: 'my-release',
        create: false,
        finalize: false,
        dist: 'my-dist',
        vcsRemote: 'my-origin',
        setCommits: {
          auto: true,
        },
        deploy: {
          env: 'my-env',
        },
      },
    });

    expect(generatedPluginOptions.authToken).toBe('my-auth-token');
    expect(generatedPluginOptions.debug).toBe(true);
    expect(generatedPluginOptions.headers).toStrictEqual({ 'my-test-header': 'test' });
    expect(generatedPluginOptions.org).toBe('my-org');
    expect(generatedPluginOptions.project).toBe('my-project');
    expect(generatedPluginOptions.reactComponentAnnotation?.enabled).toBe(true);
    expect(generatedPluginOptions.release?.create).toBe(false);
    expect(generatedPluginOptions.release?.deploy?.env).toBe('my-env');
    expect(generatedPluginOptions.release?.dist).toBe('my-dist');
    expect(generatedPluginOptions.release?.finalize).toBe(false);
    expect(generatedPluginOptions.release?.name).toBe('my-release');
    expect(generatedPluginOptions.release?.setCommits?.auto).toBe(true);
    expect(generatedPluginOptions.release?.vcsRemote).toBe('my-origin');
    expect(generatedPluginOptions.silent).toBe(false);
    expect(generatedPluginOptions.sourcemaps?.assets).toStrictEqual(['my-asset']);
    expect(generatedPluginOptions.sourcemaps?.ignore).toStrictEqual(['my-ignore']);
    expect(generatedPluginOptions.telemetry).toBe(false);
    expect(generatedPluginOptions.url).toBe('my-url');

    expect(generatedPluginOptions).toMatchObject({
      authToken: 'my-auth-token',
      debug: true,
      headers: {
        'my-test-header': 'test',
      },
      org: 'my-org',
      project: 'my-project',
      reactComponentAnnotation: {
        enabled: true,
      },
      release: {
        create: false,
        deploy: {
          env: 'my-env',
        },
        dist: 'my-dist',
        finalize: false,
        inject: false,
        name: 'my-release',
        setCommits: {
          auto: true,
        },
        vcsRemote: 'my-origin',
      },
      silent: false,
      sourcemaps: {
        assets: ['my-asset'],
        ignore: ['my-ignore'],
      },
      telemetry: false,
      url: 'my-url',
    });
  });

  it('returns the right `assets` and `ignore` values during the server build', () => {
    const buildContext = generateBuildContext({ isServer: true });
    const generatedPluginOptions = getWebpackPluginOptions(buildContext, {});
    expect(generatedPluginOptions.sourcemaps).toMatchObject({
      assets: ['/my/project/dir/.next/server/**', '/my/project/dir/.next/serverless/**'],
      ignore: [],
    });
  });

  it('returns the right `assets` and `ignore` values during the client build', () => {
    const buildContext = generateBuildContext({ isServer: false });
    const generatedPluginOptions = getWebpackPluginOptions(buildContext, {});
    expect(generatedPluginOptions.sourcemaps).toMatchObject({
      assets: ['/my/project/dir/.next/static/chunks/pages/**', '/my/project/dir/.next/static/chunks/app/**'],
      ignore: [
        '/my/project/dir/.next/static/chunks/framework-*',
        '/my/project/dir/.next/static/chunks/framework.*',
        '/my/project/dir/.next/static/chunks/main-*',
        '/my/project/dir/.next/static/chunks/polyfills-*',
        '/my/project/dir/.next/static/chunks/webpack-*',
      ],
    });
  });

  it('returns the right `assets` and `ignore` values during the client build with `widenClientFileUpload`', () => {
    const buildContext = generateBuildContext({ isServer: false });
    const generatedPluginOptions = getWebpackPluginOptions(buildContext, { widenClientFileUpload: true });
    expect(generatedPluginOptions.sourcemaps).toMatchObject({
      assets: ['/my/project/dir/.next/static/chunks/**'],
      ignore: [
        '/my/project/dir/.next/static/chunks/framework-*',
        '/my/project/dir/.next/static/chunks/framework.*',
        '/my/project/dir/.next/static/chunks/main-*',
        '/my/project/dir/.next/static/chunks/polyfills-*',
        '/my/project/dir/.next/static/chunks/webpack-*',
      ],
    });
  });

  it('sets `sourcemaps.assets` to an empty array when `sourcemaps.disable` is true', () => {
    const buildContext = generateBuildContext({ isServer: false });
    const generatedPluginOptions = getWebpackPluginOptions(buildContext, { sourcemaps: { disable: true } });
    expect(generatedPluginOptions.sourcemaps).toMatchObject({
      assets: [],
    });
  });
});
