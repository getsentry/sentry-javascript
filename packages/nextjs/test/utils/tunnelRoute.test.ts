import type { BrowserOptions } from '@sentry/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    // Avoid polluting the test output with error messages
    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    globalWithInjectedValues._sentryRewritesTunnelPath = '/my-error-monitoring-route';
    const options: any = {
      dsn: 'invalidDsn',
    } as BrowserOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();

    mockConsoleError.mockRestore();
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

describe('Random tunnel route generation', () => {
  it('Works when tunnelRoute is true and generates random-looking paths', () => {
    globalWithInjectedValues._sentryRewritesTunnelPath = '/abc123def'; // Simulated random path
    const options: any = {
      dsn: 'https://11111111111111111111111111111111@o2222222.ingest.sentry.io/3333333',
    } as BrowserOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe('/abc123def?o=2222222&p=3333333');
    expect(options.tunnel).toMatch(/^\/[a-z0-9]+\?o=2222222&p=3333333$/);
  });

  it('Works with region DSNs when tunnelRoute is true', () => {
    globalWithInjectedValues._sentryRewritesTunnelPath = '/x7h9k2m'; // Simulated random path
    const options: any = {
      dsn: 'https://11111111111111111111111111111111@o2222222.ingest.eu.sentry.io/3333333',
    } as BrowserOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe('/x7h9k2m?o=2222222&p=3333333&r=eu');
    expect(options.tunnel).toMatch(/^\/[a-z0-9]+\?o=2222222&p=3333333&r=eu$/);
  });

  it('Does not apply tunnel when tunnelRoute is false', () => {
    globalWithInjectedValues._sentryRewritesTunnelPath = undefined;
    const options: any = {
      dsn: 'https://11111111111111111111111111111111@o2222222.ingest.sentry.io/3333333',
    } as BrowserOptions;

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });
});
