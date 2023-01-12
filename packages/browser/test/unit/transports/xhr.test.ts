import type { EventEnvelope, EventItem } from '@sentry/types';
import { createEnvelope, serializeEnvelope } from '@sentry/utils';
import { TextEncoder } from 'util';

import type { BrowserTransportOptions } from '../../../src/transports/types';
import { makeXHRTransport } from '../../../src/transports/xhr';

const DEFAULT_XHR_TRANSPORT_OPTIONS: BrowserTransportOptions = {
  url: 'https://sentry.io/api/42/store/?sentry_key=123&sentry_version=7',
  recordDroppedEvent: () => undefined,
  textEncoder: new TextEncoder(),
};

const ERROR_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

function createXHRMock() {
  const retryAfterSeconds = 10;

  const xhrMock: Partial<XMLHttpRequest> = {
    open: jest.fn(),
    send: jest.fn(),
    setRequestHeader: jest.fn(),
    readyState: 4,
    status: 200,
    response: 'Hello World!',
    onreadystatechange: () => {},
    getResponseHeader: jest.fn((header: string) => {
      switch (header) {
        case 'Retry-After':
          return '10';
        case `${retryAfterSeconds}`:
          return null;
        default:
          return `${retryAfterSeconds}:error:scope`;
      }
    }),
  };

  // casting `window` as `any` because XMLHttpRequest is missing in Window (TS-only)
  jest.spyOn(window as any, 'XMLHttpRequest').mockImplementation(() => xhrMock as XMLHttpRequest);

  return xhrMock;
}

describe('NewXHRTransport', () => {
  const xhrMock: Partial<XMLHttpRequest> = createXHRMock();

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('makes an XHR request to the given URL', async () => {
    const transport = makeXHRTransport(DEFAULT_XHR_TRANSPORT_OPTIONS);
    expect(xhrMock.open).toHaveBeenCalledTimes(0);
    expect(xhrMock.setRequestHeader).toHaveBeenCalledTimes(0);
    expect(xhrMock.send).toHaveBeenCalledTimes(0);

    await Promise.all([transport.send(ERROR_ENVELOPE), (xhrMock as XMLHttpRequest).onreadystatechange!({} as Event)]);

    expect(xhrMock.open).toHaveBeenCalledTimes(1);
    expect(xhrMock.open).toHaveBeenCalledWith('POST', DEFAULT_XHR_TRANSPORT_OPTIONS.url);
    expect(xhrMock.send).toHaveBeenCalledTimes(1);
    expect(xhrMock.send).toHaveBeenCalledWith(serializeEnvelope(ERROR_ENVELOPE, new TextEncoder()));
  });

  it('sets rate limit response headers', async () => {
    const transport = makeXHRTransport(DEFAULT_XHR_TRANSPORT_OPTIONS);

    await Promise.all([transport.send(ERROR_ENVELOPE), (xhrMock as XMLHttpRequest).onreadystatechange!({} as Event)]);

    expect(xhrMock.getResponseHeader).toHaveBeenCalledTimes(2);
    expect(xhrMock.getResponseHeader).toHaveBeenCalledWith('X-Sentry-Rate-Limits');
    expect(xhrMock.getResponseHeader).toHaveBeenCalledWith('Retry-After');
  });

  it('sets custom request headers', async () => {
    const headers = {
      referrerPolicy: 'strict-origin',
      keepalive: 'true',
      referrer: 'http://example.org',
    };
    const options: BrowserTransportOptions = {
      ...DEFAULT_XHR_TRANSPORT_OPTIONS,
      headers,
    };

    const transport = makeXHRTransport(options);
    await Promise.all([transport.send(ERROR_ENVELOPE), (xhrMock as XMLHttpRequest).onreadystatechange!({} as Event)]);

    expect(xhrMock.setRequestHeader).toHaveBeenCalledTimes(3);
    expect(xhrMock.setRequestHeader).toHaveBeenCalledWith('referrerPolicy', headers.referrerPolicy);
    expect(xhrMock.setRequestHeader).toHaveBeenCalledWith('keepalive', headers.keepalive);
    expect(xhrMock.setRequestHeader).toHaveBeenCalledWith('referrer', headers.referrer);
  });
});
