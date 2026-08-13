import {
  type Event,
  setCurrentClient,
  spanStreamingIntegration,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudflareClient, type CloudflareClientOptions } from '../src/client';
import { flushAndDispose } from '../src/flush';
import { resetSdk } from './testUtils';

const dsn = 'https://public@dsn.ingest.sentry.io/1337';

function createClient(options: Partial<CloudflareClientOptions> = {}): {
  client: CloudflareClient;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn().mockResolvedValue({});
  const client = new CloudflareClient({
    dsn,
    stackParser: () => [],
    integrations: [],
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    transport: () => ({
      send,
      flush: vi.fn().mockResolvedValue(true),
    }),
    ...options,
  });
  setCurrentClient(client);
  client.init();
  return { client, send };
}

describe('CloudflareClient static span capture', () => {
  beforeEach(() => {
    resetSdk();
    setAsyncLocalStorageAsyncContextStrategy();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetSdk();
  });

  it('preserves a child that ends after its segment was sent', () => {
    vi.useFakeTimers();
    const transactions: Event[] = [];
    const { client } = createClient();
    client.on('beforeSendEvent', event => {
      transactions.push(event);
    });
    const root = startInactiveSpan({ name: 'cloudflare request' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'background agent work' }));

    root.end();
    vi.advanceTimersByTime(100);
    child.end();
    vi.advanceTimersByTime(100);

    expect(transactions).toHaveLength(2);
    expect(transactions.map(transaction => transaction.transaction)).toEqual([
      'cloudflare request',
      'background agent work',
    ]);
    expect(transactions[1]?.contexts?.trace?.data?.['sentry.parent_span_already_sent']).toBe(true);
  });

  it('drains a deferred transaction before disposing the client', async () => {
    const { client, send } = createClient();
    const root = startInactiveSpan({ name: 'cloudflare request' });

    root.end();

    expect(send).not.toHaveBeenCalled();

    await flushAndDispose(client, 3_000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(client.getTransport()).toBeUndefined();
  });

  it('does not duplicate spans that use the streaming lifecycle', async () => {
    const { client, send } = createClient({
      integrations: [spanStreamingIntegration()],
      traceLifecycle: 'stream',
    });
    const root = startInactiveSpan({ name: 'cloudflare request' });
    const child = withActiveSpan(root, () => startInactiveSpan({ name: 'streamed child' }));

    child.end();
    root.end();
    await client.flush(3_000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([
      expect.any(Object),
      [
        [
          {
            type: 'span',
            item_count: 2,
            content_type: 'application/vnd.sentry.items.span.v2+json',
          },
          {
            version: 2,
            items: [
              expect.objectContaining({ name: 'streamed child' }),
              expect.objectContaining({ name: 'cloudflare request' }),
            ],
          },
        ],
      ],
    ]);
  });
});
