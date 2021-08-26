/// <reference lib="es2020" />

import { eventToSentryRequest, sessionToSentryRequest } from '@sentry/core';
import { Session } from '@sentry/hub';
import { Event, Response, SessionAggregates, Status, TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils';
import * as http from 'http';

import { BaseTransport } from '../../src/transports/base';

const dsn = 'http://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622';
const storePath = '/mysubpath/api/50622/store/';
const envelopePath = '/mysubpath/api/50622/envelope/';
const tunnel = 'https://hello.com/world';

const eventPayload: Event = {
  event_id: '1337',
  type: 'event',
};
const transactionPayload: Event = {
  event_id: '42',
  type: 'transaction',
};
const sessionPayload = new Session({
  environment: 'test',
  release: '1.0',
  sid: '353463243253453254',
});
const sessionsPayload: SessionAggregates = {
  attrs: { environment: 'test', release: '1.0' },
  aggregates: [{ started: '2021-03-17T16:00:00.000Z', exited: 1 }],
};

class TestTransport extends BaseTransport {
  public constructor(public options: TransportOptions) {
    super(options);
    this.module = http;
  }
  public sendEvent(event: Event): Promise<Response> {
    return this._send(eventToSentryRequest(event, this._api), event);
  }
  public sendSession(session: Session | SessionAggregates): PromiseLike<Response> {
    return this._send(sessionToSentryRequest(session, this._api), session);
  }
}

let setEncodingMock: jest.Mock;
let endMock: jest.Mock;
let requestMock: jest.Mock;
let mockReturnCode = 200;
let mockHeaders = {};

function createTransport(options: Partial<TransportOptions> = {}): TestTransport {
  const transport = new TestTransport({
    ...options,
    dsn: 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
  });

  setEncodingMock = jest.fn();

  endMock = jest.fn((_body, callback) => {
    // setImmediate is used here and in buffer/queue tests, so that we can assert on valid
    // enqueueing/dequeueing behavior by stepping forward through event-loop
    setImmediate(() => {
      callback({
        headers: mockHeaders,
        setEncoding: setEncodingMock,
        statusCode: mockReturnCode,
        on: jest.fn(),
      });
    });
  });

  requestMock = jest.fn((_options: any, callback: any) => ({
    end: (body: any) => {
      return endMock(body, callback);
    },
    on: jest.fn(),
  }));

  transport.module = {
    request: requestMock,
  };

  return transport;
}

function assertBasicOptions(options: any, useEnvelope: boolean = false): void {
  expect(options.headers['X-Sentry-Auth']).toContain('sentry_version');
  expect(options.headers['X-Sentry-Auth']).toContain('sentry_client');
  expect(options.headers['X-Sentry-Auth']).toContain('sentry_key');
  expect(options.port).toEqual('8989');
  expect(options.path).toEqual(useEnvelope ? envelopePath : storePath);
  expect(options.hostname).toEqual('sentry.io');
}

function parseEnvelope(body: any) {
  const [envelopeHeaderString, itemHeaderString, itemString] = body.split('\n');

  return {
    envelopeHeader: JSON.parse(envelopeHeaderString),
    itemHeader: JSON.parse(itemHeaderString),
    item: JSON.parse(itemString),
  };
}

describe('BaseTransport', () => {
  beforeEach(() => {
    mockReturnCode = 200;
    mockHeaders = {};
    jest.clearAllMocks();
  });

  test('Allow for configuration through options object', async () => {
    mockReturnCode = 200;
    const transport = createTransport({
      dsn,
      headers: {
        a: 'b',
      },
    });
    await transport.sendEvent({
      message: 'test',
    });

    const requestOptions = requestMock.mock.calls[0][0];
    assertBasicOptions(requestOptions);
    expect(requestOptions.headers).toEqual(expect.objectContaining({ a: 'b' }));
  });

  describe('Delivery', () => {
    test('Send 200', async () => {
      const transport = createTransport({ dsn });
      await transport.sendEvent({
        message: 'test',
      });

      const requestOptions = requestMock.mock.calls[0][0];
      assertBasicOptions(requestOptions);
      expect(setEncodingMock).toHaveBeenCalled();
    });

    test('Send 400', async () => {
      mockReturnCode = 400;
      const transport = createTransport({ dsn });

      try {
        await transport.sendEvent({
          message: 'test',
        });
      } catch (e) {
        const requestOptions = requestMock.mock.calls[0][0];
        assertBasicOptions(requestOptions);
        expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
      }
    });

    test('Send 200 session', async () => {
      const transport = createTransport({ dsn });
      await transport.sendSession(new Session());

      const requestOptions = requestMock.mock.calls[0][0];
      assertBasicOptions(requestOptions, true);
      expect(setEncodingMock).toHaveBeenCalled();
    });

    test('Send 400 session', async () => {
      mockReturnCode = 400;
      const transport = createTransport({ dsn });

      try {
        await transport.sendSession(new Session());
      } catch (e) {
        const requestOptions = requestMock.mock.calls[0][0];
        assertBasicOptions(requestOptions, true);
        expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
      }
    });

    test('Send 200 request mode sessions', async () => {
      const transport = createTransport({ dsn });
      await transport.sendSession(sessionsPayload);

      const requestOptions = requestMock.mock.calls[0][0];
      assertBasicOptions(requestOptions, true);
      expect(setEncodingMock).toHaveBeenCalled();
    });

    test('Send 400 request mode session', async () => {
      mockReturnCode = 400;
      const transport = createTransport({ dsn });

      try {
        await transport.sendSession(sessionsPayload);
      } catch (e) {
        const requestOptions = requestMock.mock.calls[0][0];
        assertBasicOptions(requestOptions, true);
        expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
      }
    });

    test('Send x-sentry-error header', async () => {
      mockReturnCode = 429;
      mockHeaders = {
        'x-sentry-error': 'test-failed',
      };
      const transport = createTransport({ dsn });

      try {
        await transport.sendEvent({
          message: 'test',
        });
      } catch (e) {
        const requestOptions = requestMock.mock.calls[0][0];
        assertBasicOptions(requestOptions);
        expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode}): test-failed`));
      }
    });

    test('Sends a request to tunnel if configured', async () => {
      const transport = createTransport({ dsn, tunnel });

      await transport.sendEvent({
        message: 'test',
      });

      const requestOptions = requestMock.mock.calls[0][0];
      expect(requestOptions.protocol).toEqual('https:');
      expect(requestOptions.hostname).toEqual('hello.com');
      expect(requestOptions.path).toEqual('/world');
    });
  });

  describe('Retrying', () => {
    test('Back-off using retry-after header', async () => {
      const retryAfterSeconds = 10;
      mockReturnCode = 429;
      mockHeaders = {
        'retry-after': retryAfterSeconds,
      };
      const transport = createTransport({ dsn });

      const now = Date.now();
      const mock = jest
        .spyOn(Date, 'now')
        // Check for first event
        .mockReturnValueOnce(now)
        // Setting disabledUntil
        .mockReturnValueOnce(now)
        // Check for second event
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // Check for third event
        .mockReturnValueOnce(now + retryAfterSeconds * 1000);

      try {
        await transport.sendEvent({ message: 'test' });
      } catch (e) {
        expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
      }

      try {
        await transport.sendEvent({ message: 'test' });
      } catch (e) {
        expect(e.status).toEqual(429);
        expect(e.reason).toEqual(
          `Transport for event requests locked till ${new Date(
            now + retryAfterSeconds * 1000,
          )} due to too many requests.`,
        );
        expect(e.payload.message).toEqual('test');
        expect(e.type).toEqual('event');
      }

      try {
        await transport.sendEvent({ message: 'test' });
      } catch (e) {
        expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
      }

      mock.mockRestore();
    });

    test('Back-off using x-sentry-rate-limits with bogus headers and missing categories should just lock them all', async () => {
      const retryAfterSeconds = 60;
      mockReturnCode = 429;
      mockHeaders = {
        'x-sentry-rate-limits': `sgthrthewhertht`,
      };
      const transport = createTransport({ dsn });
      const now = Date.now();
      const mock = jest
        .spyOn(Date, 'now')
        // 1st event - _isRateLimited - false
        .mockReturnValueOnce(now)
        // 1st event - _handleRateLimit
        .mockReturnValueOnce(now)
        // 2nd event - _isRateLimited - true (event category)
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 3rd event - _isRateLimited - true (transaction category)
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 4th event - _isRateLimited - false (event category)
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 4th event - _handleRateLimit
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 5th event - _isRateLimited - false (transaction category)
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 5th event - _handleRateLimit
        .mockReturnValueOnce(now + retryAfterSeconds * 1000);

      try {
        await transport.sendEvent(eventPayload);
      } catch (e) {
        expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
      }

      try {
        await transport.sendEvent(eventPayload);
      } catch (e) {
        expect(e.status).toEqual(429);
        expect(e.reason).toEqual(
          `Transport for event requests locked till ${new Date(
            now + retryAfterSeconds * 1000,
          )} due to too many requests.`,
        );
        expect(e.payload).toEqual(eventPayload);
        expect(e.type).toEqual('event');
      }

      try {
        await transport.sendEvent(transactionPayload);
      } catch (e) {
        expect(e.status).toEqual(429);
        expect(e.reason).toEqual(
          `Transport for transaction requests locked till ${new Date(
            now + retryAfterSeconds * 1000,
          )} due to too many requests.`,
        );
        expect(e.payload).toEqual(transactionPayload);
        expect(e.type).toEqual('transaction');
      }

      mockHeaders = {};
      mockReturnCode = 200;

      const eventRes = await transport.sendEvent(eventPayload);
      expect(eventRes.status).toEqual(Status.Success);

      const transactionRes = await transport.sendEvent(transactionPayload);
      expect(transactionRes.status).toEqual(Status.Success);

      mock.mockRestore();
    });

    test('Back-off using x-sentry-rate-limits with single category', async () => {
      const retryAfterSeconds = 10;
      mockReturnCode = 429;
      mockHeaders = {
        'x-sentry-rate-limits': `${retryAfterSeconds}:error:scope`,
      };
      const transport = createTransport({ dsn });
      const now = Date.now();
      const mock = jest
        .spyOn(Date, 'now')
        // 1st event - _isRateLimited - false
        .mockReturnValueOnce(now)
        // 1st event - _handleRateLimit
        .mockReturnValueOnce(now)
        // 2nd event - _isRateLimited - false (different category)
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 2nd event - _handleRateLimit
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 3rd event - _isRateLimited - false (different category - sessions)
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 3rd event - _handleRateLimit
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 4th event - _isRateLimited - true
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 5th event - _isRateLimited - false
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 5th event - _handleRateLimit
        .mockReturnValueOnce(now + retryAfterSeconds * 1000);

      try {
        await transport.sendEvent(eventPayload);
      } catch (e) {
        expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
      }

      mockHeaders = {};
      mockReturnCode = 200;

      const transactionRes = await transport.sendEvent(transactionPayload);
      expect(transactionRes.status).toEqual(Status.Success);

      const sessionsRes = await transport.sendSession(sessionPayload);
      expect(sessionsRes.status).toEqual(Status.Success);

      try {
        await transport.sendEvent(eventPayload);
      } catch (e) {
        expect(e.status).toEqual(429);
        expect(e.reason).toEqual(
          `Transport for event requests locked till ${new Date(
            now + retryAfterSeconds * 1000,
          )} due to too many requests.`,
        );
        expect(e.payload).toEqual(eventPayload);
        expect(e.type).toEqual('event');
      }

      const eventRes = await transport.sendEvent(eventPayload);
      expect(eventRes.status).toEqual(Status.Success);

      mock.mockRestore();
    });

    test('Back-off using x-sentry-rate-limits with multiple category', async () => {
      const retryAfterSeconds = 10;
      mockReturnCode = 429;
      mockHeaders = {
        'x-sentry-rate-limits': `${retryAfterSeconds}:error;transaction;session:scope`,
      };
      const transport = createTransport({ dsn });
      const now = Date.now();
      const mock = jest
        .spyOn(Date, 'now')
        // 1st event - _isRateLimited - false
        .mockReturnValueOnce(now)
        // 1st event - _handleRateLimit
        .mockReturnValueOnce(now)
        // 2nd event - _isRateLimited - true (event category)
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 3rd event - _isRateLimited - true (sessions category)
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 4th event - _isRateLimited - true (transactions category)
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 5th event - _isRateLimited - false (event category)
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 5th event - _handleRateLimit
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 6th event - _isRateLimited - false (sessions category)
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 6th event - handleRateLimit
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 7th event - _isRateLimited - false (transaction category)
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 7th event - handleRateLimit
        .mockReturnValueOnce(now + retryAfterSeconds * 1000);

      try {
        await transport.sendEvent(eventPayload);
      } catch (e) {
        expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
      }

      try {
        await transport.sendEvent(eventPayload);
      } catch (e) {
        expect(e.status).toEqual(429);
        expect(e.reason).toEqual(
          `Transport for event requests locked till ${new Date(
            now + retryAfterSeconds * 1000,
          )} due to too many requests.`,
        );
        expect(e.payload).toEqual(eventPayload);
        expect(e.type).toEqual('event');
      }

      try {
        await transport.sendSession(sessionPayload);
      } catch (e) {
        expect(e.status).toEqual(429);
        expect(e.reason).toEqual(
          `Transport for session requests locked till ${new Date(
            now + retryAfterSeconds * 1000,
          )} due to too many requests.`,
        );
        expect(e.payload.environment).toEqual(sessionPayload.environment);
        expect(e.payload.release).toEqual(sessionPayload.release);
        expect(e.payload.sid).toEqual(sessionPayload.sid);
        expect(e.type).toEqual('session');
      }

      try {
        await transport.sendEvent(transactionPayload);
      } catch (e) {
        expect(e.status).toEqual(429);
        expect(e.reason).toEqual(
          `Transport for transaction requests locked till ${new Date(
            now + retryAfterSeconds * 1000,
          )} due to too many requests.`,
        );
        expect(e.payload).toEqual(transactionPayload);
        expect(e.type).toEqual('transaction');
      }

      mockHeaders = {};
      mockReturnCode = 200;

      const eventRes = await transport.sendEvent(eventPayload);
      expect(eventRes.status).toEqual(Status.Success);

      const sessionsRes = await transport.sendSession(sessionPayload);
      expect(sessionsRes.status).toEqual(Status.Success);

      const transactionRes = await transport.sendEvent(transactionPayload);
      expect(transactionRes.status).toEqual(Status.Success);

      mock.mockRestore();
    });

    test('Back-off using x-sentry-rate-limits with missing categories should lock them all', async () => {
      const retryAfterSeconds = 10;
      mockReturnCode = 429;
      mockHeaders = {
        'x-sentry-rate-limits': `${retryAfterSeconds}::scope`,
      };
      const transport = createTransport({ dsn });
      const now = Date.now();
      const mock = jest
        .spyOn(Date, 'now')
        // 1st event - _isRateLimited - false
        .mockReturnValueOnce(now)
        // 1st event - _handleRateLimit
        .mockReturnValueOnce(now)
        // 2nd event - _isRateLimited - true (event category)
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 3rd event - _isRateLimited - true (transaction category)
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 4th event - _isRateLimited - false (event category)
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 4th event - _handleRateLimit
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 5th event - _isRateLimited - false (transaction category)
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 5th event - _handleRateLimit
        .mockReturnValueOnce(now + retryAfterSeconds * 1000);

      try {
        await transport.sendEvent(eventPayload);
      } catch (e) {
        expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
      }

      try {
        await transport.sendEvent(eventPayload);
      } catch (e) {
        expect(e.status).toEqual(429);
        expect(e.reason).toEqual(
          `Transport for event requests locked till ${new Date(
            now + retryAfterSeconds * 1000,
          )} due to too many requests.`,
        );
        expect(e.payload).toEqual(eventPayload);
        expect(e.type).toEqual('event');
      }

      try {
        await transport.sendEvent(transactionPayload);
      } catch (e) {
        expect(e.status).toEqual(429);
        expect(e.reason).toEqual(
          `Transport for transaction requests locked till ${new Date(
            now + retryAfterSeconds * 1000,
          )} due to too many requests.`,
        );
        expect(e.payload).toEqual(transactionPayload);
        expect(e.type).toEqual('transaction');
      }

      mockHeaders = {};
      mockReturnCode = 200;

      const eventRes = await transport.sendEvent(eventPayload);
      expect(eventRes.status).toEqual(Status.Success);

      const transactionRes = await transport.sendEvent(transactionPayload);
      expect(transactionRes.status).toEqual(Status.Success);

      mock.mockRestore();
    });

    test('Back-off using x-sentry-rate-limits with bogus categories should be dropped', async () => {
      const retryAfterSeconds = 10;
      mockReturnCode = 429;
      mockHeaders = {
        'x-sentry-rate-limits': `${retryAfterSeconds}:error;safegreg;eqwerw:scope`,
      };
      const transport = createTransport({ dsn });
      const now = Date.now();
      const mock = jest
        .spyOn(Date, 'now')
        // 1st event - _isRateLimited - false
        .mockReturnValueOnce(now)
        // 1st event - _handleRateLimit
        .mockReturnValueOnce(now)
        // 2nd event - _isRateLimited - true (event category)
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 3rd event - _isRateLimited - false (transaction category)
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 3rd Event - _handleRateLimit
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 4th event - _isRateLimited - false (event category)
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 4th event - _handleRateLimit
        .mockReturnValueOnce(now + retryAfterSeconds * 1000);

      try {
        await transport.sendEvent(eventPayload);
      } catch (e) {
        expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
      }

      try {
        await transport.sendEvent(eventPayload);
      } catch (e) {
        expect(e.status).toEqual(429);
        expect(e.reason).toEqual(
          `Transport for event requests locked till ${new Date(
            now + retryAfterSeconds * 1000,
          )} due to too many requests.`,
        );
        expect(e.payload).toEqual(eventPayload);
        expect(e.type).toEqual('event');
      }

      mockHeaders = {};
      mockReturnCode = 200;

      const transactionRes = await transport.sendEvent(transactionPayload);
      expect(transactionRes.status).toEqual(Status.Success);

      const eventRes = await transport.sendEvent(eventPayload);
      expect(eventRes.status).toEqual(Status.Success);

      mock.mockRestore();
    });

    test('Back-off using x-sentry-rate-limits should also trigger for 200 responses', async () => {
      const retryAfterSeconds = 10;
      mockReturnCode = 200;
      mockHeaders = {
        'x-sentry-rate-limits': `${retryAfterSeconds}:error;transaction:scope`,
      };
      const transport = createTransport({ dsn });
      const now = Date.now();
      const mock = jest
        .spyOn(Date, 'now')
        // 1st event - _isRateLimited - false
        .mockReturnValueOnce(now)
        // 1st event - _handleRateLimit
        .mockReturnValueOnce(now)
        // 2nd event - _isRateLimited - true
        .mockReturnValueOnce(now + (retryAfterSeconds / 2) * 1000)
        // 3rd event - _isRateLimited - false
        .mockReturnValueOnce(now + retryAfterSeconds * 1000)
        // 3rd event - _handleRateLimit
        .mockReturnValueOnce(now + retryAfterSeconds * 1000);

      let eventRes = await transport.sendEvent(eventPayload);
      expect(eventRes.status).toEqual(Status.Success);

      try {
        await transport.sendEvent(eventPayload);
      } catch (e) {
        expect(e.status).toEqual(429);
        expect(e.reason).toEqual(
          `Transport for event requests locked till ${new Date(
            now + retryAfterSeconds * 1000,
          )} due to too many requests.`,
        );
        expect(e.payload).toEqual(eventPayload);
        expect(e.type).toEqual('event');
      }

      mockReturnCode = 200;
      mockHeaders = {};

      eventRes = await transport.sendEvent(eventPayload);
      expect(eventRes.status).toEqual(Status.Success);

      mock.mockRestore();
    });
  });

  describe('Buffer/Queue', () => {
    test('Accepts all events when buffer is not full', async () => {
      const transport = createTransport({
        bufferSize: 3,
      });

      await expect(
        Promise.allSettled([
          transport.sendEvent(eventPayload),
          transport.sendEvent(transactionPayload),
          transport.sendSession(sessionPayload),
        ]),
      ).resolves.toEqual([
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'success' } },
      ]);
    });

    test('Queues events when buffer is full', async () => {
      const transport = createTransport({
        bufferSize: 1,
      });

      await expect(
        Promise.allSettled([
          transport.sendEvent(eventPayload),
          transport.sendEvent(eventPayload),
          transport.sendEvent(transactionPayload),
          transport.sendSession(sessionPayload),
          transport.sendSession(sessionsPayload),
        ]),
      ).resolves.toEqual([
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
      ]);
    });

    test('Rejects an event when buffer and corresponding event type queue is full', async () => {
      const transport = createTransport({
        bufferSize: 2,
        queueSize: {
          event: 1,
        },
      });

      await expect(
        Promise.allSettled([
          transport.sendEvent(eventPayload),
          transport.sendEvent(eventPayload),
          transport.sendEvent(eventPayload),
          transport.sendEvent(eventPayload),
        ]),
      ).resolves.toEqual([
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'rejected', reason: new SentryError('Error enqueueing event request: Queue is full') },
      ]);
    });

    test('Queue event of a different type, when buffer and other queues are full', async () => {
      const transport = createTransport({
        bufferSize: 3,
        queueSize: {
          event: 2,
          transaction: 1,
          session: 1,
        },
      });

      await expect(
        Promise.allSettled([
          // Send 3 requests
          transport.sendEvent(transactionPayload),
          transport.sendEvent(eventPayload),
          transport.sendSession(sessionPayload),
          // 1st transaction: Queued
          transport.sendEvent(transactionPayload),
          // 1st event: Queued
          transport.sendEvent(eventPayload),
          // 2nd transaction: Rejected (queue size of 1)
          transport.sendEvent(transactionPayload),
          // 2nd event: Queued
          transport.sendEvent(eventPayload),
          // 3rd event: Rejected (queue size of 2)
          transport.sendEvent(eventPayload),
          // 1st session: Queued
          transport.sendSession(sessionPayload),
          // 2nd session: Rejected (queue size of 1)
          transport.sendSession(sessionsPayload),
        ]),
      ).resolves.toEqual([
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'success' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'rejected', reason: new SentryError('Error enqueueing transaction request: Queue is full') },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'rejected', reason: new SentryError('Error enqueueing event request: Queue is full') },
        { status: 'fulfilled', value: { status: 'accepted' } },
        { status: 'rejected', reason: new SentryError('Error enqueueing session request: Queue is full') },
      ]);
    });

    test('Sends queued requests after buffer frees up', async done => {
      const transport = createTransport({
        bufferSize: 2,
      });

      void transport.sendEvent(eventPayload);
      void transport.sendEvent(eventPayload);
      void transport.sendEvent(eventPayload);
      void transport.sendEvent(eventPayload);

      expect(requestMock).toHaveBeenCalledTimes(2);

      setImmediate(() => {
        expect(requestMock).toHaveBeenCalledTimes(4);
        done();
      });
    });

    test('Sends queued requests of different type, one of each after buffer frees up', async done => {
      const transport = createTransport({
        bufferSize: 2,
      });

      void transport.sendEvent(eventPayload);
      void transport.sendEvent(eventPayload);
      void transport.sendSession(sessionPayload);
      void transport.sendSession(sessionPayload);
      void transport.sendEvent(eventPayload);
      void transport.sendEvent(eventPayload);

      expect(requestMock).toHaveBeenCalledTimes(2);

      setImmediate(() => {
        expect(requestMock).toHaveBeenCalledTimes(4);
        expect(JSON.parse(endMock.mock.calls[2][0]).type).toEqual('event');
        expect(parseEnvelope(endMock.mock.calls[3][0]).itemHeader.type).toEqual('session');

        setImmediate(() => {
          expect(requestMock).toHaveBeenCalledTimes(6);
          expect(JSON.parse(endMock.mock.calls[4][0]).type).toEqual('event');
          expect(parseEnvelope(endMock.mock.calls[5][0]).itemHeader.type).toEqual('session');
          done();
        });
      });
    });

    test('Sends queued requests of different type, one of each, and drains the rest when theres no more of other types', async done => {
      const transport = createTransport({
        bufferSize: 2,
      });

      void transport.sendEvent(eventPayload);
      void transport.sendEvent(eventPayload);
      void transport.sendSession(sessionPayload);
      void transport.sendEvent(eventPayload);
      void transport.sendEvent(eventPayload);
      void transport.sendEvent(eventPayload);

      expect(requestMock).toHaveBeenCalledTimes(2);

      setImmediate(() => {
        expect(requestMock).toHaveBeenCalledTimes(4);
        expect(JSON.parse(endMock.mock.calls[2][0]).type).toEqual('event');
        expect(parseEnvelope(endMock.mock.calls[3][0]).itemHeader.type).toEqual('session');

        setImmediate(() => {
          expect(requestMock).toHaveBeenCalledTimes(6);
          expect(JSON.parse(endMock.mock.calls[4][0]).type).toEqual('event');
          expect(JSON.parse(endMock.mock.calls[5][0]).type).toEqual('event');
          done();
        });
      });
    });

    test('Sends queued requests in a predefined priority order, despite queueing order (event > transaction > session)', async done => {
      const transport = createTransport({
        bufferSize: 2,
      });

      void transport.sendEvent(eventPayload);
      void transport.sendEvent(eventPayload);
      void transport.sendSession(sessionPayload);
      void transport.sendEvent(transactionPayload);
      void transport.sendEvent(eventPayload);

      expect(requestMock).toHaveBeenCalledTimes(2);

      setImmediate(() => {
        expect(requestMock).toHaveBeenCalledTimes(4);
        expect(JSON.parse(endMock.mock.calls[2][0]).type).toEqual('event');
        expect(parseEnvelope(endMock.mock.calls[3][0]).itemHeader.type).toEqual('transaction');

        setImmediate(() => {
          expect(requestMock).toHaveBeenCalledTimes(5);
          expect(parseEnvelope(endMock.mock.calls[4][0]).itemHeader.type).toEqual('session');
          done();
        });
      });
    });

    test('Remembers what queue to get event from (state-machine-like)', async done => {
      const transport = createTransport({
        bufferSize: 2,
      });

      // fill buffer
      void transport.sendEvent(eventPayload);
      void transport.sendEvent(eventPayload);

      // queue event
      void transport.sendEvent(eventPayload);

      expect(requestMock).toHaveBeenCalledTimes(2);

      setImmediate(() => {
        // fill buffer again
        void transport.sendEvent(eventPayload);

        expect(requestMock).toHaveBeenCalledTimes(4);
        expect(JSON.parse(endMock.mock.calls[2][0]).type).toEqual('event');
        expect(JSON.parse(endMock.mock.calls[3][0]).type).toEqual('event');

        // queue events, this time it should start from transaction first, as event was picked up previously
        void transport.sendEvent(transactionPayload);
        void transport.sendEvent(eventPayload);

        setImmediate(() => {
          expect(requestMock).toHaveBeenCalledTimes(6);
          expect(parseEnvelope(endMock.mock.calls[4][0]).itemHeader.type).toEqual('transaction');
          expect(JSON.parse(endMock.mock.calls[5][0]).type).toEqual('event');
          done();
        });
      });
    });
  });
});
