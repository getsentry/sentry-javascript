import { describe, expect, it, vi } from 'vitest';
import { getTurbopackServerModulesPatch } from '../../src/config/withSentryConfig/getFinalConfigObjectBundlerUtils';

const modules = { 'a</script>': '1.0.0\u2028' };

vi.mock('@sentry/bundler-plugins/loader-utils', () => ({ getInstalledModules: () => modules }));

describe('getTurbopackServerModulesPatch', () => {
  it('escapes the module versions for code injection and keeps them parseable', () => {
    const patch = getTurbopackServerModulesPatch(
      {},
      { isTurbopack: true, isWebpack: false, isTurbopackSupported: true },
    );
    const value = patch.compiler?.defineServer?.__SENTRY_SERVER_MODULES__ as string;

    expect(value).not.toMatch(/[<>\u2028]/);
    expect(JSON.parse(value)).toEqual(modules);
  });
});
