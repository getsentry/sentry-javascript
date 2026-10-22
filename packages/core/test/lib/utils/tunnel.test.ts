import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvelopeEndpointWithUrlEncodedAuth } from '../../../src/api';
import { getCurrentScope, setCurrentClient } from '../../../src';
import { isTracingSuppressed } from '../../../src/tracing/trace';
import { makeDsn } from '../../../src/utils/dsn';
import { createEnvelope, serializeEnvelope } from '../../../src/utils/envelope';
import {
  applyTunnelDefaults,
  getTunnelPath,
  getTunnelIgnoreSpanFilters,
  getTunnelPaths,
  handleTunnelRequest,
  handleTunnelRequestIfMatched,
  isTunnelRequest,
  normalizeTunnelBasePath,
  resolveAllowedDsns,
  resolveServerTunnelOption,
  resolveTunnelPaths,
  MAX_TUNNEL_BODY_SIZE,
} from '../../../src/utils/tunnel';
import {
  _INTERNAL_resetManagedTunnelDefaults,
  applyManagedTunnelDefaults,
  setManagedTunnelDefaults,
} from '../../../src/utils/managedTunnelDefaults';
import type { DsnComponents } from '../../../src/types/dsn';
import type { IgnoreSpanFilter, ServerTunnelOptions } from '../../../src/types/options';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';
import { ServerRuntimeClient } from '../../../src/server-runtime-client';

const TEST_DSN = 'https://public@dsn.ingest.sentry.io/1337';

/** The `url.path` filter, the first of the tunnel span filters. */
function getTunnelIgnoreSpanFilter(
  tunnelOptions: ServerTunnelOptions,
  dsn: DsnComponents | undefined,
): IgnoreSpanFilter | undefined {
  const paths = resolveTunnelPaths(tunnelOptions, resolveAllowedDsns(tunnelOptions.allowedDsns, dsn));

  return getTunnelIgnoreSpanFilters(tunnelOptions, paths)[0];
}

function makeEnvelopeRequest(
  envelopeHeader: Record<string, unknown>,
  url = 'http://localhost/tunnel',
  contentLength?: number,
): Request {
  const body = serializeEnvelope(createEnvelope(envelopeHeader, []));
  const length = contentLength ?? new TextEncoder().encode(body as string).length;

  return new Request(url, { method: 'POST', body, headers: { 'content-length': String(length) } });
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
    headers: { 'content-length': String(MAX_TUNNEL_BODY_SIZE) },
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

  it('forwards the envelope when Content-Length equals the limit', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok'));

    const result = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }, undefined, MAX_TUNNEL_BODY_SIZE),
      allowedDsns: [TEST_DSN],
    });

    expect(result.status).toBe(200);
  });

  it('returns 413 when Content-Length is above the limit, without reading the body', async () => {
    const request = makeEnvelopeRequest({ dsn: TEST_DSN }, undefined, MAX_TUNNEL_BODY_SIZE + 1);

    const result = await handleTunnelRequest({ request, allowedDsns: [TEST_DSN] });

    expect(result.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 411 when the request has no Content-Length', async () => {
    const result = await handleTunnelRequest({
      request: new Request('http://localhost/tunnel', {
        method: 'POST',
        body: `${JSON.stringify({ dsn: TEST_DSN })}\n`,
      }),
      allowedDsns: [TEST_DSN],
    });

    expect(result.status).toBe(411);
    expect(fetchMock).not.toHaveBeenCalled();
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

    expect(result.status).toBe(200);
    expect(await result.text()).toBe('ok');
  });

  it("marks every response it returns as the tunnel's, so the browser can tell it from a static host", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } }),
    );

    const forwarded = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }),
      allowedDsns: [TEST_DSN],
    });
    const rejected = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: 'https://public@other.ingest.sentry.io/1' }),
      allowedDsns: [TEST_DSN],
    });

    expect(forwarded.headers.get('X-Sentry-Tunnel')).toBe('1');
    expect(forwarded.headers.get('Content-Type')).toBe('application/json');
    // `fetch` already decoded the body, so the original encoding would make the browser decode it twice.
    expect(forwarded.headers.get('Content-Encoding')).toBeNull();
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get('X-Sentry-Tunnel')).toBe('1');
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
        headers: { ...incomingHeaders, 'content-length': '1' },
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

    expect(await result.text()).toBe('ok');
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

  it('ignores an allowed DSN that cannot be parsed', async () => {
    const malformedDsn = 'not-a-valid-dsn';

    const result = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: malformedDsn }),
      allowedDsns: [malformedDsn],
    });

    expect(result.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('matches an allowed DSN written with a secret key, which the envelope header leaves out', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const result = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }),
      allowedDsns: [TEST_DSN.replace('@', ':secret@')],
    });

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
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
    expect(await result.text()).toBe('ok');
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

  it('accepts the DSN of the active client on top of allowedDsns', async () => {
    setTestClient(TEST_DSN);
    fetchMock.mockResolvedValue(new Response('ok'));

    const ownDsnResult = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }),
      allowedDsns: ['https://browser@o2.ingest.sentry.io/42'],
    });
    const unlistedDsnResult = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: 'https://other@o3.ingest.sentry.io/7' }),
      allowedDsns: ['https://browser@o2.ingest.sentry.io/42'],
    });

    expect(ownDsnResult.status).toBe(200);
    expect(unlistedDsnResult.status).toBe(403);
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
});

describe('isTunnelRequest', () => {
  const tunnelPath = getTunnelPath(TEST_DSN)!;

  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('matches a POST to the tunnel path of an allowed DSN', () => {
    expect(isTunnelRequestFor({ method: 'POST', url: tunnelPath }, { allowedDsns: [TEST_DSN] })).toBe(true);
    expect(isTunnelRequestFor({ method: 'POST', url: `${tunnelPath}/` }, { allowedDsns: [TEST_DSN] })).toBe(true);
  });

  it('does not match other methods, other paths, or path prefixes', () => {
    expect(isTunnelRequestFor({ method: 'GET', url: tunnelPath }, { allowedDsns: [TEST_DSN] })).toBe(false);
    expect(isTunnelRequestFor({ method: 'POST', url: '/somewhere' }, { allowedDsns: [TEST_DSN] })).toBe(false);
    expect(isTunnelRequestFor({ method: 'POST', url: `${tunnelPath}x` }, { allowedDsns: [TEST_DSN] })).toBe(false);
  });

  it('does not match the tunnel path of a DSN that is not allowed', () => {
    const otherDsn = 'https://other@example.com/9999';

    expect(isTunnelRequestFor({ method: 'POST', url: getTunnelPath(otherDsn)! }, { allowedDsns: [TEST_DSN] })).toBe(
      false,
    );
  });

  it('uses the managed tunnel config of the active client when no options are passed', () => {
    setTestClient(TEST_DSN);
    expect(isTunnelRequest({ method: 'POST', url: tunnelPath })).toBe(false);

    setTestClient(TEST_DSN, {});
    expect(isTunnelRequest({ method: 'POST', url: tunnelPath })).toBe(true);
  });

  it('matches nothing without a client', () => {
    expect(isTunnelRequest({ method: 'POST', url: tunnelPath })).toBe(false);
  });

  it('matches under a base path', () => {
    expect(
      isTunnelRequestFor(
        { method: 'POST', url: `/docs${tunnelPath}` },
        { allowedDsns: [TEST_DSN], basePath: '/docs/' },
      ),
    ).toBe(true);
    expect(
      isTunnelRequestFor(
        { method: 'POST', url: `/docsx${tunnelPath}` },
        { allowedDsns: [TEST_DSN], basePath: '/docs' },
      ),
    ).toBe(false);
  });

  it('matches nothing outside the base path', () => {
    expect(
      isTunnelRequestFor({ method: 'POST', url: tunnelPath }, { allowedDsns: [TEST_DSN], basePath: '/docs' }),
    ).toBe(false);
    expect(isTunnelRequestFor({ method: 'POST', url: '/monitor' }, { path: '/monitor', basePath: '/docs' })).toBe(
      false,
    );
  });
});

describe('isTunnelRequest request shapes', () => {
  const tunnelPath = getTunnelPath(TEST_DSN)!;

  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('accepts a fetch Request with an absolute URL and query', () => {
    const request = new Request(`https://example.com${tunnelPath}?o=1`, { method: 'POST' });

    expect(isTunnelRequestFor(request, { allowedDsns: [TEST_DSN] })).toBe(true);
  });

  it('accepts a Node IncomingMessage-like object', () => {
    const incomingMessage = { method: 'POST', url: `${tunnelPath}?o=1`, headers: { host: 'example.com' } };

    expect(isTunnelRequestFor(incomingMessage, { allowedDsns: [TEST_DSN] })).toBe(true);
  });

  it('does not match without a URL', () => {
    expect(isTunnelRequestFor({ method: 'POST' }, { allowedDsns: [TEST_DSN] })).toBe(false);
  });
});

describe('getTunnelPaths', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('returns one path per allowed DSN and skips invalid ones', () => {
    const otherDsn = 'https://other@o2.ingest.sentry.io/42';

    expect(resolveTunnelPaths({}, [TEST_DSN, otherDsn, 'not-a-dsn'])).toEqual([
      getTunnelPath(TEST_DSN),
      getTunnelPath(otherDsn),
    ]);
  });

  it('returns a fixed path instead of the DSN-derived ones', () => {
    expect(resolveTunnelPaths({ path: '/monitor' }, [TEST_DSN])).toEqual(['/monitor']);
    expect(isTunnelRequestFor({ method: 'POST', url: '/monitor' }, { path: '/monitor', allowedDsns: [TEST_DSN] })).toBe(
      true,
    );
  });

  it('ignores a root fixed path, so the tunnel does not take over POSTs to the root', () => {
    expect(resolveTunnelPaths({ path: '/' }, [TEST_DSN])).toEqual([getTunnelPath(TEST_DSN)]);
    expect(isTunnelRequestFor({ method: 'POST', url: '/' }, { path: '/', allowedDsns: [TEST_DSN] })).toBe(false);
  });

  it('matches a fixed path that ends with a slash', () => {
    expect(isTunnelRequestFor({ method: 'POST', url: '/monitor' }, { path: '/monitor/' })).toBe(true);
    expect(isTunnelRequestFor({ method: 'POST', url: '/monitor/' }, { path: '/monitor/' })).toBe(true);
  });

  it('serves the path of the active client DSN on top of allowedDsns, once', () => {
    const browserDsn = 'https://browser@o2.ingest.sentry.io/42';
    setTestClient(TEST_DSN, { allowedDsns: [browserDsn, TEST_DSN] });

    expect(getTunnelPaths()).toEqual([getTunnelPath(browserDsn), getTunnelPath(TEST_DSN)]);
  });

  it('uses the managed tunnel config of the active client', () => {
    expect(getTunnelPaths()).toEqual([]);

    setTestClient(TEST_DSN);
    expect(getTunnelPaths()).toEqual([]);

    setTestClient(TEST_DSN, {});
    expect(getTunnelPaths()).toEqual([getTunnelPath(TEST_DSN)]);
  });

  it('derives the paths once per client, so an invalid DSN in allowedDsns logs once', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setTestClient(TEST_DSN, { allowedDsns: ['also-not-a-dsn'] });

    isTunnelRequest({ method: 'POST', url: getTunnelPath(TEST_DSN) });
    isTunnelRequest({ method: 'POST', url: getTunnelPath(TEST_DSN) });

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    consoleErrorSpy.mockRestore();
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
    setTestClient(TEST_DSN, {});
    const request = makeEnvelopeRequest({ dsn: TEST_DSN }, `http://localhost${getTunnelPath(TEST_DSN)}`);

    const result = await handleTunnelRequestIfMatched(request);

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

  it('leaves a fixed path to the app when there is no DSN to forward to', () => {
    setTestClient(undefined, { path: '/monitor' });
    const request = makeEnvelopeRequest({ dsn: TEST_DSN }, 'http://localhost/monitor');

    expect(handleTunnelRequestIfMatched(request)).toBeUndefined();
    expect(request.bodyUsed).toBe(false);
  });

  it('returns undefined without reading the body when the request does not match', () => {
    setTestClient(TEST_DSN, {});
    const request = makeEnvelopeRequest({ dsn: TEST_DSN }, 'http://localhost/api/users');

    expect(handleTunnelRequestIfMatched(request)).toBeUndefined();
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
    expect(
      urlPathMatcher(getTunnelIgnoreSpanFilter({ allowedDsns: [otherDsn] }, makeDsn(TEST_DSN))).test(
        getTunnelPath(TEST_DSN)!,
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

describe('server client with the managed tunnel enabled', () => {
  it('ignores the server spans of tunnel requests and keeps user filters', () => {
    const client = new ServerRuntimeClient(
      getDefaultTestClientOptions({ dsn: TEST_DSN, _managedTunnel: {}, ignoreSpans: ['user-filter'] }),
    );
    const ignoreSpans = client.getOptions().ignoreSpans!;

    expect(ignoreSpans[0]).toBe('user-filter');
    expect(
      (ignoreSpans[1] as { attributes: { 'url.path': RegExp } }).attributes['url.path'].test(getTunnelPath(TEST_DSN)!),
    ).toBe(true);
  });

  it('leaves ignoreSpans alone without the managed tunnel, and in non-server clients', () => {
    expect(
      new ServerRuntimeClient(getDefaultTestClientOptions({ dsn: TEST_DSN })).getOptions().ignoreSpans,
    ).toBeUndefined();
    expect(
      new TestClient(getDefaultTestClientOptions({ dsn: TEST_DSN, _managedTunnel: {} })).getOptions().ignoreSpans,
    ).toBeUndefined();
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

describe('applyTunnelDefaults', () => {
  it('fills in the defaults for `true` and options, and lets options the user set win', () => {
    const serverTunnel: ServerTunnelOptions = { allowedDsns: [TEST_DSN] };

    expect(applyTunnelDefaults(true, { basePath: '/app' })).toEqual({ basePath: '/app' });
    expect(applyTunnelDefaults(serverTunnel, { basePath: '/app' })).toEqual({
      basePath: '/app',
      allowedDsns: [TEST_DSN],
    });
    expect(applyTunnelDefaults({ basePath: '/custom' }, { basePath: '/app' })).toEqual({ basePath: '/custom' });
  });

  it('treats a relative path as a managed tunnel with that path', () => {
    expect(applyTunnelDefaults('/monitor', { basePath: '/app' })).toEqual({ basePath: '/app', path: '/monitor' });
  });

  it('does not add the base path again to a path that already starts with it', () => {
    expect(applyTunnelDefaults('/app/monitor', { basePath: '/app' })).toEqual({ basePath: '/app', path: '/monitor' });
    expect(applyTunnelDefaults({ path: '/app/monitor' }, { basePath: '/app' })).toEqual({
      basePath: '/app',
      path: '/monitor',
    });
    expect(applyTunnelDefaults('/application/monitor', { basePath: '/app' })).toEqual({
      basePath: '/app',
      path: '/application/monitor',
    });
  });

  it('leaves a URL, an unset tunnel and empty defaults alone', () => {
    expect(applyTunnelDefaults('https://example.com/tunnel', { basePath: '/app' })).toBe('https://example.com/tunnel');
    expect(applyTunnelDefaults(undefined, { basePath: '/app' })).toBeUndefined();
    expect(applyTunnelDefaults('/monitor', {})).toBe('/monitor');
    expect(applyTunnelDefaults(true, undefined)).toBe(true);
  });

  it('normalizes the default base path and ignores a root one', () => {
    expect(applyTunnelDefaults(true, { basePath: 'app/' })).toEqual({ basePath: '/app' });
    expect(applyTunnelDefaults(true, { basePath: '/' })).toBe(true);
    expect(applyTunnelDefaults(true, { basePath: undefined })).toBe(true);
  });
});

describe('normalizeTunnelBasePath', () => {
  it.each([
    ['/app', '/app'],
    ['/app/', '/app'],
    ['app', '/app'],
    ['./app/', '/app'],
    ['./', ''],
    ['/', ''],
    ['', ''],
    [undefined, ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeTunnelBasePath(input)).toBe(expected);
  });
});

describe('setManagedTunnelDefaults', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
    _INTERNAL_resetManagedTunnelDefaults();
  });

  it('serves the tunnel under the base path and drops its spans there', () => {
    setTestClient(TEST_DSN, {});
    const client = getCurrentScope().getClient()!;

    setManagedTunnelDefaults({ basePath: '/app/' });

    expect(client.getOptions()._managedTunnel).toEqual({ basePath: '/app' });
    expect(isTunnelRequest({ method: 'POST', url: `/app${getTunnelPath(TEST_DSN)}` })).toBe(true);
    expect(isTunnelRequest({ method: 'POST', url: getTunnelPath(TEST_DSN) })).toBe(false);
    expect(client.getOptions().ignoreSpans).toContainEqual(
      getTunnelIgnoreSpanFilter({ basePath: '/app' }, makeDsn(TEST_DSN)),
    );
  });

  it('does not add the base path again to a fixed path that already starts with it', () => {
    setTestClient(TEST_DSN, { path: '/app/monitor' });
    const client = getCurrentScope().getClient()!;

    setManagedTunnelDefaults({ basePath: '/app' });

    expect(client.getOptions()._managedTunnel).toEqual({ basePath: '/app', path: '/monitor' });
    expect(isTunnelRequest({ method: 'POST', url: '/app/monitor' })).toBe(true);
    expect(isTunnelRequest({ method: 'POST', url: '/app/app/monitor' })).toBe(false);
  });

  it('keeps a base path the user set, and does nothing without a managed tunnel or a base path', () => {
    setTestClient(TEST_DSN, { basePath: '/custom' });
    const client = getCurrentScope().getClient()!;
    setManagedTunnelDefaults({ basePath: '/app' });
    expect(client.getOptions()._managedTunnel).toEqual({ basePath: '/custom' });
    _INTERNAL_resetManagedTunnelDefaults();

    setTestClient(TEST_DSN, {});
    const rootClient = getCurrentScope().getClient()!;
    setManagedTunnelDefaults({ basePath: '/' });
    expect(rootClient.getOptions()._managedTunnel).toEqual({});
    _INTERNAL_resetManagedTunnelDefaults();

    setTestClient(TEST_DSN);
    const offClient = getCurrentScope().getClient()!;
    setManagedTunnelDefaults({ basePath: '/app' });
    expect(offClient.getOptions()._managedTunnel).toBeUndefined();
  });

  it('enables the tunnel on clients created later, unless their `init` set one', () => {
    setManagedTunnelDefaults({ tunnel: { path: '/monitor' }, basePath: '/app' });

    setTestClient(TEST_DSN);
    const laterClient = getCurrentScope().getClient()!;
    applyManagedTunnelDefaults(laterClient);
    expect(laterClient.getOptions()._managedTunnel).toEqual({ path: '/monitor', basePath: '/app' });
    expect(laterClient.getOptions().ignoreSpans).toContainEqual(
      getTunnelIgnoreSpanFilter({ path: '/monitor', basePath: '/app' }, makeDsn(TEST_DSN)),
    );

    setTestClient(TEST_DSN, { path: '/from-init' });
    const initClient = getCurrentScope().getClient()!;
    applyManagedTunnelDefaults(initClient);
    expect(initClient.getOptions()._managedTunnel).toEqual({ path: '/from-init', basePath: '/app' });
  });
});

function setTestClient(dsn: string | undefined, managedTunnel?: ServerTunnelOptions): void {
  setCurrentClient(new ServerRuntimeClient(getDefaultTestClientOptions({ dsn, _managedTunnel: managedTunnel })));
}

/** `isTunnelRequest` for a server client with this managed tunnel and no DSN of its own. */
function isTunnelRequestFor(
  request: Parameters<typeof isTunnelRequest>[0],
  managedTunnel: ServerTunnelOptions,
): boolean {
  setTestClient(undefined, managedTunnel);

  return isTunnelRequest(request);
}
