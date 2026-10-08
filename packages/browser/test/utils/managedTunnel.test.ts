import type { EventEnvelope, EventItem } from '@sentry/core';
import { createEnvelope, getTunnelPath, isTunnelRequest } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClient, getCurrentScope, init } from '../../src';
import { makeFetchTransport } from '../../src/transports/fetch';
import { resolveBrowserTunnelOption } from '../../src/utils/managedTunnel';

const DSN = 'https://public@o123.ingest.sentry.io/1337';

describe('resolveBrowserTunnelOption', () => {
  it('resolves `tunnel: true` to the path the server derives from the same DSN', () => {
    const { tunnel } = resolveBrowserTunnelOption({ dsn: DSN, tunnel: true });

    expect(tunnel).toBe(getTunnelPath(DSN));
    expect(isTunnelRequest('POST', tunnel!, { allowedDsns: [DSN] })).toBe(true);
  });

  it('prefixes the base path and appends a trailing slash when asked', () => {
    const { tunnel } = resolveBrowserTunnelOption({ dsn: DSN, tunnel: { basePath: '/docs/', trailingSlash: true } });

    expect(tunnel).toBe(`/docs${getTunnelPath(DSN)}/`);
    expect(isTunnelRequest('POST', tunnel!, { allowedDsns: [DSN], basePath: '/docs' })).toBe(true);
  });

  it('keeps a URL tunnel and its transport options untouched', () => {
    const transportOptions = { headers: { 'x-custom': '1' } };

    expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel: '/my-tunnel', transportOptions })).toEqual({
      tunnel: '/my-tunnel',
      transportOptions,
    });
  });

  it('turns the tunnel off without a valid DSN', () => {
    expect(resolveBrowserTunnelOption({ tunnel: true }).tunnel).toBeUndefined();
    expect(resolveBrowserTunnelOption({ dsn: 'not-a-dsn', tunnel: true }).tunnel).toBeUndefined();
  });

  it('sends envelopes as application/x-sentry-envelope so CSRF checks do not treat them as form posts', async () => {
    const { tunnel, transportOptions } = resolveBrowserTunnelOption({
      dsn: DSN,
      tunnel: true,
      transportOptions: { headers: { 'x-custom': '1' } },
    });
    const nativeFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    const transport = makeFetchTransport(
      { ...transportOptions, url: tunnel!, recordDroppedEvent: () => undefined },
      nativeFetch,
    );
    await transport.send(
      createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
        [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
      ]),
    );

    expect(nativeFetch).toHaveBeenCalledWith(
      getTunnelPath(DSN),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-sentry-envelope', 'x-custom': '1' },
      }),
    );
  });

  it('lets a user-provided Content-Type header win', () => {
    const { transportOptions } = resolveBrowserTunnelOption({
      dsn: DSN,
      tunnel: true,
      transportOptions: { headers: { 'Content-Type': 'text/plain' } },
    });

    expect(transportOptions?.headers).toEqual({ 'Content-Type': 'text/plain' });
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
});
