import { Session } from '@sentry/hub';
import { AggregatedSessions, Event, Status, TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils';
import * as HttpsProxyAgent from 'https-proxy-agent';

import { HTTPTransport } from '../../src/transports/http';

const mockSetEncoding = jest.fn();
const dsn = 'http://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622';
const transportPath = '/mysubpath/api/50622/store/';
const envelopePath = '/mysubpath/api/50622/envelope/';
const eventPayload: Event = {
  event_id: '1337',
};
const transactionPayload: Event = {
  event_id: '42',
  type: 'transaction',
};
const sessionsPayload: AggregatedSessions = {
  attrs: { environment: 'test', release: '1.0' },
  aggregates: [{ started: '2021-03-17T16:00:00.000Z', exited: 1 }],
};
let mockReturnCode = 200;
let mockHeaders = {};

function createTransport(options: TransportOptions): HTTPTransport {
  const transport = new HTTPTransport(options);
  transport.module = {
    request: jest.fn().mockImplementation((_options: any, callback: any) => ({
      end: () => {
        callback({
          headers: mockHeaders,
          setEncoding: mockSetEncoding,
          statusCode: mockReturnCode,
        });
      },
      on: jest.fn(),
    })),
  };
  return transport;
}

function assertBasicOptions(options: any, useEnvelope: boolean = false): void {
  expect(options.headers['X-Sentry-Auth']).toContain('sentry_version');
  expect(options.headers['X-Sentry-Auth']).toContain('sentry_client');
  expect(options.headers['X-Sentry-Auth']).toContain('sentry_key');
  expect(options.port).toEqual('8989');
  expect(options.path).toEqual(useEnvelope ? envelopePath : transportPath);
  expect(options.hostname).toEqual('sentry.io');
}

describe('HTTPTransport', () => {
  beforeEach(() => {
    mockReturnCode = 200;
    mockHeaders = {};
    jest.clearAllMocks();
  });

  test('send 200', async () => {
    const transport = createTransport({ dsn });
    await transport.sendEvent({
      message: 'test',
    });

    const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
    assertBasicOptions(requestOptions);
    expect(mockSetEncoding).toHaveBeenCalled();
  });

  test('send 400', async () => {
    mockReturnCode = 400;
    const transport = createTransport({ dsn });

    try {
      await transport.sendEvent({
        message: 'test',
      });
    } catch (e) {
      const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
      assertBasicOptions(requestOptions);
      expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
    }
  });

  test('send 200 aggregate sessions', async () => {
    const transport = createTransport({ dsn });
    await transport.sendSessions(sessionsPayload);

    const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
    assertBasicOptions(requestOptions, true);
    expect(mockSetEncoding).toHaveBeenCalled();
  });

  test('send 400 aggregate session', async () => {
    mockReturnCode = 400;
    const transport = createTransport({ dsn });

    try {
      await transport.sendSessions(sessionsPayload);
    } catch (e) {
      const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
      assertBasicOptions(requestOptions, true);
      expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
    }
  });

  test('send 200 session', async () => {
    const transport = createTransport({ dsn });
    await transport.sendSession(new Session());

    const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
    assertBasicOptions(requestOptions, true);
    expect(mockSetEncoding).toHaveBeenCalled();
  });

  test('send 400 session', async () => {
    mockReturnCode = 400;
    const transport = createTransport({ dsn });

    try {
      await transport.sendSession(new Session());
    } catch (e) {
      const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
      assertBasicOptions(requestOptions, true);
      expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
    }
  });

  test('send x-sentry-error header', async () => {
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
      const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
      assertBasicOptions(requestOptions);
      expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode}): test-failed`));
    }
  });

  test('back-off using retry-after header', async () => {
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
        `Transport locked till ${new Date(now + retryAfterSeconds * 1000)} due to too many requests.`,
      );
      expect(e.event.message).toEqual('test');
      expect(e.type).toEqual('event');
    }

    try {
      await transport.sendEvent({ message: 'test' });
    } catch (e) {
      expect(e).toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
    }

    mock.mockRestore();
  });

  test('back-off using x-sentry-rate-limits with single category', async () => {
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

    const aggregatedSessionsRes = await transport.sendSessions(sessionsPayload);
    expect(aggregatedSessionsRes.status).toEqual(Status.Success);

    try {
      await transport.sendEvent(eventPayload);
    } catch (e) {
      expect(e.status).toEqual(429);
      expect(e.reason).toEqual(
        `Transport locked till ${new Date(now + retryAfterSeconds * 1000)} due to too many requests.`,
      );
      expect(e.event).toEqual(eventPayload);
      expect(e.type).toEqual('event');
    }

    const eventRes = await transport.sendEvent(eventPayload);
    expect(eventRes.status).toEqual(Status.Success);

    mock.mockRestore();
  });

  test('back-off using x-sentry-rate-limits with multiple category', async () => {
    const retryAfterSeconds = 10;
    mockReturnCode = 429;
    mockHeaders = {
      'x-sentry-rate-limits': `${retryAfterSeconds}:error;transaction;sessions:scope`,
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
        `Transport locked till ${new Date(now + retryAfterSeconds * 1000)} due to too many requests.`,
      );
      expect(e.event).toEqual(eventPayload);
      expect(e.type).toEqual('event');
    }

    try {
      await transport.sendSessions(sessionsPayload);
    } catch (e) {
      expect(e.status).toEqual(429);
      expect(e.reason).toEqual(
        `Transport locked till ${new Date(now + retryAfterSeconds * 1000)} due to too many requests.`,
      );
      expect(e.event).toEqual(sessionsPayload);
      expect(e.type).toEqual('sessions');
    }

    try {
      await transport.sendEvent(transactionPayload);
    } catch (e) {
      expect(e.status).toEqual(429);
      expect(e.reason).toEqual(
        `Transport locked till ${new Date(now + retryAfterSeconds * 1000)} due to too many requests.`,
      );
      expect(e.event).toEqual(transactionPayload);
      expect(e.type).toEqual('transaction');
    }

    mockHeaders = {};
    mockReturnCode = 200;

    const eventRes = await transport.sendEvent(eventPayload);
    expect(eventRes.status).toEqual(Status.Success);

    const aggregatedSessionsRes = await transport.sendSessions(sessionsPayload);
    expect(aggregatedSessionsRes.status).toEqual(Status.Success);

    const transactionRes = await transport.sendEvent(transactionPayload);
    expect(transactionRes.status).toEqual(Status.Success);

    mock.mockRestore();
  });

  test('back-off using x-sentry-rate-limits with missing categories should lock them all', async () => {
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
        `Transport locked till ${new Date(now + retryAfterSeconds * 1000)} due to too many requests.`,
      );
      expect(e.event).toEqual(eventPayload);
      expect(e.type).toEqual('event');
    }

    try {
      await transport.sendEvent(transactionPayload);
    } catch (e) {
      expect(e.status).toEqual(429);
      expect(e.reason).toEqual(
        `Transport locked till ${new Date(now + retryAfterSeconds * 1000)} due to too many requests.`,
      );
      expect(e.event).toEqual(transactionPayload);
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

  test('back-off using x-sentry-rate-limits should also trigger for 200 responses', async () => {
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
        `Transport locked till ${new Date(now + retryAfterSeconds * 1000)} due to too many requests.`,
      );
      expect(e.event).toEqual(eventPayload);
      expect(e.type).toEqual('event');
    }

    mockReturnCode = 200;
    mockHeaders = {};

    eventRes = await transport.sendEvent(eventPayload);
    expect(eventRes.status).toEqual(Status.Success);

    mock.mockRestore();
  });

  test('transport options', async () => {
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

    const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
    assertBasicOptions(requestOptions);
    expect(requestOptions.headers).toEqual(expect.objectContaining({ a: 'b' }));
  });

  test('http proxy', async () => {
    mockReturnCode = 200;
    const transport = createTransport({
      dsn,
      httpProxy: 'http://example.com:8080',
    });
    await transport.sendEvent({
      message: 'test',
    });

    const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
    assertBasicOptions(requestOptions);
    expect(requestOptions.agent).toBeInstanceOf(HttpsProxyAgent);
    expect(requestOptions.agent.secureProxy).toEqual(false);
    expect(requestOptions.agent.proxy).toEqual(
      expect.objectContaining({ protocol: 'http:', port: 8080, host: 'example.com' }),
    );
  });
});
