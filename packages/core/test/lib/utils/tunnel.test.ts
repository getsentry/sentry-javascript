import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEnvelope, serializeEnvelope } from '../../../src/utils/envelope';
import { handleTunnelRequest } from '../../../src/utils/tunnel';

const TEST_DSN = 'https://public@dsn.ingest.sentry.io/1337';

function makeEnvelopeRequest(envelopeHeader: Record<string, unknown>): Request {
  const envelope = createEnvelope(envelopeHeader, []);
  const body = serializeEnvelope(envelope);
  return new Request('http://localhost/tunnel', { method: 'POST', body });
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
    expect(url).toBe('https://dsn.ingest.sentry.io/api/1337/envelope/');
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
    expect(url).toBe('https://dsn.ingest.sentry.io/api/1337/envelope/');
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
});
