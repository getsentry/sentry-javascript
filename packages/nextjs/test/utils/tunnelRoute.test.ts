import type { BrowserOptions } from '@sentry/react';

import { applyTunnelRouteOption } from '../../src/client/tunnelRoute';

const globalWithInjectedValues = global as typeof global & {
  _sentryRewritesTunnelPath?: string;
};

beforeEach(() => {
  globalWithInjectedValues._sentryRewritesTunnelPath = undefined;
});

describe('applyTunnelRouteOption()', () => {
  it('Correctly applies `tunnelRoute` option when conditions are met', () => {
    globalWithInjectedValues._sentryRewritesTunnelPath = '/my-error-monitoring-route';
    const options: any = {
      dsn: 'https://11111111111111111111111111111111@o2222222.ingest.sentry.io/3333333',
    } as BrowserOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe('/my-error-monitoring-route?o=2222222&p=3333333');
  });

  it("Doesn't apply `tunnelRoute` when DSN is missing", () => {
    globalWithInjectedValues._sentryRewritesTunnelPath = '/my-error-monitoring-route';
    const options: any = {
      // no dsn
    } as BrowserOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });

  it("Doesn't apply `tunnelRoute` when DSN is invalid", () => {
    globalWithInjectedValues._sentryRewritesTunnelPath = '/my-error-monitoring-route';
    const options: any = {
      dsn: 'invalidDsn',
    } as BrowserOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });

  it("Doesn't apply `tunnelRoute` option when `tunnelRoute` option wasn't injected", () => {
    const options: any = {
      dsn: 'https://11111111111111111111111111111111@o2222222.ingest.sentry.io/3333333',
    } as BrowserOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });

  it("Doesn't `tunnelRoute` option when DSN is not a SaaS DSN", () => {
    globalWithInjectedValues._sentryRewritesTunnelPath = '/my-error-monitoring-route';
    const options: any = {
      dsn: 'https://11111111111111111111111111111111@example.com/3333333',
    } as BrowserOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });

  it('Correctly applies `tunnelRoute` option to region DSNs', () => {
    globalWithInjectedValues._sentryRewritesTunnelPath = '/my-error-monitoring-route';
    const options: any = {
      dsn: 'https://11111111111111111111111111111111@o2222222.ingest.us.sentry.io/3333333',
    } as BrowserOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe('/my-error-monitoring-route?o=2222222&p=3333333&r=us');
  });
});
