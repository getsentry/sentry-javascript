import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
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
  handleTunnelRequestIfMatched,
  isTunnelRequest,
  normalizeTunnelBasePath,
  resolveAllowedDsns,
  resolveTunnelPaths,
} from '../../../src/utils/tunnel';
import { forwardTunnelRequest, handleTunnelRequest } from '../../../src/utils/tunnelForward';
import { serveTunnelIntegration } from '../../../src/integrations/serveTunnel';
import {
  _INTERNAL_resetManagedTunnelDefaults,
  applyManagedTunnelDefaults,
  setManagedTunnelDefaults,
} from '../../../src/utils/managedTunnelDefaults';
import type { DsnComponents } from '../../../src/types/dsn';
import type { IgnoreSpanFilter, ServerTunnelOptions } from '../../../src/types/options';
import { getDefaultTestClientOptions } from '../../mocks/client';
import { ServerRuntimeClient } from '../../../src/server-runtime-client';

const TEST_DSN = 'https://public@dsn.ingest.sentry.io/1337';
const SERVER_DSN = 'https://server@o7.ingest.sentry.io/7';

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
    headers: { 'content-length': String(1024 * 1024 * 1024) },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(sentHead ? filler : new TextEncoder().encode(head));
        sentHead = true;
      },
      cancel: onCancel,
    }),
  } as RequestInit);
}

describe('handleTunnelRequest call forms', () => {
  // Captured before the stub, so the test can reach its own server.
  const realFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve(new Response('forwarded', { status: 202 })));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('still takes the released options object', async () => {
    // oxlint-disable-next-line typescript/no-deprecated -- the form under test
    const response = await handleTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }),
      allowedDsns: [TEST_DSN],
    });

    expect(response.status).toBe(202);
  });

  it("forwards from a Node server's request and writes the answer to its response", async () => {
    const server = http.createServer((req, res) => {
      void handleTunnelRequest(req, res, { allowedDsns: [TEST_DSN] });
    });
    await new Promise<void>(resolve => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const envelope = serializeEnvelope(createEnvelope({ dsn: TEST_DSN }, [])) as string;

    try {
      const response = await realFetch(`http://localhost:${port}/tunnel`, { method: 'POST', body: envelope });

      expect(response.status).toBe(202);
      expect(await response.text()).toBe('forwarded');
      const [url, init] = fetchMock.mock.lastCall as unknown as [string, RequestInit];
      expect(url).toBe(getEnvelopeEndpointWithUrlEncodedAuth(makeDsn(TEST_DSN)!));
      expect(await new Response(init.body).text()).toBe(envelope);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('rejects a Node request whose body a parser already read', async () => {
    const server = http.createServer(async (req, res) => {
      for await (const _chunk of req) {
        // Like a body parser that ran first.
      }
      void handleTunnelRequest(req, res, { allowedDsns: [TEST_DSN] });
    });
    await new Promise<void>(resolve => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const envelope = serializeEnvelope(createEnvelope({ dsn: TEST_DSN }, [])) as string;

    try {
      const response = await realFetch(`http://localhost:${port}/tunnel`, { method: 'POST', body: envelope });

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});

describe('handleTunnelRequest', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('leaves the size limit to Sentry and passes its 413 back', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Envelope too large', { status: 413 }));

    const result = await handleTunnelRequest(makeEnvelopeRequest({ dsn: TEST_DSN }, undefined, 1024 * 1024 * 1024), {
      allowedDsns: [TEST_DSN],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(413);
  });

  it('returns 411 when the request has no Content-Length', async () => {
    const result = await handleTunnelRequest(
      new Request('http://localhost/tunnel', {
        method: 'POST',
        body: `${JSON.stringify({ dsn: TEST_DSN })}\n`,
      }),
      { allowedDsns: [TEST_DSN] },
    );

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

    const result = await handleTunnelRequest(makeEnvelopeRequest({ dsn: TEST_DSN }), { allowedDsns: [TEST_DSN] });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(getEnvelopeEndpointWithUrlEncodedAuth(makeDsn(TEST_DSN)!));
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-sentry-envelope' });
    expect(await new Response(init.body).text()).toBe(serializeEnvelope(createEnvelope({ dsn: TEST_DSN }, [])));

    expect(result.status).toBe(200);
    expect(await result.text()).toBe('ok');
  });

  it('drops the encoding of the body `fetch` already decoded', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } }),
    );

    const forwarded = await handleTunnelRequest(makeEnvelopeRequest({ dsn: TEST_DSN }), { allowedDsns: [TEST_DSN] });

    expect(forwarded.headers.get('Content-Type')).toBe('application/json');
    // The original encoding would make the browser decode it twice.
    expect(forwarded.headers.get('Content-Encoding')).toBeNull();
  });

  it.each([
    ['cf-connecting-ip', { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }, '1.1.1.1'],
    ['x-vercel-forwarded-for', { 'x-vercel-forwarded-for': '3.3.3.3', 'x-forwarded-for': '2.2.2.2' }, '3.3.3.3'],
    ['x-forwarded-for', { 'x-forwarded-for': '2.2.2.2, 10.0.0.1' }, '2.2.2.2, 10.0.0.1'],
  ])('forwards the client IP from %s', async (_, incomingHeaders, forwardedFor) => {
    fetchMock.mockResolvedValueOnce(new Response('ok'));

    await handleTunnelRequest(
      new Request('http://localhost/tunnel', {
        method: 'POST',
        body: `${JSON.stringify({ dsn: TEST_DSN })}\n`,
        headers: { ...incomingHeaders, 'content-length': '1' },
      }),
      { allowedDsns: [TEST_DSN] },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Sentry-Forwarded-For': forwardedFor }),
      }),
    );
  });

  it('forwards the client headers Relay reads the browser and allowed domains from', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok'));
    const clientHeaders = {
      'user-agent': 'Mozilla/5.0',
      'sec-ch-ua': '"Chromium";v="140"',
      'sec-ch-ua-model': '""',
      'sec-ch-ua-platform': '"macOS"',
      'sec-ch-ua-platform-version': '"15.0.0"',
      origin: 'https://example.com',
      referer: 'https://example.com/page',
    };

    await handleTunnelRequest(
      new Request('http://localhost/tunnel', {
        method: 'POST',
        body: `${JSON.stringify({ dsn: TEST_DSN })}\n`,
        headers: { ...clientHeaders, cookie: 'session=secret', 'content-length': '1' },
      }),
      { allowedDsns: [TEST_DSN] },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-sentry-envelope', ...clientHeaders },
      }),
    );
  });

  it('rejects a disallowed DSN after reading only the envelope header', async () => {
    const result = await handleTunnelRequest(
      makeEndlessRequest(`${JSON.stringify({ dsn: 'https://other@example.com/9999' })}\n`),
      { allowedDsns: [TEST_DSN] },
    );

    expect(result.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels the body of a rejected request', async () => {
    const onCancel = vi.fn();

    await handleTunnelRequest(
      makeEndlessRequest(`${JSON.stringify({ dsn: 'https://other@example.com/9999' })}\n`, onCancel),
      { allowedDsns: [TEST_DSN] },
    );

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('streams an allowed envelope to Sentry without reading the rest of the body', async () => {
    const upstreamResponse = new Response('ok');
    fetchMock.mockResolvedValueOnce(upstreamResponse);

    const result = await handleTunnelRequest(makeEndlessRequest(`${JSON.stringify({ dsn: TEST_DSN })}\n`), {
      allowedDsns: [TEST_DSN],
    });

    expect(await result.text()).toBe('ok');
  });

  it('returns 400 when the envelope header line exceeds the limit', async () => {
    const result = await handleTunnelRequest(makeEndlessRequest(''), { allowedDsns: [TEST_DSN] });

    expect(result.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 500 when allowedDsns is empty', async () => {
    const result = await handleTunnelRequest(makeEnvelopeRequest({ dsn: TEST_DSN }), { allowedDsns: [] });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(500);
    expect(await result.text()).toBe('Tunnel not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the envelope has no DSN in the header', async () => {
    const result = await handleTunnelRequest(makeEnvelopeRequest({}), { allowedDsns: [TEST_DSN] });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(400);
    expect(await result.text()).toBe('Invalid envelope: missing DSN');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the envelope body contains malformed JSON', async () => {
    const result = await handleTunnelRequest(
      new Request('http://localhost/tunnel', {
        method: 'POST',
        body: 'not valid envelope data{{{',
        headers: { 'content-length': '26' },
      }),
      { allowedDsns: [TEST_DSN] },
    );

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(400);
    expect(await result.text()).toBe('Invalid envelope');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the envelope DSN is not in allowedDsns', async () => {
    const result = await handleTunnelRequest(makeEnvelopeRequest({ dsn: 'https://other@example.com/9999' }), {
      allowedDsns: [TEST_DSN],
    });

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(403);
    expect(await result.text()).toBe('DSN not allowed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores an allowed DSN that cannot be parsed', async () => {
    const malformedDsn = 'not-a-valid-dsn';

    const result = await handleTunnelRequest(makeEnvelopeRequest({ dsn: malformedDsn }), {
      allowedDsns: [malformedDsn],
    });

    expect(result.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('matches an allowed DSN written with a secret key, which the envelope header leaves out', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const result = await handleTunnelRequest(makeEnvelopeRequest({ dsn: TEST_DSN }), {
      allowedDsns: [TEST_DSN.replace('@', ':secret@')],
    });

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('forwards the envelope when multiple DSNs are configured', async () => {
    const otherDsn = 'https://other@example.com/9999';
    const upstreamResponse = new Response('ok', { status: 200 });
    fetchMock.mockResolvedValueOnce(upstreamResponse);

    const result = await handleTunnelRequest(makeEnvelopeRequest({ dsn: TEST_DSN }), {
      allowedDsns: [otherDsn, TEST_DSN],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(getEnvelopeEndpointWithUrlEncodedAuth(makeDsn(TEST_DSN)!));
    expect(await result.text()).toBe('ok');
  });

  it('returns 500 when fetch throws a network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network failure'));

    const result = await handleTunnelRequest(makeEnvelopeRequest({ dsn: TEST_DSN }), { allowedDsns: [TEST_DSN] });

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

    await handleTunnelRequest(makeEnvelopeRequest({ dsn: TEST_DSN }), { allowedDsns: [TEST_DSN] });

    expect(suppressed).toBe(true);
  });

  it('accepts the DSN of the active client on top of allowedDsns', async () => {
    setTestClient(TEST_DSN);
    fetchMock.mockResolvedValue(new Response('ok'));

    const ownDsnResult = await handleTunnelRequest(makeEnvelopeRequest({ dsn: TEST_DSN }), {
      allowedDsns: ['https://browser@o2.ingest.sentry.io/42'],
    });
    const unlistedDsnResult = await handleTunnelRequest(
      makeEnvelopeRequest({ dsn: 'https://other@o3.ingest.sentry.io/7' }),
      { allowedDsns: ['https://browser@o2.ingest.sentry.io/42'] },
    );

    expect(ownDsnResult.status).toBe(200);
    expect(unlistedDsnResult.status).toBe(403);
  });

  it('defaults allowedDsns to the DSN of the active client', async () => {
    setTestClient(TEST_DSN);
    fetchMock.mockResolvedValueOnce(new Response('ok'));

    const result = await handleTunnelRequest(makeEnvelopeRequest({ dsn: TEST_DSN }));

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      getEnvelopeEndpointWithUrlEncodedAuth(makeDsn(TEST_DSN)!),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns 500 when allowedDsns is omitted and there is no client', async () => {
    const result = await handleTunnelRequest(makeEnvelopeRequest({ dsn: TEST_DSN }));

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

describe('serveTunnelIntegration', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('ignores the server spans of tunnel requests and keeps user filters', () => {
    const client = new ServerRuntimeClient(
      getDefaultTestClientOptions({
        dsn: TEST_DSN,
        integrations: [serveTunnelIntegration()],
        ignoreSpans: ['user-filter'],
      }),
    );
    client.init();
    const ignoreSpans = client.getOptions().ignoreSpans!;

    expect(ignoreSpans[0]).toBe('user-filter');
    expect(
      (ignoreSpans[1] as { attributes: { 'url.path': RegExp } }).attributes['url.path'].test(getTunnelPath(TEST_DSN)!),
    ).toBe(true);
  });

  it('leaves ignoreSpans alone without it', () => {
    const client = new ServerRuntimeClient(getDefaultTestClientOptions({ dsn: TEST_DSN }));
    client.init();

    expect(client.getOptions().ignoreSpans).toBeUndefined();
  });

  it('serves the tunnel from a separately bundled copy of core, which reaches the forwarder through the client', async () => {
    const client = new ServerRuntimeClient(
      getDefaultTestClientOptions({ dsn: TEST_DSN, integrations: [serveTunnelIntegration()] }),
    );
    setCurrentClient(client);
    client.init();

    vi.resetModules();
    const bundledDefaults = await import('../../../src/utils/managedTunnelDefaults');
    const bundledTunnel = await import('../../../src/utils/tunnel');
    bundledDefaults.setManagedTunnelDefaults({ basePath: '/app' });

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('forwarded'))),
    );
    const response = await bundledTunnel.handleTunnelRequestIfMatched(
      makeEnvelopeRequest({ dsn: TEST_DSN }, `http://localhost/app${getTunnelPath(TEST_DSN)}`),
    );
    vi.unstubAllGlobals();

    expect(bundledTunnel.getTunnelPaths()).toEqual([getTunnelPath(TEST_DSN)]);
    expect(await response?.text()).toBe('forwarded');
  });

  it('serves nothing for a `_managedTunnel` set without it, since only the integration brings the forwarder', () => {
    const client = new ServerRuntimeClient(getDefaultTestClientOptions({ dsn: TEST_DSN, _managedTunnel: {} }));
    setCurrentClient(client);
    client.init();

    expect(getTunnelPaths()).toEqual([]);
    expect(
      handleTunnelRequestIfMatched(
        makeEnvelopeRequest({ dsn: TEST_DSN }, `http://localhost${getTunnelPath(TEST_DSN)}`),
      ),
    ).toBeUndefined();
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

  it('leaves a path the user wrote as written', () => {
    expect(applyTunnelDefaults('/monitor', { basePath: '/app' })).toBe('/monitor');
    expect(applyTunnelDefaults({ path: '/monitor' }, { basePath: '/app' })).toEqual({ path: '/monitor' });
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

  it('serves a fixed path as written, outside the base path', () => {
    setTestClient(TEST_DSN, { path: '/monitor' });
    const client = getCurrentScope().getClient()!;

    setManagedTunnelDefaults({ basePath: '/app' });

    expect(client.getOptions()._managedTunnel).toEqual({ path: '/monitor' });
    expect(isTunnelRequest({ method: 'POST', url: '/monitor' })).toBe(true);
    expect(isTunnelRequest({ method: 'POST', url: '/app/monitor' })).toBe(false);
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
    setManagedTunnelDefaults({ tunnel: { path: '/monitor' }, forward: forwardTunnelRequest, basePath: '/app' });

    setTestClient(TEST_DSN);
    const laterClient = getCurrentScope().getClient()!;
    applyManagedTunnelDefaults(laterClient);
    expect(laterClient.getOptions()._managedTunnel).toEqual({ path: '/monitor' });
    expect(laterClient.getOptions().ignoreSpans).toContainEqual(
      getTunnelIgnoreSpanFilter({ path: '/monitor' }, makeDsn(TEST_DSN)),
    );

    setTestClient(TEST_DSN, { path: '/from-init' });
    const initClient = getCurrentScope().getClient()!;
    applyManagedTunnelDefaults(initClient);
    expect(initClient.getOptions()._managedTunnel).toEqual({ path: '/from-init' });
  });
});

function setTestClient(dsn: string | undefined, managedTunnel?: ServerTunnelOptions): void {
  const client = new ServerRuntimeClient(
    getDefaultTestClientOptions({ dsn, integrations: managedTunnel ? [serveTunnelIntegration(managedTunnel)] : [] }),
  );
  setCurrentClient(client);
  client.init();
}

/** `isTunnelRequest` for a server client with this managed tunnel, whose own DSN none of the tests request. */
function isTunnelRequestFor(
  request: Parameters<typeof isTunnelRequest>[0],
  managedTunnel: ServerTunnelOptions,
): boolean {
  setTestClient(SERVER_DSN, managedTunnel);

  return isTunnelRequest(request);
}
