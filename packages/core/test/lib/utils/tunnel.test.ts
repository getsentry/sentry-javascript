import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvelopeEndpointWithUrlEncodedAuth } from '../../../src/api';
import { makeDsn } from '../../../src/utils/dsn';
import { createEnvelope, serializeEnvelope } from '../../../src/utils/envelope';
import { handleTunnelRequest, MAX_TUNNEL_BODY_SIZE } from '../../../src/utils/tunnel';

const TEST_DSN = 'https://public@dsn.ingest.sentry.io/1337';

function makeEnvelopeRequest(envelopeHeader: Record<string, unknown>, contentLength?: number): Request {
  const envelope = createEnvelope(envelopeHeader, []);
  const body = serializeEnvelope(envelope);
  const byteLength = typeof body === 'string' ? new TextEncoder().encode(body).byteLength : body.byteLength;
  return new Request('http://localhost/tunnel', {
    method: 'POST',
    body,
    headers: { 'content-length': String(contentLength ?? byteLength) },
  });
}

describe('handleTunnelRequest', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  describe('body size limit', () => {
    it('forwards the envelope when Content-Length equals the limit', async () => {
      fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));

      const result = await handleTunnelRequest({
        request: makeEnvelopeRequest({ dsn: TEST_DSN }, MAX_TUNNEL_BODY_SIZE),
        allowedDsns: [TEST_DSN],
      });

      expect(result.status).toBe(200);
    });

    it('returns 413 when Content-Length is above the limit', async () => {
      const result = await handleTunnelRequest({
        request: makeEnvelopeRequest({ dsn: TEST_DSN }, MAX_TUNNEL_BODY_SIZE + 1),
        allowedDsns: [TEST_DSN],
      });

      expect(result.status).toBe(413);
      expect(await result.text()).toBe('Envelope too large');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns 411 when the request has no Content-Length', async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ dsn: TEST_DSN })}\n`));
          controller.close();
        },
      });
      // Node.js requires `duplex` for a stream body, but the DOM types do not have it yet.
      const init: RequestInit & { duplex: 'half' } = { method: 'POST', body, duplex: 'half' };

      const result = await handleTunnelRequest({
        request: new Request('http://localhost/tunnel', init),
        allowedDsns: [TEST_DSN],
      });

      expect(result.status).toBe(411);
      expect(await result.text()).toBe('Length required');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
