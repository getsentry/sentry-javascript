import type { EventEnvelope, EventItem, Transport, TransportMakeRequestResponse } from '@sentry/core';
import { createEnvelope, getEnvelopeEndpointWithUrlEncodedAuth, getTunnelPath, makeDsn } from '@sentry/core';
import { isTunnelRequest } from '@sentry/core/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClient, getCurrentScope, init } from '../../src';
import { makeFetchTransport } from '../../src/transports/fetch';
import { makeManagedTunnelTransport, resolveBrowserTunnelOption } from '../../src/utils/managedTunnel';
import type { BrowserTransportOptions } from '../../src/transports/types';

const DSN = 'https://public@o123.ingest.sentry.io/1337';

describe('resolveBrowserTunnelOption', () => {
  it('resolves `tunnel: true` to the path the server derives from the same DSN', () => {
    const { tunnel } = resolveBrowserTunnelOption({ dsn: DSN, tunnel: true });

    expect(tunnel).toBe(getTunnelPath(DSN));
    expect(isTunnelRequest({ method: 'POST', url: tunnel! }, { allowedDsns: [DSN] })).toBe(true);
  });

  it('marks the tunnel as managed so the client can explain a server that does not answer it', () => {
    expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel: { basePath: '/docs' } })._managedTunnel).toEqual({
      basePath: '/docs',
    });
    expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel: '/my-tunnel' })._managedTunnel).toBeUndefined();
  });

  it('prefixes the base path and appends a trailing slash when asked', () => {
    const { tunnel } = resolveBrowserTunnelOption({ dsn: DSN, tunnel: { basePath: '/docs/', trailingSlash: true } });

    expect(tunnel).toBe(`/docs${getTunnelPath(DSN)}/`);
    expect(isTunnelRequest({ method: 'POST', url: tunnel! }, { allowedDsns: [DSN], basePath: '/docs' })).toBe(true);
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
    const { tunnel, transportOptions } = resolveBrowserTunnelOption({ dsn: DSN, tunnel: { path: '/monitor' } });

    expect(tunnel).toBe('/monitor');
    expect(transportOptions?.headers).toEqual({ 'Content-Type': 'application/x-sentry-envelope' });
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

describe('makeManagedTunnelTransport', () => {
  const TUNNEL_URL = `https://example.com${getTunnelPath(DSN)}`;
  const DIRECT_URL = getEnvelopeEndpointWithUrlEncodedAuth(makeDsn(DSN)!);

  function makeEnvelope(id: string): EventEnvelope {
    return createEnvelope<EventEnvelope>({ dsn: DSN, event_id: id }, [
      [{ type: 'event' }, { event_id: id }] as EventItem,
    ]);
  }

  // Each transport answers with the next response queued for its URL and records what it sent.
  function setup(responses: Record<string, TransportMakeRequestResponse[]>): {
    transport: Transport;
    sent: Array<{ url: string; id: string; headers: BrowserTransportOptions['headers'] }>;
  } {
    const sent: Array<{ url: string; id: string; headers: BrowserTransportOptions['headers'] }> = [];
    const makeTransport = (options: BrowserTransportOptions): Transport => ({
      send: envelope => {
        sent.push({ url: options.url, id: String(envelope[0].event_id), headers: options.headers });

        return Promise.resolve(responses[options.url]?.shift() ?? { statusCode: 200 });
      },
      flush: () => Promise.resolve(true),
    });
    const transport = makeManagedTunnelTransport(makeTransport, { 'X-Custom': '1' })({
      url: TUNNEL_URL,
      headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Custom': '1' },
      recordDroppedEvent: () => undefined,
    });

    return { transport, sent };
  }

  const tunnelResponse = { statusCode: 200, headers: { 'x-sentry-tunnel': '1' } } as TransportMakeRequestResponse;

  it('keeps sending through the tunnel while its handler answers', async () => {
    const { transport, sent } = setup({ [TUNNEL_URL]: [tunnelResponse, tunnelResponse] });

    await transport.send(makeEnvelope('a'));
    await transport.send(makeEnvelope('b'));

    expect(sent.map(({ url, id }) => [url, id])).toEqual([
      [TUNNEL_URL, 'a'],
      [TUNNEL_URL, 'b'],
    ]);
  });

  it.each([400, 401, 403, 404, 405, 413, 429])(
    'sends an envelope directly once, and everything after it, when something other than the tunnel answers %s',
    async statusCode => {
      const { transport, sent } = setup({ [TUNNEL_URL]: [{ statusCode }] });

      expect(await transport.send(makeEnvelope('a'))).toEqual({ statusCode: 200 });
      await transport.send(makeEnvelope('b'));

      expect(sent.map(({ url, id }) => [url, id])).toEqual([
        [TUNNEL_URL, 'a'],
        [DIRECT_URL, 'a'],
        [DIRECT_URL, 'b'],
      ]);
      // Sentry takes the default `text/plain` without a CORS preflight, so the tunnel's content type is dropped.
      expect(sent[1]?.headers).toEqual({ 'X-Custom': '1' });
    },
  );

  it.each([403, 404, 405, 429])(
    'keeps using the tunnel when Sentry answers %s through its handler',
    async statusCode => {
      const sentryResponse = { statusCode, headers: { 'x-sentry-tunnel': '1' } } as TransportMakeRequestResponse;
      const { transport, sent } = setup({ [TUNNEL_URL]: [sentryResponse, tunnelResponse] });

      expect(await transport.send(makeEnvelope('a'))).toBe(sentryResponse);
      await transport.send(makeEnvelope('b'));

      expect(sent.map(({ url, id }) => [url, id])).toEqual([
        [TUNNEL_URL, 'a'],
        [TUNNEL_URL, 'b'],
      ]);
    },
  );

  it('never sends an envelope again after a 2xx the tunnel handler did not produce, only the ones after it', async () => {
    const { transport, sent } = setup({
      [TUNNEL_URL]: [{ statusCode: 200, headers: {} } as TransportMakeRequestResponse],
    });

    await transport.send(makeEnvelope('a'));
    await transport.send(makeEnvelope('b'));

    expect(sent.map(({ url, id }) => [url, id])).toEqual([
      [TUNNEL_URL, 'a'],
      [DIRECT_URL, 'b'],
    ]);
  });

  it.each([500, 503])('never sends an envelope again after a %s', async statusCode => {
    const { transport, sent } = setup({ [TUNNEL_URL]: [{ statusCode }] });

    await transport.send(makeEnvelope('a'));
    await transport.send(makeEnvelope('b'));

    expect(sent.map(({ url, id }) => [url, id])).toEqual([
      [TUNNEL_URL, 'a'],
      [TUNNEL_URL, 'b'],
    ]);
  });

  it('only sends each envelope directly once when several were already on their way to the tunnel', async () => {
    const { transport, sent } = setup({ [TUNNEL_URL]: [{ statusCode: 404 }, { statusCode: 404 }] });

    await Promise.all([transport.send(makeEnvelope('a')), transport.send(makeEnvelope('b'))]);

    expect(sent.filter(({ url }) => url === DIRECT_URL).map(({ id }) => id)).toEqual(['a', 'b']);
  });

  it('is used by `init` for a managed tunnel only', () => {
    const transport = vi.fn(makeFetchTransport);

    init({ dsn: DSN, tunnel: true, transport });
    const managedTransportOptions = transport.mock.calls[0]?.[0];
    init({ dsn: DSN, tunnel: 'https://proxy.example.com', transport });

    expect(managedTransportOptions?.url).toBe(getTunnelPath(DSN));
    expect(transport).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://proxy.example.com' }));
  });
});
