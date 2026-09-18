import { describe, expect, it, vi } from 'vitest';
import { warnOnRemovedBuildOptions } from '../../../src/build-time-plugins/warnOnRemovedBuildOptions';

describe('warnOnRemovedBuildOptions', () => {
  it('falls back to console.warn when no logger is given', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    warnOnRemovedBuildOptions({ unstable_sentryVitePluginOptions: {} }, ['unstable_sentryVitePluginOptions']);

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('unstable_sentryVitePluginOptions'));

    consoleWarnSpy.mockRestore();
  });

  it('stays silent by default when no removed key is present', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    warnOnRemovedBuildOptions({ org: 'my-org' }, ['unstable_sentryVitePluginOptions']);

    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('does not warn when no removed key is present', () => {
    const logWarning = vi.fn();

    warnOnRemovedBuildOptions({ org: 'my-org' }, ['unstable_sentryVitePluginOptions'], logWarning);

    expect(logWarning).not.toHaveBeenCalled();
  });

  it('does not warn for undefined options', () => {
    const logWarning = vi.fn();

    warnOnRemovedBuildOptions(undefined, ['unstable_sentryVitePluginOptions'], logWarning);

    expect(logWarning).not.toHaveBeenCalled();
  });

  it('warns once, naming every removed key that is present', () => {
    const logWarning = vi.fn();

    warnOnRemovedBuildOptions(
      { unstable_sentryVitePluginOptions: {}, unstable_sentryRollupPluginOptions: {} },
      ['unstable_sentryVitePluginOptions', 'unstable_sentryRollupPluginOptions'],
      logWarning,
    );

    expect(logWarning).toHaveBeenCalledTimes(1);
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('unstable_sentryVitePluginOptions, unstable_sentryRollupPluginOptions'),
    );
  });

  it('names only the removed keys that are actually present', () => {
    const logWarning = vi.fn();

    warnOnRemovedBuildOptions(
      { unstable_sentryVitePluginOptions: {} },
      ['unstable_sentryVitePluginOptions', 'unstable_sentryRollupPluginOptions'],
      logWarning,
    );

    expect(logWarning).toHaveBeenCalledWith(expect.not.stringContaining('unstable_sentryRollupPluginOptions'));
  });

  // A user who comments out the nested fields leaves the key behind with an `undefined` value.
  // The option is still gone, so the warning still applies.
  it('warns when the key is present but explicitly undefined', () => {
    const logWarning = vi.fn();

    warnOnRemovedBuildOptions(
      { unstable_sentryVitePluginOptions: undefined },
      ['unstable_sentryVitePluginOptions'],
      logWarning,
    );

    expect(logWarning).toHaveBeenCalledTimes(1);
  });

  it('points users at the first-class replacement', () => {
    const logWarning = vi.fn();

    warnOnRemovedBuildOptions(
      { unstable_sentryVitePluginOptions: {} },
      ['unstable_sentryVitePluginOptions'],
      logWarning,
    );

    expect(logWarning).toHaveBeenCalledWith(expect.stringContaining('Sentry build options'));
  });
});
