import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { warnOnConflictingSourceMapOptions as WarnOnConflictingSourceMapOptions } from '../../../src/build-time-plugins/warnOnConflictingSourceMapOptions';

describe('warnOnConflictingSourceMapOptions', () => {
  let warnOnConflictingSourceMapOptions: typeof WarnOnConflictingSourceMapOptions;

  // The module remembers the warnings it logged.
  beforeEach(async () => {
    vi.resetModules();
    ({ warnOnConflictingSourceMapOptions } =
      await import('../../../src/build-time-plugins/warnOnConflictingSourceMapOptions'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [{ upload: false, disable: true }, /`sourcemaps\.disable` is ignored/],
    [{ injectDebugIds: false, disable: 'disable-upload' }, /`sourcemaps\.disable` is ignored/],
    [{ upload: true, injectDebugIds: false }, /`sourcemaps\.injectDebugIds` is `false`/],
    [{ delete: true, deleteSourcemapsAfterUpload: false }, /`sourcemaps\.deleteSourcemapsAfterUpload` is ignored/],
    [{ delete: false, filesToDeleteAfterUpload: ['dist/**/*.map'] }, /`sourcemaps\.filesToDeleteAfterUpload` still/],
  ] as const)('warns once about %j', (sourcemaps, message) => {
    const logWarning = vi.fn();

    warnOnConflictingSourceMapOptions(sourcemaps, logWarning);

    expect(logWarning).toHaveBeenCalledTimes(1);
    expect(logWarning).toHaveBeenCalledWith(expect.stringMatching(message));
  });

  it.each([
    undefined,
    {},
    { upload: false },
    { injectDebugIds: false },
    { upload: false, injectDebugIds: false },
    { delete: false },
    { disable: true, deleteSourcemapsAfterUpload: true },
    { disable: true, delete: true },
    { delete: true, filesToDeleteAfterUpload: ['extra/**'] },
    { filesToDeleteAfterUpload: ['dist/**/*.map'] },
  ] as const)('does not warn about %j', sourcemaps => {
    const logWarning = vi.fn();

    warnOnConflictingSourceMapOptions(sourcemaps, logWarning);

    expect(logWarning).not.toHaveBeenCalled();
  });

  it('warns about each conflict', () => {
    const logWarning = vi.fn();

    warnOnConflictingSourceMapOptions(
      { disable: true, upload: true, injectDebugIds: false, delete: false, filesToDeleteAfterUpload: 'x' },
      logWarning,
    );

    expect(logWarning).toHaveBeenCalledTimes(3);
  });

  it('logs each warning once, also for later calls', () => {
    const logWarning = vi.fn();

    warnOnConflictingSourceMapOptions({ upload: true, injectDebugIds: false }, logWarning);
    warnOnConflictingSourceMapOptions({ upload: true, injectDebugIds: false, disable: true }, logWarning);

    expect(logWarning).toHaveBeenCalledTimes(2);
    expect(logWarning).toHaveBeenNthCalledWith(1, expect.stringMatching(/`sourcemaps\.injectDebugIds` is `false`/));
    expect(logWarning).toHaveBeenNthCalledWith(2, expect.stringMatching(/`sourcemaps\.disable` is ignored/));
  });

  it('logs with a `[Sentry]` prefix by default', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    warnOnConflictingSourceMapOptions({ upload: true, injectDebugIds: false });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[Sentry\] `sourcemaps\.upload` is set/));
  });
});
