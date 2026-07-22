import type { Envelope, EventEnvelope } from '@sentry/core';
import { createEnvelope, debug } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudflareClient } from '../../src/client';
import { INTEGRATION_NAME, spotlightIntegration } from '../../src/integrations/spotlight';
import { createStackParser } from '@sentry/core';

function createTestClient(): CloudflareClient {
  return new CloudflareClient({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate: 1,
    integrations: [],
    transport: () => ({
      send: () => Promise.resolve({}),
      flush: () => Promise.resolve(true),
    }),
    stackParser: createStackParser(),
  });
}

function createTestEnvelope(): EventEnvelope {
  return createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
    [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }],
  ]);
}

describe('Spotlight (Cloudflare)', () => {
  const debugWarnSpy = vi.spyOn(debug, 'warn');
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has integration name "Spotlight"', () => {
    const integration = spotlightIntegration();
    expect(integration.name).toEqual(INTEGRATION_NAME);
    expect(integration.name).toEqual('Spotlight');
  });

  it('registers a callback on the beforeEnvelope hook', () => {
    const client = createTestClient();
    const onSpy = vi.spyOn(client, 'on');

    const integration = spotlightIntegration();
    integration.setup!(client);

    expect(onSpy).toHaveBeenCalledWith('beforeEnvelope', expect.any(Function));
  });

  it('sends an envelope POST request to the default sidecar URL', () => {
    let callback: (envelope: Envelope) => void = () => {};
    const client = createTestClient();
    vi.spyOn(client, 'on').mockImplementationOnce((_hook: string, cb: (envelope: Envelope) => void) => {
      callback = cb;
      return () => {};
    });

    const integration = spotlightIntegration();
    integration.setup!(client);

    callback(createTestEnvelope());

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8969/stream',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
      }),
    );
  });

  it('sends an envelope POST request to a custom sidecar URL', () => {
    let callback: (envelope: Envelope) => void = () => {};
    const client = createTestClient();
    vi.spyOn(client, 'on').mockImplementationOnce((_hook: string, cb: (envelope: Envelope) => void) => {
      callback = cb;
      return () => {};
    });

    const integration = spotlightIntegration({ sidecarUrl: 'http://mylocalhost:8888/abcd' });
    integration.setup!(client);

    callback(createTestEnvelope());

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://mylocalhost:8888/abcd',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
      }),
    );
  });

  it('serializes the envelope body', () => {
    let callback: (envelope: Envelope) => void = () => {};
    const client = createTestClient();
    vi.spyOn(client, 'on').mockImplementationOnce((_hook: string, cb: (envelope: Envelope) => void) => {
      callback = cb;
      return () => {};
    });

    const integration = spotlightIntegration();
    integration.setup!(client);

    callback(createTestEnvelope());

    const body = fetchSpy.mock.calls[0]![1].body as string;
    expect(body).toContain('aa3ff046696b4bc6b609ce6d28fde9e2');
    expect(typeof body).toBe('string');
  });

  it('stops forwarding after more than 3 failed requests', async () => {
    let callback: (envelope: Envelope) => void = () => {};
    const client = createTestClient();
    vi.spyOn(client, 'on').mockImplementationOnce((_hook: string, cb: (envelope: Envelope) => void) => {
      callback = cb;
      return () => {};
    });

    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const integration = spotlightIntegration();
    integration.setup!(client);

    const envelope = createTestEnvelope();

    // 4 failed requests should trigger the disable
    for (let i = 0; i < 4; i++) {
      callback(envelope);
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(i + 1));
    }

    fetchSpy.mockClear();
    callback(envelope);

    // Wait a tick to ensure any async handling is done
    await new Promise(resolve => setTimeout(resolve, 10));

    // The 5th call should not reach fetch
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resets fail count on successful request', async () => {
    let callback: (envelope: Envelope) => void = () => {};
    const client = createTestClient();
    vi.spyOn(client, 'on').mockImplementationOnce((_hook: string, cb: (envelope: Envelope) => void) => {
      callback = cb;
      return () => {};
    });

    // Fail 3 times, then succeed
    fetchSpy
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('') });

    const integration = spotlightIntegration();
    integration.setup!(client);

    const envelope = createTestEnvelope();

    for (let i = 0; i < 4; i++) {
      callback(envelope);
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(i + 1));
    }

    // After the success, fail count should be reset, so the next call should go through
    fetchSpy.mockResolvedValueOnce({ status: 200, text: () => Promise.resolve('') });
    callback(envelope);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(5));
  });

  it('warns on invalid sidecar URL', () => {
    const client = createTestClient();

    const integration = spotlightIntegration({ sidecarUrl: 'not-a-valid-url' });
    integration.setup!(client);

    expect(debugWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid sidecar URL: not-a-valid-url'));
  });

  it('does not call fetch for invalid sidecar URL', () => {
    let callback: (envelope: Envelope) => void = () => {};
    const client = createTestClient();
    vi.spyOn(client, 'on').mockImplementationOnce((_hook: string, cb: (envelope: Envelope) => void) => {
      callback = cb;
      return () => {};
    });

    const integration = spotlightIntegration({ sidecarUrl: 'not-a-valid-url' });
    integration.setup!(client);

    // If the URL is invalid, the beforeEnvelope hook is never registered
    // so callback is never replaced — it's still the no-op default
    callback(createTestEnvelope());

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
