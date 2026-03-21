import type { EventEnvelope, EventItem } from '@sentry/core';
import { createEnvelope, serializeEnvelope } from '@sentry/core';
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { makeFetchTransport } from '../src/transports';

const DEFAULT_TRANSPORT_OPTIONS = {
  url: 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7',
  recordDroppedEvent: () => undefined,
};

const ERROR_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

const mockFetch = mock();

const oldFetch = globalThis.fetch;
globalThis.fetch = mockFetch as typeof fetch;

afterAll(() => {
  globalThis.fetch = oldFetch;
});

describe('Bun Fetch Transport', () => {
  it('calls fetch with the given URL', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        headers: new Headers(),
        status: 200,
        text: () => Promise.resolve(''),
      }),
    );

    const transport = makeFetchTransport(DEFAULT_TRANSPORT_OPTIONS);

    expect(mockFetch).toHaveBeenCalledTimes(0);
    await transport.send(ERROR_ENVELOPE);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenLastCalledWith(DEFAULT_TRANSPORT_OPTIONS.url, {
      body: serializeEnvelope(ERROR_ENVELOPE),
      method: 'POST',
      headers: undefined,
    });
  });

  it('sets rate limit headers', async () => {
    const headers = {
      get: mock((key: string) => {
        if (key === 'X-Sentry-Rate-Limits') return 'rate-limit-value';
        if (key === 'Retry-After') return '42';
        return null;
      }),
    };

    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        headers,
        status: 200,
        text: () => Promise.resolve(''),
      }),
    );

    const transport = makeFetchTransport(DEFAULT_TRANSPORT_OPTIONS);

    const result = await transport.send(ERROR_ENVELOPE);

    expect(headers.get).toHaveBeenCalledTimes(2);
    expect(headers.get).toHaveBeenCalledWith('X-Sentry-Rate-Limits');
    expect(headers.get).toHaveBeenCalledWith('Retry-After');
    expect(result).toEqual({
      statusCode: 200,
      headers: {
        'x-sentry-rate-limits': 'rate-limit-value',
        'retry-after': '42',
      },
    });
  });

  describe('Response body consumption (issue #18534)', () => {
    it('consumes the response body to prevent memory leaks in Bun', async () => {
      const textMock = mock(() => Promise.resolve('OK'));
      const headers = {
        get: mock(() => null),
      };
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          headers,
          status: 200,
          text: textMock,
        }),
      );

      const transport = makeFetchTransport(DEFAULT_TRANSPORT_OPTIONS);

      await transport.send(ERROR_ENVELOPE);

      expect(textMock).toHaveBeenCalledTimes(1);
      expect(headers.get).toHaveBeenCalledTimes(2);
      expect(headers.get).toHaveBeenCalledWith('X-Sentry-Rate-Limits');
      expect(headers.get).toHaveBeenCalledWith('Retry-After');
    });

    it('handles response body consumption errors gracefully', async () => {
      const textMock = mock(() => Promise.reject(new Error('Body read error')));
      const headers = {
        get: mock(() => null),
      };

      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          headers,
          status: 200,
          text: textMock,
        }),
      );

      const transport = makeFetchTransport(DEFAULT_TRANSPORT_OPTIONS);

      // Should not throw even though text() rejects
      const result = await transport.send(ERROR_ENVELOPE);

      expect(result).toBeDefined();
      expect(textMock).toHaveBeenCalledTimes(1);
      expect(headers.get).toHaveBeenCalledTimes(2);
      expect(headers.get).toHaveBeenCalledWith('X-Sentry-Rate-Limits');
      expect(headers.get).toHaveBeenCalledWith('Retry-After');
    });

    it('handles a response without a text method', async () => {
      const headers = {
        get: mock(() => null),
      };

      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          headers,
          status: 200,
          // No text method on the response
        }),
      );

      const transport = makeFetchTransport(DEFAULT_TRANSPORT_OPTIONS);

      // Should not throw even without text()
      const result = await transport.send(ERROR_ENVELOPE);

      expect(result).toBeDefined();
      expect(headers.get).toHaveBeenCalledTimes(2);
      expect(headers.get).toHaveBeenCalledWith('X-Sentry-Rate-Limits');
      expect(headers.get).toHaveBeenCalledWith('Retry-After');
    });
  });
});
