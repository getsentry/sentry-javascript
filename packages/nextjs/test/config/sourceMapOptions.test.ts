import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDeleteSourceMapsOption,
  getSourceMapFeatureOptions,
  mergeFilesToDeleteAfterUpload,
  sentryEnablesSourceMaps,
} from '../../src/config/sourceMapOptions';
import type { NextConfigObject, SentryBuildOptions } from '../../src/config/types';
import type { BundlerInfo } from '../../src/config/withSentryConfig/getFinalConfigObjectBundlerUtils';
import { maybeEnableTurbopackSourcemaps } from '../../src/config/withSentryConfig/getFinalConfigObjectBundlerUtils';

const TURBOPACK_SUPPORTED: BundlerInfo = { isTurbopack: true, isWebpack: false, isTurbopackSupported: true };
const CREDENTIALS = { authToken: 'token', org: 'org', project: 'project' };

beforeEach(() => {
  vi.stubEnv('SENTRY_AUTH_TOKEN', '');
  vi.stubEnv('SENTRY_ORG', '');
  vi.stubEnv('SENTRY_PROJECT', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sentryEnablesSourceMaps', () => {
  it.each([
    [undefined, true],
    [{ upload: false }, false],
    [{ injectDebugIds: false }, false],
    [{ upload: false, delete: false }, true],
    [{ upload: false, delete: true }, false],
    [{ injectDebugIds: false, delete: false }, false],
    [{ disable: true }, false],
    [{ disable: 'disable-upload' }, false],
    [{ disable: 'disable-upload', delete: false }, true],
    [{ disable: true, upload: true }, true],
  ] as const)('with %j it returns %s', (sourcemaps, expected) => {
    expect(sentryEnablesSourceMaps({ ...CREDENTIALS, sourcemaps })).toBe(expected);
  });

  it.each([
    [undefined, false],
    [{ delete: false }, true],
  ] as const)('without upload credentials, with %j it returns %s', (sourcemaps, expected) => {
    expect(sentryEnablesSourceMaps({ sourcemaps })).toBe(expected);
  });
});

describe('getDeleteSourceMapsOption', () => {
  it.each([
    [undefined, undefined],
    [{ deleteSourcemapsAfterUpload: true }, true],
    [{ delete: false, deleteSourcemapsAfterUpload: true }, false],
    [{ delete: true, deleteSourcemapsAfterUpload: false }, true],
  ] as const)('with %j it returns %s', (sourcemaps, expected) => {
    expect(getDeleteSourceMapsOption(sourcemaps)).toBe(expected);
  });
});

describe('getSourceMapFeatureOptions', () => {
  it.each([
    [undefined, { disable: false }],
    [{ disable: 'disable-upload' }, { disable: 'disable-upload' }],
    [{ upload: false }, { disable: undefined, upload: false }],
    [{ injectDebugIds: false }, { disable: undefined, injectDebugIds: false }],
    // The bundler plugin warns about this combination.
    [
      { disable: true, upload: true },
      { disable: true, upload: true },
    ],
  ] as const)('with %j it returns %j', (sourcemaps, expected) => {
    expect(getSourceMapFeatureOptions(sourcemaps, false)).toEqual(expected);
  });

  it('switches the webpack plugin off when the upload runs after the compile', () => {
    expect(getSourceMapFeatureOptions({ upload: true, injectDebugIds: true }, true)).toEqual({ disable: true });
  });
});

describe('mergeFilesToDeleteAfterUpload', () => {
  it.each([
    [['default'], undefined, true, ['default']],
    [undefined, undefined, true, undefined],
    [['default'], 'user', true, ['user']],
    [['default'], ['user'], false, ['default', 'user']],
    [undefined, ['user'], false, ['user']],
  ] as const)('with the defaults %j and the user files %j', (defaults, userFiles, replace, expected) => {
    expect(
      mergeFilesToDeleteAfterUpload(defaults && [...defaults], userFiles && ([userFiles].flat() as string[]), replace),
    ).toEqual(expected);
  });
});

describe('maybeEnableTurbopackSourcemaps with the new source map options', () => {
  function run(sourcemaps: NonNullable<SentryBuildOptions['sourcemaps']>, nextConfig: NextConfigObject = {}) {
    const userSentryOptions: SentryBuildOptions = { ...CREDENTIALS, sourcemaps };
    maybeEnableTurbopackSourcemaps(nextConfig, userSentryOptions, TURBOPACK_SUPPORTED);
    return { nextConfig, sourcemaps: userSentryOptions.sourcemaps };
  }

  it.each([{ upload: false }, { injectDebugIds: false }, { upload: false, delete: true }])(
    'turns no source maps on with %j',
    sourcemaps => {
      const result = run(sourcemaps);

      expect(result.nextConfig.productionBrowserSourceMaps).toBeUndefined();
      expect(result.sourcemaps).toEqual(sourcemaps);
    },
  );

  it.each([{ delete: false }, { upload: false, delete: false }, { delete: true }])(
    'turns source maps on and keeps the user-set `delete` with %j',
    sourcemaps => {
      const result = run(sourcemaps);

      expect(result.nextConfig.productionBrowserSourceMaps).toBe(true);
      expect(result.sourcemaps).toEqual(sourcemaps);
    },
  );

  it('defaults to deletion when it turns source maps on for `upload: true`', () => {
    const result = run({ upload: true });

    expect(result.nextConfig.productionBrowserSourceMaps).toBe(true);
    expect(result.sourcemaps).toEqual({ upload: true, deleteSourcemapsAfterUpload: true });
  });

  it('turns no source maps on without upload credentials', () => {
    const nextConfig: NextConfigObject = {};
    maybeEnableTurbopackSourcemaps(nextConfig, { sourcemaps: {} }, TURBOPACK_SUPPORTED);

    expect(nextConfig.productionBrowserSourceMaps).toBeUndefined();
  });
});
