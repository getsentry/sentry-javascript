import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvelopeEndpointWithUrlEncodedAuth } from '../../../src/api';
import { getCurrentScope, setCurrentClient } from '../../../src';
import { isTracingSuppressed } from '../../../src/tracing/trace';
import { makeDsn } from '../../../src/utils/dsn';
import { createEnvelope, serializeEnvelope } from '../../../src/utils/envelope';
import {
  getTunnelPath,
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
    expect(init.body).toBeInstanceOf(Uint8Array);

    expect(result).toBe(upstreamResponse);
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
      request: new Request('http://localhost/tunnel', { method: 'POST', body: 'not valid envelope data{{{' }),
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
    expect(isTunnelRequest('POST', tunnelPath, { allowedDsns: [TEST_DSN] })).toBe(true);
    expect(isTunnelRequest('POST', `${tunnelPath}/`, { allowedDsns: [TEST_DSN] })).toBe(true);
  });

  it('does not match other methods, other paths, or path prefixes', () => {
    expect(isTunnelRequest('GET', tunnelPath, { allowedDsns: [TEST_DSN] })).toBe(false);
    expect(isTunnelRequest('POST', '/somewhere', { allowedDsns: [TEST_DSN] })).toBe(false);
    expect(isTunnelRequest('POST', `${tunnelPath}x`, { allowedDsns: [TEST_DSN] })).toBe(false);
  });

  it('does not match the tunnel path of a DSN that is not allowed', () => {
    const otherDsn = 'https://other@example.com/9999';

    expect(isTunnelRequest('POST', getTunnelPath(otherDsn)!, { allowedDsns: [TEST_DSN] })).toBe(false);
  });

  it('uses the managed tunnel config of the active client when no options are passed', () => {
    setTestClient(TEST_DSN);
    expect(isTunnelRequest('POST', tunnelPath)).toBe(false);

    setTestClient(TEST_DSN, {});
    expect(isTunnelRequest('POST', tunnelPath)).toBe(true);
  });

  it('matches nothing without a client', () => {
    expect(isTunnelRequest('POST', tunnelPath)).toBe(false);
    expect(isTunnelRequest('POST', tunnelPath, {})).toBe(false);
  });

  it('matches under a base path', () => {
    expect(isTunnelRequest('POST', `/docs${tunnelPath}`, { allowedDsns: [TEST_DSN], basePath: '/docs/' })).toBe(true);
    expect(isTunnelRequest('POST', `/docsx${tunnelPath}`, { allowedDsns: [TEST_DSN], basePath: '/docs' })).toBe(false);
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

  it('leaves everything off when unset', () => {
    expect(resolveServerTunnelOption(undefined)).toEqual({ tunnel: undefined });
  });
});

function setTestClient(dsn: string, managedTunnel?: TunnelOptions): void {
  setCurrentClient(new TestClient(getDefaultTestClientOptions({ dsn, _managedTunnel: managedTunnel })));
}
