import * as SentryBrowser from '@sentry/browser';
import { vi } from 'vitest';
import { getDefaultIntegrations, init } from '../src/index';

describe('init', () => {
  it('sets the Angular version (if available) in the global scope', () => {
    const setContextSpy = vi.spyOn(SentryBrowser, 'setContext');

    init({});

    // In our case, the Angular version is 10 because that's the version we use for compilation
    // (and hence the dependency version of Angular core we installed (see package.json))
    expect(setContextSpy).toHaveBeenCalledTimes(1);
    expect(setContextSpy).toHaveBeenCalledWith('angular', { version: 14 });
  });

  describe('filtering out the `BrowserApiErrors` integration', () => {
    const browserInitSpy = vi.spyOn(SentryBrowser, 'init');

    beforeEach(() => {
      browserInitSpy.mockClear();
    });

    it('filters if `defaultIntegrations` is not set', () => {
      init({});

      expect(browserInitSpy).toHaveBeenCalledTimes(1);

      const options = browserInitSpy.mock.calls[0][0] || {};
      expect(options.defaultIntegrations).not.toContainEqual(expect.objectContaining({ name: 'BrowserApiErrors' }));
    });

    it("doesn't filter if `defaultIntegrations` is set to `false`", () => {
      init({ defaultIntegrations: false });

      expect(browserInitSpy).toHaveBeenCalledTimes(1);

      const options = browserInitSpy.mock.calls[0][0] || {};
      expect(options.defaultIntegrations).toEqual(false);
    });

    it("doesn't filter if `defaultIntegrations` is overwritten", () => {
      const defaultIntegrations = getDefaultIntegrations({});
      init({ defaultIntegrations });

      expect(browserInitSpy).toHaveBeenCalledTimes(1);

      const options = browserInitSpy.mock.calls[0][0] || {};
      expect(options.defaultIntegrations).toEqual(defaultIntegrations);
    });
  });
});
