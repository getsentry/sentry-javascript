/**
 * @vitest-environment jsdom
 */

import { getTunnelPath } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClient, getCurrentScope, init } from '../../src';
import { makeFetchTransport } from '../../src/transports/fetch';
import { resolveBrowserTunnelOption } from '../../src/utils/managedTunnel';

const DSN = 'https://public@o123.ingest.sentry.io/1337';

describe('resolveBrowserTunnelOption', () => {
  it('resolves `tunnel: true` to the path the server derives from the same DSN', () => {
    const { tunnel } = resolveBrowserTunnelOption({ dsn: DSN, tunnel: true });

    expect(tunnel).toBe(getTunnelPath(DSN));
  });

  it('sends to a managed tunnel as application/x-sentry-envelope so CSRF checks do not treat it as a form post', () => {
    expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel: true }).transportOptions).toEqual({
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
    });
    expect(
      resolveBrowserTunnelOption({ dsn: DSN, tunnel: true, transportOptions: { headers: { 'X-Custom': '1' } } })
        .transportOptions,
    ).toEqual({ headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Custom': '1' } });
  });

  it('prefixes the base path and appends a trailing slash when asked', () => {
    const { tunnel } = resolveBrowserTunnelOption({ dsn: DSN, tunnel: { basePath: '/docs/', trailingSlash: true } });

    expect(tunnel).toBe(`/docs${getTunnelPath(DSN)}/`);
  });

  it('normalizes the base path like the server does, so the tunnel URL is never page-relative', () => {
    expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel: { basePath: 'docs' } }).tunnel).toBe(
      `/docs${getTunnelPath(DSN)}`,
    );
    expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel: { basePath: './docs/' } }).tunnel).toBe(
      `/docs${getTunnelPath(DSN)}`,
    );
    expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel: { basePath: './' } }).tunnel).toBe(getTunnelPath(DSN));
  });

  it('uses a fixed path instead of the DSN-derived one', () => {
    expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel: { path: '/monitor' } }).tunnel).toBe('/monitor');
  });

  it.each(['/monitor', 'monitor', `${location.origin}/monitor`])(
    'sends to the same-origin string tunnel %s as application/x-sentry-envelope too',
    tunnel => {
      expect(
        resolveBrowserTunnelOption({ dsn: DSN, tunnel, transportOptions: { headers: { 'X-Custom': '1' } } }),
      ).toEqual({
        tunnel,
        transportOptions: { headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Custom': '1' } },
      });
    },
  );

  it.each(['https://proxy.example.com/tunnel', '//proxy.example.com/tunnel'])(
    'keeps the cross-origin string tunnel %s and its transport options untouched, so it needs no CORS preflight',
    tunnel => {
      const transportOptions = { headers: { 'x-custom': '1' } };

      expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel, transportOptions })).toEqual({ tunnel, transportOptions });
    },
  );

  it('lets a user content type override the envelope one', () => {
    const transportOptions = { headers: { 'Content-Type': 'text/plain' } };

    expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel: '/monitor', transportOptions }).transportOptions).toEqual(
      transportOptions,
    );
  });

  it('turns the tunnel off without a valid DSN', () => {
    expect(resolveBrowserTunnelOption({ tunnel: true }).tunnel).toBeUndefined();
    expect(resolveBrowserTunnelOption({ dsn: 'not-a-dsn', tunnel: true }).tunnel).toBeUndefined();
  });
});

describe('init with `tunnel: true`', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('gives the client a resolved tunnel URL', () => {
    init({ dsn: DSN, tunnel: true, defaultIntegrations: false });

    expect(getClient()?.getOptions().tunnel).toBe(getTunnelPath(DSN));
  });

  it('only sets the envelope content type for a same-origin tunnel', () => {
    const transport = vi.fn(makeFetchTransport);

    init({ dsn: DSN, tunnel: true, transport });
    const managedTransportOptions = transport.mock.calls[0]?.[0];
    init({ dsn: DSN, tunnel: 'https://proxy.example.com', transport });

    expect(managedTransportOptions).toEqual(
      expect.objectContaining({
        url: getTunnelPath(DSN),
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
      }),
    );
    expect(transport).toHaveBeenLastCalledWith(expect.not.objectContaining({ headers: expect.anything() }));
  });
});
