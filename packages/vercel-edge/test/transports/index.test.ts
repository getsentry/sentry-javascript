import type { EventEnvelope, EventItem } from '@sentry/types';
import { createEnvelope, serializeEnvelope } from '@sentry/utils';

import type { VercelEdgeTransportOptions } from '../../src/transports';
import { IsolatedPromiseBuffer, makeEdgeTransport } from '../../src/transports';

const DEFAULT_EDGE_TRANSPORT_OPTIONS: VercelEdgeTransportOptions = {
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

const mockFetch = jest.fn();

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

    const transport = makeEdgeTransport(DEFAULT_EDGE_TRANSPORT_OPTIONS);

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
      get: jest.fn(),
    };

    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        headers,
        status: 200,
        text: () => Promise.resolve({}),
      }),
    );

    const transport = makeEdgeTransport(DEFAULT_EDGE_TRANSPORT_OPTIONS);

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
      referrerPolicy: 'strict-origin',
      keepalive: false,
      referrer: 'http://example.org',
    };

    const transport = makeEdgeTransport({ ...DEFAULT_EDGE_TRANSPORT_OPTIONS, fetchOptions: REQUEST_OPTIONS });

    await transport.send(ERROR_ENVELOPE);
    await transport.flush();
    expect(mockFetch).toHaveBeenLastCalledWith(DEFAULT_EDGE_TRANSPORT_OPTIONS.url, {
      body: serializeEnvelope(ERROR_ENVELOPE),
      method: 'POST',
      ...REQUEST_OPTIONS,
    });
  });
});

describe('IsolatedPromiseBuffer', () => {
  it('should not call tasks until drained', async () => {
    const ipb = new IsolatedPromiseBuffer();

    const task1 = jest.fn(() => Promise.resolve({}));
    const task2 = jest.fn(() => Promise.resolve({}));

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

    const task1 = jest.fn(() => Promise.resolve({}));
    const task2 = jest.fn(() => Promise.resolve({}));
    const task3 = jest.fn(() => Promise.resolve({}));
    const task4 = jest.fn(() => Promise.resolve({}));

    await ipb.add(task1);
    await ipb.add(task2);
    await ipb.add(task3);

    await expect(ipb.add(task4)).rejects.toThrowError('Not adding Promise because buffer limit was reached.');
  });

  it('should not throw when one of the tasks throws when drained', async () => {
    const ipb = new IsolatedPromiseBuffer();

    const task1 = jest.fn(() => Promise.resolve({}));
    const task2 = jest.fn(() => Promise.reject(new Error()));

    await ipb.add(task1);
    await ipb.add(task2);

    await expect(ipb.drain()).resolves.toEqual(true);

    expect(task1).toHaveBeenCalled();
    expect(task2).toHaveBeenCalled();
  });
});
