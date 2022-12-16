import { NextjsOptions } from '../../src/utils/nextjsOptions';
import { applyTunnelRouteOption } from '../../src/utils/tunnelRoute';

const globalWithInjectedValues = global as typeof global & {
  __sentryRewritesTunnelPath__?: string;
};

beforeEach(() => {
  globalWithInjectedValues.__sentryRewritesTunnelPath__ = undefined;
});

describe('applyTunnelRouteOption()', () => {
  it('should correctly apply `tunnelRoute` option when conditions are met', () => {
    globalWithInjectedValues.__sentryRewritesTunnelPath__ = '/my-error-monitoring-route';
    const options: any = {
      dsn: 'https://11111111111111111111111111111111@o2222222.ingest.sentry.io/3333333',
    } as NextjsOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe('/my-error-monitoring-route?o=2222222&p=3333333&k=11111111111111111111111111111111');
  });

  it('should not apply `tunnelRoute` when DSN is missing', () => {
    globalWithInjectedValues.__sentryRewritesTunnelPath__ = '/my-error-monitoring-route';
    const options: any = {
      // no dsn
    } as NextjsOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });

  it("should not apply `tunnelRoute` option when `tunnelRoute` option wasn't injected", () => {
    const options: any = {
      dsn: 'https://11111111111111111111111111111111@o2222222.ingest.sentry.io/3333333',
    } as NextjsOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });

  it('should not apply `tunnelRoute` option when DSN is not a SaaS DSN', () => {
    globalWithInjectedValues.__sentryRewritesTunnelPath__ = '/my-error-monitoring-route';
    const options: any = {
      dsn: 'https://11111111111111111111111111111111@example.com/3333333',
    } as NextjsOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });
});
