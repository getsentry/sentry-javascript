import type { BrowserOptions } from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Loaded for its side effect: the module under test reaches `@sentry/core`, and transforming that
// graph is charged to whichever test imports it first, which timed out on slower CI runners.
// Importing it here pays that once at collect time instead.
import '@sentry/core';

describe('applyTunnelRouteOption()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the managed tunnel route when no runtime tunnel is set', async () => {
    vi.stubGlobal('__SENTRY_TANSTACKSTART_TUNNEL_ROUTE__', '/managed-tunnel');

    const { applyTunnelRouteOption } = await import('../../src/client/tunnelRoute');

    const options: BrowserOptions = {
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    };

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe('/managed-tunnel');
  });

  it('does not override an explicit runtime tunnel and warns instead', async () => {
    vi.stubGlobal('__SENTRY_TANSTACKSTART_TUNNEL_ROUTE__', '/managed-tunnel');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { applyTunnelRouteOption } = await import('../../src/client/tunnelRoute');

    const options: BrowserOptions = {
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tunnel: '/runtime-tunnel',
    };

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe('/runtime-tunnel');
    expect(warnSpy).toHaveBeenCalledWith(
      '[@sentry/tanstackstart-react] `Sentry.init({ tunnel: ... })` overrides the managed `sentryTanstackStart({ tunnelRoute: ... })` route. Remove the runtime `tunnel` option if you want the managed tunnel route to be used.',
    );
  });

  it('turns on the DSN-derived tunnel when the plugin derives the path from the DSN', async () => {
    vi.stubGlobal('__SENTRY_TANSTACKSTART_TUNNEL_ROUTE__', true);

    const { applyTunnelRouteOption } = await import('../../src/client/tunnelRoute');

    const options: BrowserOptions = { dsn: 'https://public@dsn.ingest.sentry.io/1337' };
    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe(true);
  });

  it('does not warn when the runtime option already matches the managed tunnel', async () => {
    vi.stubGlobal('__SENTRY_TANSTACKSTART_TUNNEL_ROUTE__', true);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { applyTunnelRouteOption } = await import('../../src/client/tunnelRoute');

    const options: BrowserOptions = { dsn: 'https://public@dsn.ingest.sentry.io/1337', tunnel: true };
    applyTunnelRouteOption(options);

    expect(options.tunnel).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does nothing when no managed tunnel route was injected', async () => {
    const { applyTunnelRouteOption } = await import('../../src/client/tunnelRoute');

    const options: BrowserOptions = {
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    };

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });

  it('serves the tunnel under the base path Start routes on, unless the user set one', async () => {
    vi.stubGlobal('__SENTRY_TANSTACKSTART_TUNNEL_BASE_PATH__', '/app');

    const { applyTunnelRouteOption } = await import('../../src/client/tunnelRoute');

    const managed: BrowserOptions = { tunnel: true };
    applyTunnelRouteOption(managed);
    expect(managed.tunnel).toEqual({ basePath: '/app' });

    const own: BrowserOptions = { tunnel: { basePath: '/custom' } };
    applyTunnelRouteOption(own);
    expect(own.tunnel).toEqual({ basePath: '/custom' });

    const url: BrowserOptions = { tunnel: 'https://example.com/tunnel' };
    applyTunnelRouteOption(url);
    expect(url.tunnel).toBe('https://example.com/tunnel');
  });

  it('serves a static `tunnelRoute` under the base path too', async () => {
    vi.stubGlobal('__SENTRY_TANSTACKSTART_TUNNEL_ROUTE__', '/managed-tunnel');
    vi.stubGlobal('__SENTRY_TANSTACKSTART_TUNNEL_BASE_PATH__', '/app');

    const { applyTunnelRouteOption } = await import('../../src/client/tunnelRoute');

    const options: BrowserOptions = {};
    applyTunnelRouteOption(options);

    expect(options.tunnel).toEqual({ basePath: '/app', path: '/managed-tunnel' });
  });
});
