import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBuildLogger } from '../../src/config/buildLogger';
import { createRouteManifest } from '../../src/config/manifest/createRouteManifest';
import type { NextConfigObject } from '../../src/config/types';
import { withSentryConfig } from '../../src/config/withSentryConfig';
import type { BundlerInfo } from '../../src/config/withSentryConfig/getFinalConfigObjectBundlerUtils';
import {
  maybeEnableTurbopackSourcemaps,
  maybeWarnAboutTurbopackModuleMetadata,
  maybeWarnAboutUnsupportedRunAfterProductionCompileHook,
  maybeWarnAboutUnsupportedTurbopack,
} from '../../src/config/withSentryConfig/getFinalConfigObjectBundlerUtils';
import { maybeSetClientTraceMetadataOption } from '../../src/config/withSentryConfig/getFinalConfigObjectUtils';

const TURBOPACK_UNSUPPORTED: BundlerInfo = { isTurbopack: true, isWebpack: false, isTurbopackSupported: false };
const TURBOPACK_SUPPORTED: BundlerInfo = { isTurbopack: true, isWebpack: false, isTurbopackSupported: true };
const WEBPACK: BundlerInfo = { isTurbopack: false, isWebpack: true, isTurbopackSupported: false };

// `createRouteManifest` memoizes per app dir and `silent` is not part of the cache key, so the two
// variants need distinct paths to both actually scan. Neither is a directory, which is what makes it log.
const NOT_A_DIRECTORY = { silent: __filename, notSilent: path.join(__dirname, 'testUtils.ts') };

describe('getBuildLogger', () => {
  it('forwards to the console when not silent', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    getBuildLogger(false).warn('hello');

    expect(warnSpy).toHaveBeenCalledWith('hello');

    warnSpy.mockRestore();
  });

  it.each(['log', 'warn', 'error', 'debug'] as const)('swallows `%s` when silent', method => {
    const spy = vi.spyOn(console, method).mockImplementation(() => {});

    getBuildLogger(true)[method]('hello');

    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});

// `silent` is documented as suppressing *all* SDK build logs, but for a long time it was only
// forwarded to the bundler plugin. These cover the SDK's own build-time output, one case per file
// that logs, so a newly added un-gated `console` call in any of them shows up here.
describe('`silent` build option', () => {
  let spies: Array<ReturnType<typeof vi.spyOn>> = [];

  beforeEach(() => {
    spies = (['log', 'warn', 'error', 'debug'] as const).map(method =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function countLogs(): number {
    return spies.reduce((total, spy) => total + spy.mock.calls.length, 0);
  }

  describe.each([
    [
      'removed build options',
      (silent?: boolean) =>
        // @ts-expect-error - removed in v11, but JS configs get no type checking
        withSentryConfig({}, { silent, unstable_sentryWebpackPluginOptions: {} }),
    ],
    [
      'unsupported turbopack version',
      (silent?: boolean) => maybeWarnAboutUnsupportedTurbopack('15.0.0', TURBOPACK_UNSUPPORTED, silent),
    ],
    [
      'moduleMetadata on turbopack',
      (silent?: boolean) => maybeWarnAboutTurbopackModuleMetadata({ silent, moduleMetadata: {} }, TURBOPACK_SUPPORTED),
    ],
    [
      'unsupported runAfterProductionCompile hook',
      (silent?: boolean) =>
        maybeWarnAboutUnsupportedRunAfterProductionCompileHook(
          '15.0.0',
          { silent, useRunAfterProductionCompileHook: true },
          WEBPACK,
        ),
    ],
    [
      'turbopack source map auto-enabling',
      (silent?: boolean) => maybeEnableTurbopackSourcemaps({}, { silent, debug: true }, TURBOPACK_SUPPORTED),
    ],
    [
      'undetectable Next.js version',
      (silent?: boolean) => maybeSetClientTraceMetadataOption({} as NextConfigObject, undefined, silent),
    ],
    [
      'unreadable app directory',
      (silent?: boolean) =>
        createRouteManifest({ appDirPath: silent ? NOT_A_DIRECTORY.silent : NOT_A_DIRECTORY.notSilent, silent }),
    ],
  ])('%s', (_name, run) => {
    it('logs when `silent` is not set', () => {
      run(undefined);

      expect(countLogs()).toBeGreaterThan(0);
    });

    it('logs nothing when `silent` is `true`', () => {
      run(true);

      expect(countLogs()).toBe(0);
    });
  });
});
