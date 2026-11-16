import type { Client } from '@sentry/core';
import { createEnvelope, getCurrentScope, makeDsn, serializeEnvelope } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serveTunnelIntegration } from '@sentry/core/server';
import { createSentryTunnelRoute, POST } from '../../src/tunnel';

const SERVER_DSN = 'https://public@o1.ingest.sentry.io/1';
const BROWSER_DSN = 'https://browser@o1.ingest.sentry.io/2';

function createEnvelopeRequest(dsn: string): { request: Request; body: Uint8Array } {
  const envelope = serializeEnvelope(
    createEnvelope({ dsn, event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }, [
      [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', message: 'Checkout failed' }],
    ]),
  );
  const body = typeof envelope === 'string' ? new TextEncoder().encode(envelope) : envelope;
  const request = new Request('https://shop.example.com/monitoring', {
    method: 'POST',
    headers: {
      cookie: 'session=8f2c1d',
      'content-type': 'text/plain;charset=UTF-8',
      'content-length': String(body.byteLength),
    },
    body,
  });
  return { request, body };
}

function useClientDsn(dsn: string | undefined): void {
  const client = dsn ? ({ getDsn: () => makeDsn(dsn), getOptions: () => ({}) } as unknown as Client) : undefined;
  getCurrentScope().setClient(client);
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  useClientDsn(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST', () => {
  it('forwards only the envelope to the Sentry host of an allowed DSN', async () => {
    useClientDsn(SERVER_DSN);
    const { request, body } = createEnvelopeRequest(SERVER_DSN);

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://o1.ingest.sentry.io/api/1/envelope/?sentry_version=7&sentry_key=public',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
      }),
    );
    // The body streams through, so it is read back to compare it.
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(new Uint8Array(await new Response((init as RequestInit).body).arrayBuffer())).toEqual(body);
  });

  it('responds with 500 when the server SDK has no DSN', async () => {
    const { request } = createEnvelopeRequest(SERVER_DSN);

    const response = await POST(request);

    expect(response.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an envelope for a DSN that is not the server DSN', async () => {
    useClientDsn(SERVER_DSN);
    const { request } = createEnvelopeRequest(BROWSER_DSN);

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts the DSNs `serveTunnelIntegration` allows', async () => {
    const integration = serveTunnelIntegration({ allowedDsns: [BROWSER_DSN] });
    const options = {};
    const client = {
      getDsn: () => makeDsn(SERVER_DSN),
      getOptions: () => options,
      getIntegrationByName: () => integration,
    } as unknown as Client;
    integration.setup?.(client);
    getCurrentScope().setClient(client);

    const response = await POST(createEnvelopeRequest(BROWSER_DSN).request);

    expect(response.status).toBe(200);
  });

  it('does not accept DSNs from environment variables', async () => {
    useClientDsn(SERVER_DSN);
    vi.stubEnv('SENTRY_DSN', BROWSER_DSN);
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', BROWSER_DSN);
    const { request } = createEnvelopeRequest(BROWSER_DSN);

    const response = await POST(request);

    expect(response.status).toBe(403);
  });
});

describe('createSentryTunnelRoute', () => {
  it('accepts the DSNs in `allowedDsns` and the server DSN', async () => {
    useClientDsn(SERVER_DSN);
    const { POST: handler } = createSentryTunnelRoute({ allowedDsns: [BROWSER_DSN] });

    const browserResponse = await handler(createEnvelopeRequest(BROWSER_DSN).request);
    const serverResponse = await handler(createEnvelopeRequest(SERVER_DSN).request);
    const otherResponse = await handler(createEnvelopeRequest('https://other@o2.ingest.sentry.io/3').request);

    expect(browserResponse.status).toBe(200);
    expect(serverResponse.status).toBe(200);
    expect(otherResponse.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['omitted', {}],
    ['empty', { allowedDsns: [] }],
  ])('accepts the server DSN when `allowedDsns` is %s', async (_description, options) => {
    useClientDsn(SERVER_DSN);
    const { POST: handler } = createSentryTunnelRoute(options);

    const response = await handler(createEnvelopeRequest(SERVER_DSN).request);

    expect(response.status).toBe(200);
  });

  it('accepts an allowed DSN with a secret and whitespace', async () => {
    const { POST: handler } = createSentryTunnelRoute({
      allowedDsns: [' https://public:secret@o1.ingest.sentry.io/1\n'],
    });

    const response = await handler(createEnvelopeRequest(SERVER_DSN).request);

    expect(response.status).toBe(200);
  });

  it('responds with 500 when no allowed DSN is valid and the server SDK has no DSN', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { POST: handler } = createSentryTunnelRoute({ allowedDsns: ['not-a-dsn'] });

    const response = await handler(createEnvelopeRequest(SERVER_DSN).request);

    expect(response.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
