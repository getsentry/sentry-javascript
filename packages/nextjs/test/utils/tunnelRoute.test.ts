import type { BrowserOptions } from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTunnelRouteOption } from '../../src/client/tunnelRoute';

const DSN = 'https://11111111111111111111111111111111@o2222222.ingest.sentry.io/3333333';

const globalWithInjectedValues = global as typeof global & {
  _sentryTunnelRoute?: string;
};

beforeEach(() => {
  globalWithInjectedValues._sentryTunnelRoute = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('applyTunnelRouteOption()', () => {
  it('sends events to the fixed path of the `tunnelRoute`', () => {
    globalWithInjectedValues._sentryTunnelRoute = '/docs/monitoring';
    const options: BrowserOptions = { dsn: DSN };

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe('/docs/monitoring');
  });

  it('sends events to the path derived from the DSN for `tunnelRoute: true`', () => {
    globalWithInjectedValues._sentryTunnelRoute = 'true';
    const options: BrowserOptions = { dsn: DSN };

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe(true);
  });

  it('adds the trailing slash Next.js redirects to', () => {
    vi.stubEnv('_sentryTrailingSlash', 'true');
    globalWithInjectedValues._sentryTunnelRoute = '/monitoring';
    const options: BrowserOptions = { dsn: DSN };

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe('/monitoring/');
  });

  it('keeps the `tunnel` the user set', () => {
    globalWithInjectedValues._sentryTunnelRoute = '/monitoring';
    const options: BrowserOptions = { dsn: DSN, tunnel: 'https://tunnel.example.com' };

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe('https://tunnel.example.com');
  });

  it('does not set a `tunnel` without a `tunnelRoute`', () => {
    const options: BrowserOptions = { dsn: DSN };

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });
});
