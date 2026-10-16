import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvelopeEndpointWithUrlEncodedAuth } from '../../../src/api';
import { getCurrentScope, setCurrentClient } from '../../../src';
import { isTracingSuppressed } from '../../../src/tracing/trace';
import { makeDsn } from '../../../src/utils/dsn';
import { createEnvelope, serializeEnvelope } from '../../../src/utils/envelope';
import {
  getTunnelPath,
  getTunnelIgnoreSpanFilter,
  getTunnelPaths,
  handleTunnelRequest,
  handleTunnelRequestIfMatched,
  isTunnelRequest,
  resolveServerTunnelOption,
} from '../../../src/utils/tunnel';
import type { TunnelOptions } from '../../../src/types/options';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

const TEST_DSN = 'https://public@dsn.ingest.sentry.io/1337';

function makeEnvelopeRequest(envelopeHeader: Record<string, unknown>, url = 'http://localhost/tunnel'): Request {
  const envelope = createEnvelope(envelopeHeader, []);
  const body = serializeEnvelope(envelope);

  return new Request(url, { method: 'POST', body });
}

/**
 * A request whose body starts with `head` and then never ends, so buffering it would hang the test.
 */
function makeEndlessRequest(head: string, onCancel?: () => void): Request {
  const filler = new Uint8Array(16 * 1024).fill(0x61);
  let sentHead = false;

  return new Request('http://localhost/tunnel', {
    method: 'POST',
    duplex: 'half',
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(sentHead ? filler : new TextEncoder().encode(head));
        sentHead = true;
      },
      cancel: onCancel,
    }),
  } as RequestInit);
}

describe('handleTunnelRequest', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    getCurrentScope().setClient(undefined);
  });

  it('forwards the envelope to Sentry and returns the upstream response', async () => {
    const upstreamResponse = new Response('ok', { status: 200 });
    fetchMock.mockResolvedValueOnce(upstreamResponse);

    const result = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }),
      allowedDsns: [TEST_DSN],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(getEnvelopeEndpointWithUrlEncodedAuth(makeDsn(TEST_DSN)!));
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-sentry-envelope' });
    expect(await new Response(init.body).text()).toBe(serializeEnvelope(createEnvelope({ dsn: TEST_DSN }, [])));

    expect(result).toBe(upstreamResponse);
  });

  it('forwards the content length of the incoming request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok'));
    const body = `${JSON.stringify({ dsn: TEST_DSN })}\n`;

    await handleTunnelRequest({
      request: new Request('http://localhost/tunnel', {
        method: 'POST',
        body,
        headers: { 'content-length': String(body.length) },
      }),
      allowedDsns: [TEST_DSN],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-sentry-envelope', 'Content-Length': String(body.length) },
      }),
    );
  });

  it.each([
    ['cf-connecting-ip', { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }, '1.1.1.1'],
    ['x-vercel-forwarded-for', { 'x-vercel-forwarded-for': '3.3.3.3', 'x-forwarded-for': '2.2.2.2' }, '3.3.3.3'],
    ['x-forwarded-for', { 'x-forwarded-for': '2.2.2.2, 10.0.0.1' }, '2.2.2.2, 10.0.0.1'],
  ])('forwards the client IP from %s', async (_, incomingHeaders, forwardedFor) => {
    fetchMock.mockResolvedValueOnce(new Response('ok'));

    await handleTunnelRequest({
      request: new Request('http://localhost/tunnel', {
        method: 'POST',
        body: `${JSON.stringify({ dsn: TEST_DSN })}\n`,
        headers: incomingHeaders,
      }),
      allowedDsns: [TEST_DSN],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Sentry-Forwarded-For': forwardedFor }),
      }),
    );
  });

  it('rejects a disallowed DSN after reading only the envelope header', async () => {
    const result = await handleTunnelRequest({
      request: makeEndlessRequest(`${JSON.stringify({ dsn: 'https://other@example.com/9999' })}\n`),
      allowedDsns: [TEST_DSN],
    });

    expect(result.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels the body of a rejected request', async () => {
    const onCancel = vi.fn();

    await handleTunnelRequest({
      request: makeEndlessRequest(`${JSON.stringify({ dsn: 'https://other@example.com/9999' })}\n`, onCancel),
      allowedDsns: [TEST_DSN],
    });

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('streams an allowed envelope to Sentry without reading the rest of the body', async () => {
    const upstreamResponse = new Response('ok');
    fetchMock.mockResolvedValueOnce(upstreamResponse);

    const result = await handleTunnelRequest({
      request: makeEndlessRequest(`${JSON.stringify({ dsn: TEST_DSN })}\n`),
      allowedDsns: [TEST_DSN],
    });

    expect(result).toBe(upstreamResponse);
  });

  it('returns 400 when the envelope header line exceeds the limit', async () => {
    const result = await handleTunnelRequest({
      request: makeEndlessRequest(''),
      allowedDsns: [TEST_DSN],
    });

    expect(result.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 500 when allowedDsns is empty', async () => {
    const result = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }),
      allowedDsns: [],
    });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(500);
    expect(await result.text()).toBe('Tunnel not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the envelope has no DSN in the header', async () => {
    const result = await handleTunnelRequest({
      request: makeEnvelopeRequest({}),
      allowedDsns: [TEST_DSN],
    });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(400);
    expect(await result.text()).toBe('Invalid envelope: missing DSN');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the envelope body contains malformed JSON', async () => {
    const result = await handleTunnelRequest({
      request: new Request('http://localhost/tunnel', {
        method: 'POST',
        body: 'not valid envelope data{{{',
        headers: { 'content-length': '26' },
      }),
      allowedDsns: [TEST_DSN],
    });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(400);
    expect(await result.text()).toBe('Invalid envelope');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the envelope DSN is not in allowedDsns', async () => {
    const result = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: 'https://other@example.com/9999' }),
      allowedDsns: [TEST_DSN],
    });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(403);
    expect(await result.text()).toBe('DSN not allowed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the DSN string cannot be parsed into components', async () => {
    const malformedDsn = 'not-a-valid-dsn';

    const result = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: malformedDsn }),
      allowedDsns: [malformedDsn],
    });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(403);
    expect(await result.text()).toBe('Invalid DSN');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the envelope when multiple DSNs are configured', async () => {
    const otherDsn = 'https://other@example.com/9999';
    const upstreamResponse = new Response('ok', { status: 200 });
    fetchMock.mockResolvedValueOnce(upstreamResponse);

    const result = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }),
      allowedDsns: [otherDsn, TEST_DSN],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(getEnvelopeEndpointWithUrlEncodedAuth(makeDsn(TEST_DSN)!));
    expect(result).toBe(upstreamResponse);
  });

  it('returns 500 when fetch throws a network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network failure'));

    const result = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }),
      allowedDsns: [TEST_DSN],
    });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(500);
    expect(await result.text()).toBe('Failed to forward envelope to Sentry');
  });

  it('forwards with tracing suppressed so the forward does not create a span', async () => {
    let suppressed: boolean | undefined;
    fetchMock.mockImplementationOnce(() => {
      suppressed = isTracingSuppressed();

      return Promise.resolve(new Response('ok'));
    });

    await handleTunnelRequest({ request: makeEnvelopeRequest({ dsn: TEST_DSN }), allowedDsns: [TEST_DSN] });

    expect(suppressed).toBe(true);
  });

  it('defaults allowedDsns to the DSN of the active client', async () => {
    setTestClient(TEST_DSN);
    fetchMock.mockResolvedValueOnce(new Response('ok'));

    const result = await handleTunnelRequest({ request: makeEnvelopeRequest({ dsn: TEST_DSN }) });

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      getEnvelopeEndpointWithUrlEncodedAuth(makeDsn(TEST_DSN)!),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns 500 when allowedDsns is omitted and there is no client', async () => {
    const result = await handleTunnelRequest({ request: makeEnvelopeRequest({ dsn: TEST_DSN }) });

    expect(result.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getTunnelPath', () => {
  it('returns a short opaque path that does not leak the DSN', () => {
    const path = getTunnelPath(TEST_DSN);

    expect(path).toMatch(/^\/[0-9a-z]{1,7}$/);
    expect(path).not.toContain('sentry');
  });

  // Browser and server SDKs of different versions must derive the same path, so the hash must never change.
  it('derives a fixed path for a known DSN', () => {
    expect(getTunnelPath(TEST_DSN)).toBe('/fdv680');
  });

  it('is stable for the same DSN and differs between DSNs', () => {
    expect(getTunnelPath(TEST_DSN)).toBe(getTunnelPath(TEST_DSN));
    expect(getTunnelPath(TEST_DSN)).not.toBe(getTunnelPath('https://public@dsn.ingest.sentry.io/1338'));
  });

  it('ignores DSN formatting differences so browser and server derive the same path', () => {
    expect(getTunnelPath('https://public:secret@dsn.ingest.sentry.io/1337')).toBe(getTunnelPath(TEST_DSN));
    expect(getTunnelPath(makeDsn(TEST_DSN)!)).toBe(getTunnelPath(TEST_DSN));
  });

  it('returns undefined for an invalid DSN', () => {
    expect(getTunnelPath('not-a-dsn')).toBeUndefined();
  });

  it('parses each DSN string once, so an invalid DSN logs once', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    getTunnelPath('also-not-a-dsn');
    getTunnelPath('also-not-a-dsn');

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    consoleErrorSpy.mockRestore();
  });
});

describe('isTunnelRequest', () => {
  const tunnelPath = getTunnelPath(TEST_DSN)!;

  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('matches a POST to the tunnel path of an allowed DSN', () => {
    expect(isTunnelRequest({ method: 'POST', url: tunnelPath }, { allowedDsns: [TEST_DSN] })).toBe(true);
    expect(isTunnelRequest({ method: 'POST', url: `${tunnelPath}/` }, { allowedDsns: [TEST_DSN] })).toBe(true);
  });

  it('does not match other methods, other paths, or path prefixes', () => {
    expect(isTunnelRequest({ method: 'GET', url: tunnelPath }, { allowedDsns: [TEST_DSN] })).toBe(false);
    expect(isTunnelRequest({ method: 'POST', url: '/somewhere' }, { allowedDsns: [TEST_DSN] })).toBe(false);
    expect(isTunnelRequest({ method: 'POST', url: `${tunnelPath}x` }, { allowedDsns: [TEST_DSN] })).toBe(false);
  });

  it('does not match the tunnel path of a DSN that is not allowed', () => {
    const otherDsn = 'https://other@example.com/9999';

    expect(isTunnelRequest({ method: 'POST', url: getTunnelPath(otherDsn)! }, { allowedDsns: [TEST_DSN] })).toBe(false);
  });

  it('uses the managed tunnel config of the active client when no options are passed', () => {
    setTestClient(TEST_DSN);
    expect(isTunnelRequest({ method: 'POST', url: tunnelPath })).toBe(false);

    setTestClient(TEST_DSN, {});
    expect(isTunnelRequest({ method: 'POST', url: tunnelPath })).toBe(true);
  });

  it('matches nothing without a client', () => {
    expect(isTunnelRequest({ method: 'POST', url: tunnelPath })).toBe(false);
    expect(isTunnelRequest({ method: 'POST', url: tunnelPath }, {})).toBe(false);
  });

  it('matches under a base path', () => {
    expect(
      isTunnelRequest({ method: 'POST', url: `/docs${tunnelPath}` }, { allowedDsns: [TEST_DSN], basePath: '/docs/' }),
    ).toBe(true);
    expect(
      isTunnelRequest({ method: 'POST', url: `/docsx${tunnelPath}` }, { allowedDsns: [TEST_DSN], basePath: '/docs' }),
    ).toBe(false);
  });

  it('matches nothing outside the base path', () => {
    expect(isTunnelRequest({ method: 'POST', url: tunnelPath }, { allowedDsns: [TEST_DSN], basePath: '/docs' })).toBe(
      false,
    );
    expect(isTunnelRequest({ method: 'POST', url: '/monitor' }, { path: '/monitor', basePath: '/docs' })).toBe(false);
  });
});

describe('isTunnelRequest request shapes', () => {
  const tunnelPath = getTunnelPath(TEST_DSN)!;

  it('accepts a fetch Request with an absolute URL and query', () => {
    const request = new Request(`https://example.com${tunnelPath}?o=1`, { method: 'POST' });

    expect(isTunnelRequest(request, { allowedDsns: [TEST_DSN] })).toBe(true);
  });

  it('accepts a Node IncomingMessage-like object', () => {
    const incomingMessage = { method: 'POST', url: `${tunnelPath}?o=1`, headers: { host: 'example.com' } };

    expect(isTunnelRequest(incomingMessage, { allowedDsns: [TEST_DSN] })).toBe(true);
  });

  it('does not match without a URL', () => {
    expect(isTunnelRequest({ method: 'POST' }, { allowedDsns: [TEST_DSN] })).toBe(false);
  });
});

describe('getTunnelPaths', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('returns one path per allowed DSN and skips invalid ones', () => {
    const otherDsn = 'https://other@o2.ingest.sentry.io/42';

    expect(getTunnelPaths({ allowedDsns: [TEST_DSN, otherDsn, 'not-a-dsn'] })).toEqual([
      getTunnelPath(TEST_DSN),
      getTunnelPath(otherDsn),
    ]);
  });

  it('returns a fixed path instead of the DSN-derived ones', () => {
    expect(getTunnelPaths({ path: '/monitor', allowedDsns: [TEST_DSN] })).toEqual(['/monitor']);
    expect(isTunnelRequest({ method: 'POST', url: '/monitor' }, { path: '/monitor', allowedDsns: [TEST_DSN] })).toBe(
      true,
    );
  });

  it('matches a fixed path that ends with a slash', () => {
    expect(isTunnelRequest({ method: 'POST', url: '/monitor' }, { path: '/monitor/' })).toBe(true);
    expect(isTunnelRequest({ method: 'POST', url: '/monitor/' }, { path: '/monitor/' })).toBe(true);
  });

  it('uses the managed tunnel config of the active client', () => {
    expect(getTunnelPaths()).toEqual([]);

    setTestClient(TEST_DSN);
    expect(getTunnelPaths()).toEqual([]);

    setTestClient(TEST_DSN, {});
    expect(getTunnelPaths()).toEqual([getTunnelPath(TEST_DSN)]);
  });
});

describe('handleTunnelRequestIfMatched', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    getCurrentScope().setClient(undefined);
  });

  it('forwards a matching request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok'));
    const request = makeEnvelopeRequest({ dsn: TEST_DSN }, `http://localhost${getTunnelPath(TEST_DSN)}`);

    const result = await handleTunnelRequestIfMatched(request, { allowedDsns: [TEST_DSN] });

    expect(result?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('forwards using the allowedDsns of the active client managed tunnel config', async () => {
    const browserDsn = 'https://browser@o1.ingest.sentry.io/42';
    setTestClient(TEST_DSN, { allowedDsns: [browserDsn] });
    fetchMock.mockResolvedValueOnce(new Response('ok'));
    const request = makeEnvelopeRequest({ dsn: browserDsn }, `http://localhost${getTunnelPath(browserDsn)}`);

    const result = await handleTunnelRequestIfMatched(request);

    expect(result?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      getEnvelopeEndpointWithUrlEncodedAuth(makeDsn(browserDsn)!),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns undefined without reading the body when the request does not match', () => {
    const request = makeEnvelopeRequest({ dsn: TEST_DSN }, 'http://localhost/api/users');

    expect(handleTunnelRequestIfMatched(request, { allowedDsns: [TEST_DSN] })).toBeUndefined();
    expect(request.bodyUsed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getTunnelIgnoreSpanFilter', () => {
  function urlPathMatcher(filter: ReturnType<typeof getTunnelIgnoreSpanFilter>): RegExp {
    return (filter as { attributes: { 'url.path': RegExp } }).attributes['url.path'];
  }

  it("matches the tunnel path of the client's DSN, with or without a trailing slash", () => {
    const matcher = urlPathMatcher(getTunnelIgnoreSpanFilter({}, makeDsn(TEST_DSN)));
    const tunnelPath = getTunnelPath(TEST_DSN)!;

    expect(matcher.test(tunnelPath)).toBe(true);
    expect(matcher.test(`${tunnelPath}/`)).toBe(true);
    expect(matcher.test(`${tunnelPath}x`)).toBe(false);
    expect(matcher.test('/api/users')).toBe(false);
  });

  it('follows allowedDsns, a fixed path and the base path', () => {
    const otherDsn = 'https://other@o2.ingest.sentry.io/42';

    expect(
      urlPathMatcher(getTunnelIgnoreSpanFilter({ allowedDsns: [otherDsn] }, makeDsn(TEST_DSN))).test(
        getTunnelPath(otherDsn)!,
      ),
    ).toBe(true);
    expect(urlPathMatcher(getTunnelIgnoreSpanFilter({ path: '/monitor' }, undefined)).test('/monitor')).toBe(true);
    expect(urlPathMatcher(getTunnelIgnoreSpanFilter({ path: '/monitor/' }, undefined)).test('/monitor')).toBe(true);
    expect(
      urlPathMatcher(getTunnelIgnoreSpanFilter({ basePath: '/app/' }, makeDsn(TEST_DSN))).test(
        `/app${getTunnelPath(TEST_DSN)}`,
      ),
    ).toBe(true);
    expect(
      urlPathMatcher(getTunnelIgnoreSpanFilter({ basePath: '/app' }, makeDsn(TEST_DSN))).test(getTunnelPath(TEST_DSN)!),
    ).toBe(false);
  });

  it('returns nothing when there is no path to match', () => {
    expect(getTunnelIgnoreSpanFilter({}, undefined)).toBeUndefined();
  });
});

describe('client with the managed tunnel enabled', () => {
  it('ignores the server spans of tunnel requests and keeps user filters', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: TEST_DSN, _managedTunnel: {}, ignoreSpans: ['user-filter'] }),
    );
    const ignoreSpans = client.getOptions().ignoreSpans!;

    expect(ignoreSpans[0]).toBe('user-filter');
    expect(
      (ignoreSpans[1] as { attributes: { 'url.path': RegExp } }).attributes['url.path'].test(getTunnelPath(TEST_DSN)!),
    ).toBe(true);
  });

  it('leaves ignoreSpans alone without the managed tunnel', () => {
    const client = new TestClient(getDefaultTestClientOptions({ dsn: TEST_DSN }));

    expect(client.getOptions().ignoreSpans).toBeUndefined();
  });
});

describe('resolveServerTunnelOption', () => {
  it('keeps a URL as the transport tunnel', () => {
    expect(resolveServerTunnelOption('https://example.com/tunnel')).toEqual({ tunnel: 'https://example.com/tunnel' });
  });

  it('enables the managed tunnel for `true` and options, and leaves the transport untunneled', () => {
    expect(resolveServerTunnelOption(true)).toEqual({ tunnel: undefined, _managedTunnel: {} });
    expect(resolveServerTunnelOption({ allowedDsns: [TEST_DSN] })).toEqual({
      tunnel: undefined,
      _managedTunnel: { allowedDsns: [TEST_DSN] },
    });
  });

  it('serves a relative path instead of using it as the transport tunnel', () => {
    expect(resolveServerTunnelOption('/monitor')).toEqual({ tunnel: undefined, _managedTunnel: { path: '/monitor' } });
  });

  it('leaves everything off when unset', () => {
    expect(resolveServerTunnelOption(undefined)).toEqual({ tunnel: undefined });
  });
});

function setTestClient(dsn: string, managedTunnel?: TunnelOptions): void {
  setCurrentClient(new TestClient(getDefaultTestClientOptions({ dsn, _managedTunnel: managedTunnel })));
}
