import type { BrowserOptions } from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('does nothing when no managed tunnel route was injected', async () => {
    const { applyTunnelRouteOption } = await import('../../src/client/tunnelRoute');

    const options: BrowserOptions = {
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    };

    applyTunnelRouteOption(options);

    expect(options.tunnel).toBeUndefined();
  });
});
