import { EventEnvelope, EventItem } from '@sentry/types';
import { createEnvelope, serializeEnvelope } from '@sentry/utils';

import { FetchTransportOptions, makeNewFetchTransport } from '../../../src/transports/fetch';
import { FetchImpl } from '../../../src/transports/utils';

const DEFAULT_FETCH_TRANSPORT_OPTIONS: FetchTransportOptions = {
  url: 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7',
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

describe('NewFetchTransport', () => {
  it('calls fetch with the given URL', async () => {
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        headers: new Headers(),
        status: 200,
        text: () => Promise.resolve({}),
      }),
    ) as unknown as FetchImpl;
    const transport = makeNewFetchTransport(DEFAULT_FETCH_TRANSPORT_OPTIONS, mockFetch);

    expect(mockFetch).toHaveBeenCalledTimes(0);
    const res = await transport.send(ERROR_ENVELOPE);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(res.status).toBe('success');

    expect(mockFetch).toHaveBeenLastCalledWith(DEFAULT_FETCH_TRANSPORT_OPTIONS.url, {
      body: serializeEnvelope(ERROR_ENVELOPE),
      method: 'POST',
      referrerPolicy: 'origin',
    });
  });

  it('sets rate limit headers', async () => {
    const headers = {
      get: jest.fn(),
    };

    const mockFetch = jest.fn(() =>
      Promise.resolve({
        headers,
        status: 200,
        text: () => Promise.resolve({}),
      }),
    ) as unknown as FetchImpl;
    const transport = makeNewFetchTransport(DEFAULT_FETCH_TRANSPORT_OPTIONS, mockFetch);

    expect(headers.get).toHaveBeenCalledTimes(0);
    await transport.send(ERROR_ENVELOPE);

    expect(headers.get).toHaveBeenCalledTimes(2);
    expect(headers.get).toHaveBeenCalledWith('X-Sentry-Rate-Limits');
    expect(headers.get).toHaveBeenCalledWith('Retry-After');
  });

  it('allows for custom options to be passed in', async () => {
    const mockFetch = jest.fn(() =>
      Promise.resolve({
        headers: new Headers(),
        status: 200,
        text: () => Promise.resolve({}),
      }),
    ) as unknown as FetchImpl;

    const REQUEST_OPTIONS: RequestInit = {
      referrerPolicy: 'strict-origin',
      keepalive: true,
      referrer: 'http://example.org',
    };

    const transport = makeNewFetchTransport(
      { ...DEFAULT_FETCH_TRANSPORT_OPTIONS, requestOptions: REQUEST_OPTIONS },
      mockFetch,
    );

    await transport.send(ERROR_ENVELOPE);
    expect(mockFetch).toHaveBeenLastCalledWith(DEFAULT_FETCH_TRANSPORT_OPTIONS.url, {
      body: serializeEnvelope(ERROR_ENVELOPE),
      method: 'POST',
      ...REQUEST_OPTIONS,
    });
  });
});
