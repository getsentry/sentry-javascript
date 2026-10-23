import type { EventEnvelope, EventItem } from '@sentry/core';
import { createEnvelope, getEnvelopeEndpointWithUrlEncodedAuth, getTunnelPath, makeDsn } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClient, getCurrentScope, init } from '../../src';
import { makeFetchTransport } from '../../src/transports/fetch';
import { resolveBrowserTunnelOption } from '../../src/utils/managedTunnel';

const DSN = 'https://public@o123.ingest.sentry.io/1337';
const DIRECT_URL = getEnvelopeEndpointWithUrlEncodedAuth(makeDsn(DSN)!);

describe('resolveBrowserTunnelOption', () => {
  it('resolves `tunnel: true` to the path the server derives from the same DSN', () => {
    const { tunnel } = resolveBrowserTunnelOption({ dsn: DSN, tunnel: true });

    expect(tunnel).toBe(getTunnelPath(DSN));
  });

  it('gives a managed tunnel the direct ingest URL to fall back to', () => {
    expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel: { basePath: '/docs' } }).transportOptions).toEqual({
      _tunnelFallbackUrl: DIRECT_URL,
    });
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

  it('treats a relative path as a shortcut for a fixed path', () => {
    expect(resolveBrowserTunnelOption({ dsn: DSN, tunnel: '/monitor' })).toEqual(
      resolveBrowserTunnelOption({ dsn: DSN, tunnel: { path: '/monitor' } }),
    );
  });

  it('keeps a URL tunnel and its transport options untouched', () => {
    const transportOptions = { headers: { 'x-custom': '1' } };

    expect(
      resolveBrowserTunnelOption({ dsn: DSN, tunnel: 'https://proxy.example.com/tunnel', transportOptions }),
    ).toEqual({
      tunnel: 'https://proxy.example.com/tunnel',
      transportOptions,
    });
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

  it('only gives the transport a fallback URL for a managed tunnel', () => {
    const transport = vi.fn(makeFetchTransport);

    init({ dsn: DSN, tunnel: true, transport });
    const managedTransportOptions = transport.mock.calls[0]?.[0];
    init({ dsn: DSN, tunnel: 'https://proxy.example.com', transport });

    expect(managedTransportOptions).toEqual(
      expect.objectContaining({ url: getTunnelPath(DSN), _tunnelFallbackUrl: DIRECT_URL }),
    );
    expect(transport).toHaveBeenLastCalledWith(expect.not.objectContaining({ _tunnelFallbackUrl: expect.anything() }));
  });
});

describe('makeFetchTransport with a managed tunnel', () => {
  const TUNNEL_URL = `https://example.com${getTunnelPath(DSN)}`;

  function makeEnvelope(id: string): EventEnvelope {
    return createEnvelope<EventEnvelope>({ dsn: DSN, event_id: id }, [
      [{ type: 'event' }, { event_id: id }] as EventItem,
    ]);
  }

  // Each URL answers with the next response queued for it, 200 once the queue is empty.
  function setup(responses: Record<string, Array<{ status: number; tunnel?: boolean }>>) {
    const nativeFetch = vi.fn((url: string) => {
      const { status, tunnel } = responses[url]?.shift() ?? { status: 200 };

      return Promise.resolve(new Response(null, { status, headers: tunnel ? { 'X-Sentry-Tunnel': '1' } : {} }));
    });
    const transport = makeFetchTransport(
      {
        url: TUNNEL_URL,
        headers: { 'X-Custom': '1' },
        _tunnelFallbackUrl: DIRECT_URL,
        recordDroppedEvent: () => undefined,
      },
      nativeFetch as unknown as typeof fetch,
    );
    const sent = (): string[][] =>
      nativeFetch.mock.calls.map(([url], i) => [
        url,
        JSON.parse(String(nativeFetch.mock.calls[i]?.[1]?.body).split('\n')[0]!).event_id,
      ]);

    return { transport, nativeFetch, sent };
  }

  it('sends envelopes to the tunnel as application/x-sentry-envelope so CSRF checks do not treat them as form posts', async () => {
    const { transport, nativeFetch } = setup({});

    await transport.send(makeEnvelope('a'));

    expect(nativeFetch).toHaveBeenCalledWith(
      TUNNEL_URL,
      expect.objectContaining({ headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Custom': '1' } }),
    );
  });

  it.each([404, 405])(
    'sends an envelope directly once, and everything after it, when nothing serves the tunnel and it answers %s',
    async status => {
      const { transport, nativeFetch, sent } = setup({ [TUNNEL_URL]: [{ status }] });

      expect(await transport.send(makeEnvelope('a'))).toEqual(expect.objectContaining({ statusCode: 200 }));
      await transport.send(makeEnvelope('b'));

      expect(sent()).toEqual([
        [TUNNEL_URL, 'a'],
        [DIRECT_URL, 'a'],
        [DIRECT_URL, 'b'],
      ]);
      // Sentry takes the default `text/plain` without a CORS preflight, so the tunnel's content type is dropped.
      expect(nativeFetch).toHaveBeenLastCalledWith(
        DIRECT_URL,
        expect.objectContaining({ headers: { 'X-Custom': '1' } }),
      );
    },
  );

  it.each([403, 404, 405])('keeps using the tunnel when its handler answers %s', async status => {
    const { transport, sent } = setup({ [TUNNEL_URL]: [{ status, tunnel: true }] });

    expect(await transport.send(makeEnvelope('a'))).toEqual(expect.objectContaining({ statusCode: status }));
    await transport.send(makeEnvelope('b'));

    expect(sent()).toEqual([
      [TUNNEL_URL, 'a'],
      [TUNNEL_URL, 'b'],
    ]);
  });

  it.each([200, 400, 401, 403, 413, 500, 503])(
    'keeps using a tunnel the app serves itself when it answers %s',
    async status => {
      const { transport, sent } = setup({ [TUNNEL_URL]: [{ status }] });

      expect(await transport.send(makeEnvelope('a'))).toEqual(expect.objectContaining({ statusCode: status }));
      await transport.send(makeEnvelope('b'));

      expect(sent()).toEqual([
        [TUNNEL_URL, 'a'],
        [TUNNEL_URL, 'b'],
      ]);
    },
  );

  it.each([true, false])('never resends a 429 directly (from the tunnel handler: %s)', async tunnel => {
    const { transport, sent } = setup({ [TUNNEL_URL]: [{ status: 429, tunnel }] });

    expect(await transport.send(makeEnvelope('a'))).toEqual(expect.objectContaining({ statusCode: 429 }));

    expect(sent()).toEqual([[TUNNEL_URL, 'a']]);
  });

  it('sends each envelope directly once when several were already on their way to the tunnel', async () => {
    const { transport, sent } = setup({ [TUNNEL_URL]: [{ status: 404 }, { status: 404 }] });

    await Promise.all([transport.send(makeEnvelope('a')), transport.send(makeEnvelope('b'))]);

    expect(
      sent()
        .filter(([url]) => url === DIRECT_URL)
        .map(([, id]) => id),
    ).toEqual(['a', 'b']);
  });
});
