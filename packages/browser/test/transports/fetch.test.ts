import type { EventEnvelope, EventItem } from '@sentry/core';
import { createEnvelope, serializeEnvelope } from '@sentry/core';
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeFetchTransport } from '../../src/transports/fetch';
import type { BrowserTransportOptions } from '../../src/transports/types';

const DEFAULT_FETCH_TRANSPORT_OPTIONS: BrowserTransportOptions = {
  url: 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7',
  recordDroppedEvent: () => undefined,
};

const ERROR_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

const LARGE_ERROR_ENVELOPE = createEnvelope<EventEnvelope>(
  { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' },
  [[{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', message: 'x'.repeat(10 * 900) }] as EventItem],
);

class Headers {
  headers: { [key: string]: string } = {};
  get(key: string) {
    return this.headers[key] || null;
  }
  set(key: string, value: string) {
    this.headers[key] = value;
  }
}

describe('fetchTransport', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('calls fetch with the given URL', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        headers: new Headers(),
        status: 200,
        text: () => Promise.resolve({}),
      }),
    ) as unknown as typeof window.fetch;
    const transport = makeFetchTransport(DEFAULT_FETCH_TRANSPORT_OPTIONS, mockFetch);

    expect(mockFetch).toHaveBeenCalledTimes(0);
    await transport.send(ERROR_ENVELOPE);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(mockFetch).toHaveBeenLastCalledWith(DEFAULT_FETCH_TRANSPORT_OPTIONS.url, {
      body: serializeEnvelope(ERROR_ENVELOPE),
      method: 'POST',
      keepalive: true,
      referrerPolicy: 'strict-origin',
    });
  });

  it('sets rate limit headers', async () => {
    const headers = {
      get: vi.fn(),
    };

    const mockFetch = vi.fn(() =>
      Promise.resolve({
        headers,
        status: 200,
        text: () => Promise.resolve({}),
      }),
    ) as unknown as typeof window.fetch;
    const transport = makeFetchTransport(DEFAULT_FETCH_TRANSPORT_OPTIONS, mockFetch);

    expect(headers.get).toHaveBeenCalledTimes(0);
    await transport.send(ERROR_ENVELOPE);

    expect(headers.get).toHaveBeenCalledTimes(2);
    expect(headers.get).toHaveBeenCalledWith('X-Sentry-Rate-Limits');
    expect(headers.get).toHaveBeenCalledWith('Retry-After');
  });

  it('allows for custom options to be passed in', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        headers: new Headers(),
        status: 200,
        text: () => Promise.resolve({}),
      }),
    ) as unknown as typeof window.fetch;

    const REQUEST_OPTIONS: RequestInit = {
      referrerPolicy: 'strict-origin',
      keepalive: false,
      referrer: 'http://example.org',
    };

    const transport = makeFetchTransport(
      { ...DEFAULT_FETCH_TRANSPORT_OPTIONS, fetchOptions: REQUEST_OPTIONS },
      mockFetch,
    );

    await transport.send(ERROR_ENVELOPE);
    expect(mockFetch).toHaveBeenLastCalledWith(DEFAULT_FETCH_TRANSPORT_OPTIONS.url, {
      body: serializeEnvelope(ERROR_ENVELOPE),
      method: 'POST',
      ...REQUEST_OPTIONS,
    });
  });

  it('handles when native fetch implementation returns undefined', async () => {
    const mockFetch = vi.fn(() => undefined) as unknown as typeof window.fetch;
    const transport = makeFetchTransport(DEFAULT_FETCH_TRANSPORT_OPTIONS, mockFetch);

    expect(mockFetch).toHaveBeenCalledTimes(0);
    await expect(() => transport.send(ERROR_ENVELOPE)).rejects.toThrow(
      "Cannot read properties of undefined (reading 'status')",
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('handles when native fetch implementation is undefined', async () => {
    vi.mock('@sentry-internal/browser-utils', async importOriginal => ({
      ...(await importOriginal()),
      getNativeImplementation: () => undefined,
    }));

    const transport = makeFetchTransport(DEFAULT_FETCH_TRANSPORT_OPTIONS);

    await expect(() => transport.send(ERROR_ENVELOPE)).rejects.toThrow('nativeFetch is not a function');
  });

  it('correctly sets keepalive flag', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        headers: new Headers(),
        status: 200,
        text: () => Promise.resolve({}),
      }),
    ) as unknown as typeof window.fetch;

    const REQUEST_OPTIONS: RequestInit = {
      referrerPolicy: 'strict-origin',
      referrer: 'http://example.org',
    };

    const transport = makeFetchTransport(
      { ...DEFAULT_FETCH_TRANSPORT_OPTIONS, fetchOptions: REQUEST_OPTIONS },
      mockFetch,
    );

    const promises: PromiseLike<unknown>[] = [];
    for (let i = 0; i < 30; i++) {
      promises.push(transport.send(LARGE_ERROR_ENVELOPE));
    }

    await Promise.all(promises);

    for (let i = 1; i <= 30; i++) {
      // After 7 requests, we hit the total limit of >64kb of size
      // Starting there, keepalive should be false
      const keepalive = i < 7;
      expect(mockFetch).toHaveBeenNthCalledWith(i, expect.any(String), expect.objectContaining({ keepalive }));
    }

    (mockFetch as Mock).mockClear();

    // Limit resets when requests have resolved
    // Now try based on # of pending requests
    const promises2 = [];
    for (let i = 0; i < 20; i++) {
      promises2.push(transport.send(ERROR_ENVELOPE));
    }

    await Promise.all(promises2);

    for (let i = 1; i <= 20; i++) {
      const keepalive = i < 15;
      expect(mockFetch).toHaveBeenNthCalledWith(i, expect.any(String), expect.objectContaining({ keepalive }));
    }
  });
});
