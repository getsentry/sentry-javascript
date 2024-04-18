import * as SentryBrowser from '@sentry/browser';
import { vi } from 'vitest';
import { getDefaultIntegrations, init } from '../src/sdk';

describe('init', () => {
  it('sets the Angular version (if available) in the global scope', () => {
    const setContextSpy = vi.spyOn(SentryBrowser, 'setContext');

    init({});

    // In our case, the Angular version is 10 because that's the version we use for compilation
    // (and hence the dependency version of Angular core we installed (see package.json))
    expect(setContextSpy).toHaveBeenCalledTimes(1);
    expect(setContextSpy).toHaveBeenCalledWith('angular', { version: 14 });
  });

  it('does not include the BrowserApiErrors integration', () => {
    const browserDefaultIntegrationsWithoutBrowserApiErrors = SentryBrowser.getDefaultIntegrations()
      .filter(i => i.name !== 'BrowserApiErrors')
      .map(i => i.name)
      .sort();

    const angularDefaultIntegrations = getDefaultIntegrations()
      .map(i => i.name)
      .sort();

    expect(angularDefaultIntegrations).toEqual(browserDefaultIntegrationsWithoutBrowserApiErrors);
  });
});
