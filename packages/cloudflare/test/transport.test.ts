import type { EventEnvelope, EventItem } from '@sentry/core';
import { createEnvelope, SENTRY_BUFFER_FULL_ERROR, serializeEnvelope } from '@sentry/core';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { CloudflareTransportOptions } from '../src/transport';
import { IsolatedPromiseBuffer, makeCloudflareTransport } from '../src/transport';

const DEFAULT_EDGE_TRANSPORT_OPTIONS: CloudflareTransportOptions = {
  url: 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7',
  recordDroppedEvent: () => undefined,
};

const ERROR_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

class Headers {
  headers: { [key: string]: string } = {};
  get(key: string) {
    return this.headers[key] || null;
  }
  set(key: string, value: string) {
    this.headers[key] = value;
  }
}

const mockFetch = vi.fn();

const oldFetch = global.fetch;
global.fetch = mockFetch;

afterAll(() => {
  global.fetch = oldFetch;
});

describe('Edge Transport', () => {
  it('calls fetch with the given URL', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        headers: new Headers(),
        status: 200,
        text: () => Promise.resolve({}),
      }),
    );

    const transport = makeCloudflareTransport(DEFAULT_EDGE_TRANSPORT_OPTIONS);

    expect(mockFetch).toHaveBeenCalledTimes(0);
    await transport.send(ERROR_ENVELOPE);
    await transport.flush();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(mockFetch).toHaveBeenLastCalledWith(DEFAULT_EDGE_TRANSPORT_OPTIONS.url, {
      body: serializeEnvelope(ERROR_ENVELOPE),
      method: 'POST',
    });
  });

  it('sets rate limit headers', async () => {
    const headers = {
      get: vi.fn(),
    };

    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        headers,
        status: 200,
        text: () => Promise.resolve({}),
      }),
    );

    const transport = makeCloudflareTransport(DEFAULT_EDGE_TRANSPORT_OPTIONS);

    expect(headers.get).toHaveBeenCalledTimes(0);
    await transport.send(ERROR_ENVELOPE);
    await transport.flush();

    expect(headers.get).toHaveBeenCalledTimes(2);
    expect(headers.get).toHaveBeenCalledWith('X-Sentry-Rate-Limits');
    expect(headers.get).toHaveBeenCalledWith('Retry-After');
  });

  it('allows for custom options to be passed in', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        headers: new Headers(),
        status: 200,
        text: () => Promise.resolve({}),
      }),
    );

    const REQUEST_OPTIONS: RequestInit = {
      cf: {
        minify: {
          javascript: true,
        },
      },
    };

    const transport = makeCloudflareTransport({ ...DEFAULT_EDGE_TRANSPORT_OPTIONS, fetchOptions: REQUEST_OPTIONS });

    await transport.send(ERROR_ENVELOPE);
    await transport.flush();
    expect(mockFetch).toHaveBeenLastCalledWith(DEFAULT_EDGE_TRANSPORT_OPTIONS.url, {
      body: serializeEnvelope(ERROR_ENVELOPE),
      method: 'POST',
      ...REQUEST_OPTIONS,
    });
  });

  describe('Response body consumption (issue #18534)', () => {
    it('consumes the response body to prevent Cloudflare stalled connection warnings', async () => {
      const textMock = vi.fn(() => Promise.resolve('OK'));
      const headers = {
        get: vi.fn(),
      };
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          headers,
          status: 200,
          text: textMock,
        }),
      );

      const transport = makeCloudflareTransport(DEFAULT_EDGE_TRANSPORT_OPTIONS);

      await transport.send(ERROR_ENVELOPE);
      await transport.flush();

      expect(textMock).toHaveBeenCalledTimes(1);
      expect(headers.get).toHaveBeenCalledTimes(2);
      expect(headers.get).toHaveBeenCalledWith('X-Sentry-Rate-Limits');
      expect(headers.get).toHaveBeenCalledWith('Retry-After');
    });

    it('handles response body consumption errors gracefully', async () => {
      const textMock = vi.fn(() => Promise.reject(new Error('Body read error')));
      const headers = {
        get: vi.fn(),
      };

      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          headers,
          status: 200,
          text: textMock,
        }),
      );

      const transport = makeCloudflareTransport(DEFAULT_EDGE_TRANSPORT_OPTIONS);

      await expect(transport.send(ERROR_ENVELOPE)).resolves.toBeDefined();
      await expect(transport.flush()).resolves.toBeDefined();

      expect(textMock).toHaveBeenCalledTimes(1);
      expect(headers.get).toHaveBeenCalledTimes(2);
      expect(headers.get).toHaveBeenCalledWith('X-Sentry-Rate-Limits');
      expect(headers.get).toHaveBeenCalledWith('Retry-After');
    });

    it('handles a potential never existing use case of a non existing text method', async () => {
      const headers = {
        get: vi.fn(),
      };

      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          headers,
          status: 200,
        }),
      );

      const transport = makeCloudflareTransport(DEFAULT_EDGE_TRANSPORT_OPTIONS);

      await expect(transport.send(ERROR_ENVELOPE)).resolves.toBeDefined();
      await expect(transport.flush()).resolves.toBeDefined();
      expect(headers.get).toHaveBeenCalledTimes(2);
      expect(headers.get).toHaveBeenCalledWith('X-Sentry-Rate-Limits');
      expect(headers.get).toHaveBeenCalledWith('Retry-After');
    });
  });
});

describe('IsolatedPromiseBuffer', () => {
  it('should not call tasks until drained', async () => {
    const ipb = new IsolatedPromiseBuffer();

    const task1 = vi.fn(() => Promise.resolve({}));
    const task2 = vi.fn(() => Promise.resolve({}));

    await ipb.add(task1);
    await ipb.add(task2);

    expect(task1).not.toHaveBeenCalled();
    expect(task2).not.toHaveBeenCalled();

    await ipb.drain();

    expect(task1).toHaveBeenCalled();
    expect(task2).toHaveBeenCalled();
  });

  it('should not allow adding more items than the specified limit', async () => {
    const ipb = new IsolatedPromiseBuffer(3);

    const task1 = vi.fn(() => Promise.resolve({}));
    const task2 = vi.fn(() => Promise.resolve({}));
    const task3 = vi.fn(() => Promise.resolve({}));
    const task4 = vi.fn(() => Promise.resolve({}));

    await ipb.add(task1);
    await ipb.add(task2);
    await ipb.add(task3);

    try {
      await ipb.add(task4);
      throw new Error('Should not be called');
    } catch (error) {
      expect(error).toBe(SENTRY_BUFFER_FULL_ERROR);
    }
  });

  it('should not throw when one of the tasks throws when drained', async () => {
    const ipb = new IsolatedPromiseBuffer();

    const task1 = vi.fn(() => Promise.resolve({}));
    const task2 = vi.fn(() => Promise.reject(new Error()));

    await ipb.add(task1);
    await ipb.add(task2);

    await expect(ipb.drain()).resolves.toEqual(true);

    expect(task1).toHaveBeenCalled();
    expect(task2).toHaveBeenCalled();
  });

  it('should allow for a custom fetch function to be passed in', async () => {
    const customFetch = vi.fn(async () => {
      return {
        headers: new Headers(),
        status: 200,
        text: () => Promise.resolve({}),
      } as unknown as Response;
    });

    const transport = makeCloudflareTransport({ ...DEFAULT_EDGE_TRANSPORT_OPTIONS, fetch: customFetch });

    await transport.send(ERROR_ENVELOPE);
    await transport.flush();
    expect(customFetch).toHaveBeenCalledTimes(1);
  });
});
