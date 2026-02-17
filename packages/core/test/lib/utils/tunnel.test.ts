import { describe, expect, it } from 'vitest';
import { createEnvelope, serializeEnvelope } from '../../../src/utils/envelope';
import { createTunnelRequest } from '../../../src/utils/tunnel';

const TEST_DSN = 'https://public@dsn.ingest.sentry.io/1337';

function makeEnvelopeRequest(envelopeHeader: Record<string, unknown>): Request {
  const envelope = createEnvelope(envelopeHeader, []);
  const body = serializeEnvelope(envelope);
  return new Request('http://localhost/tunnel', { method: 'POST', body });
}

describe('createTunnelRequest', () => {
  it('returns a forwarding Request for a valid, allowed DSN', async () => {
    const result = await createTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }),
      allowedDsns: [TEST_DSN],
    });

    expect(result).toBeInstanceOf(Request);

    const req = result as Request;
    expect(req.url).toBe('https://dsn.ingest.sentry.io/api/1337/envelope/');
    expect(req.method).toBe('POST');
    expect(req.headers.get('Content-Type')).toBe('application/x-sentry-envelope');
  });

  it('returns 500 when allowedDsns is empty', async () => {
    const result = await createTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }),
      allowedDsns: [],
    });

    expect(result).toBeInstanceOf(Response);

    const res = result as Response;
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Tunnel not configured');
  });

  it('returns 400 when the envelope has no DSN in the header', async () => {
    const result = await createTunnelRequest({
      request: makeEnvelopeRequest({}),
      allowedDsns: [TEST_DSN],
    });

    expect(result).toBeInstanceOf(Response);

    const res = result as Response;
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Invalid envelope: missing DSN');
  });

  it('returns 403 when the envelope DSN is not in allowedDsns', async () => {
    const result = await createTunnelRequest({
      request: makeEnvelopeRequest({ dsn: 'https://other@example.com/9999' }),
      allowedDsns: [TEST_DSN],
    });

    expect(result).toBeInstanceOf(Response);

    const res = result as Response;
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('DSN not allowed');
  });

  it('returns 403 when the DSN string cannot be parsed into components', async () => {
    const malformedDsn = 'not-a-valid-dsn';

    const result = await createTunnelRequest({
      request: makeEnvelopeRequest({ dsn: malformedDsn }),
      allowedDsns: [malformedDsn],
    });

    expect(result).toBeInstanceOf(Response);

    const res = result as Response;
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Invalid DSN');
  });

  it('allows the DSN when multiple DSNs are configured', async () => {
    const otherDsn = 'https://other@example.com/9999';

    const result = await createTunnelRequest({
      request: makeEnvelopeRequest({ dsn: TEST_DSN }),
      allowedDsns: [otherDsn, TEST_DSN],
    });

    expect(result).toBeInstanceOf(Request);
    expect((result as Request).url).toBe('https://dsn.ingest.sentry.io/api/1337/envelope/');
  });
});
