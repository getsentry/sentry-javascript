import * as SentryBrowser from '@sentry/browser';
import { getMainCarrier } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { init } from '../src/sdk';

const browserInit = vi.spyOn(SentryBrowser, 'init');

const DSN = 'https://public@dsn.ingest.sentry.io/1337';

const app = {
  config: {
    globalProperties: {
      $router: { resolve: () => ({ matched: [{ path: '/users/:id' }] }) },
    },
  },
};

describe('init', () => {
  afterEach(() => {
    vi.clearAllMocks();
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('passes a route provider that reads the router off the app', () => {
    init({ dsn: DSN, app: app as never, defaultIntegrations: false });

    const { routeProvider } = browserInit.mock.lastCall![0]!;
    expect(routeProvider?.resolveRoute(new URL('https://example.com/users/42'))).toBe('/users/:id');
  });

  it('does not pass a route provider without an app to read the router from', () => {
    init({ dsn: DSN, defaultIntegrations: false });

    expect(browserInit).toHaveBeenLastCalledWith(expect.not.objectContaining({ routeProvider: expect.anything() }));
  });

  it('keeps a route provider passed by the user', () => {
    const routeProvider = { resolveRoute: () => '/custom', resolveCurrentRoute: () => '/custom' };
    init({ dsn: DSN, app: app as never, defaultIntegrations: false, routeProvider });

    expect(browserInit).toHaveBeenLastCalledWith(expect.objectContaining({ routeProvider }));
  });
});
