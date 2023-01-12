import type { EventEnvelope, EventItem } from '@sentry/types';
import { createEnvelope, serializeEnvelope } from '@sentry/utils';
import { TextEncoder } from 'util';

import type { EdgeTransportOptions } from '../../src/edge/transport';
import { makeEdgeTransport } from '../../src/edge/transport';

const DEFAULT_EDGE_TRANSPORT_OPTIONS: EdgeTransportOptions = {
  url: 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7',
  recordDroppedEvent: () => undefined,
  textEncoder: new TextEncoder(),
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

// @ts-ignore fetch is not on global
const oldFetch = global.fetch;
// @ts-ignore fetch is not on global
global.fetch = mockFetch;

afterAll(() => {
  // @ts-ignore fetch is not on global
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
    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(mockFetch).toHaveBeenLastCalledWith(DEFAULT_EDGE_TRANSPORT_OPTIONS.url, {
      body: serializeEnvelope(ERROR_ENVELOPE, new TextEncoder()),
      method: 'POST',
      referrerPolicy: 'origin',
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
    expect(mockFetch).toHaveBeenLastCalledWith(DEFAULT_EDGE_TRANSPORT_OPTIONS.url, {
      body: serializeEnvelope(ERROR_ENVELOPE, new TextEncoder()),
      method: 'POST',
      ...REQUEST_OPTIONS,
    });
  });
});
