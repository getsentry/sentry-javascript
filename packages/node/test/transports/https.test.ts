import { Session } from '@sentry/hub';
import { SessionAggregates, TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils';
import * as https from 'https';
import * as HttpsProxyAgent from 'https-proxy-agent';

import { HTTPSTransport } from '../../src/transports/https';

const mockSetEncoding = jest.fn();
const dsn = 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622';
const storePath = '/mysubpath/api/50622/store/';
const envelopePath = '/mysubpath/api/50622/envelope/';
const tunnel = 'https://hello.com/world';
const sessionsPayload: SessionAggregates = {
  attrs: { environment: 'test', release: '1.0' },
  aggregates: [{ started: '2021-03-17T16:00:00.000Z', exited: 1 }],
};
let mockReturnCode = 200;
let mockHeaders = {};

jest.mock('fs', () => ({
  readFileSync(): string {
    return 'mockedCert';
  },
}));

function createTransport(options: TransportOptions): HTTPSTransport {
  const transport = new HTTPSTransport(options);
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
  expect(options.path).toEqual(useEnvelope ? envelopePath : storePath);
  expect(options.hostname).toEqual('sentry.io');
}

describe('HTTPSTransport', () => {
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

  test('send 200 request mode session', async () => {
    const transport = createTransport({ dsn });
    await transport.sendSession(sessionsPayload);

    const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
    assertBasicOptions(requestOptions, true);
    expect(mockSetEncoding).toHaveBeenCalled();
  });

  test('send 400 request mode session', async () => {
    mockReturnCode = 400;
    const transport = createTransport({ dsn });

    try {
      await transport.sendSession(sessionsPayload);
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

  test('sends a request to tunnel if configured', async () => {
    const transport = createTransport({ dsn, tunnel });

    await transport.sendEvent({
      message: 'test',
    });

    const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
    expect(requestOptions.protocol).toEqual('https:');
    expect(requestOptions.hostname).toEqual('hello.com');
    expect(requestOptions.path).toEqual('/world');
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

  describe('proxy', () => {
    test('can be configured through client option', async () => {
      const transport = createTransport({
        dsn,
        httpsProxy: 'https://example.com:8080',
      });
      const client = (transport.client as unknown) as { proxy: Record<string, string | number>; secureProxy: boolean };
      expect(client).toBeInstanceOf(HttpsProxyAgent);
      expect(client.secureProxy).toEqual(true);
      expect(client.proxy).toEqual(expect.objectContaining({ protocol: 'https:', port: 8080, host: 'example.com' }));
    });

    test('can be configured through env variables option', async () => {
      process.env.https_proxy = 'https://example.com:8080';
      const transport = createTransport({
        dsn,
        httpsProxy: 'https://example.com:8080',
      });
      const client = (transport.client as unknown) as { proxy: Record<string, string | number>; secureProxy: boolean };
      expect(client).toBeInstanceOf(HttpsProxyAgent);
      expect(client.secureProxy).toEqual(true);
      expect(client.proxy).toEqual(expect.objectContaining({ protocol: 'https:', port: 8080, host: 'example.com' }));
      delete process.env.https_proxy;
    });

    test('https proxies have priority in client option', async () => {
      const transport = createTransport({
        dsn,
        httpProxy: 'http://unsecure-example.com:8080',
        httpsProxy: 'https://example.com:8080',
      });
      const client = (transport.client as unknown) as { proxy: Record<string, string | number>; secureProxy: boolean };
      expect(client).toBeInstanceOf(HttpsProxyAgent);
      expect(client.secureProxy).toEqual(true);
      expect(client.proxy).toEqual(expect.objectContaining({ protocol: 'https:', port: 8080, host: 'example.com' }));
    });

    test('https proxies have priority in env variables', async () => {
      process.env.http_proxy = 'http://unsecure-example.com:8080';
      process.env.https_proxy = 'https://example.com:8080';
      const transport = createTransport({
        dsn,
      });
      const client = (transport.client as unknown) as { proxy: Record<string, string | number>; secureProxy: boolean };
      expect(client).toBeInstanceOf(HttpsProxyAgent);
      expect(client.secureProxy).toEqual(true);
      expect(client.proxy).toEqual(expect.objectContaining({ protocol: 'https:', port: 8080, host: 'example.com' }));
      delete process.env.http_proxy;
      delete process.env.https_proxy;
    });

    test('client options have priority over env variables', async () => {
      process.env.https_proxy = 'https://env-example.com:8080';
      const transport = createTransport({
        dsn,
        httpsProxy: 'https://example.com:8080',
      });
      const client = (transport.client as unknown) as { proxy: Record<string, string | number>; secureProxy: boolean };
      expect(client).toBeInstanceOf(HttpsProxyAgent);
      expect(client.secureProxy).toEqual(true);
      expect(client.proxy).toEqual(expect.objectContaining({ protocol: 'https:', port: 8080, host: 'example.com' }));
      delete process.env.https_proxy;
    });

    test('no_proxy allows for skipping specific hosts', async () => {
      process.env.no_proxy = 'sentry.io';
      const transport = createTransport({
        dsn,
        httpsProxy: 'https://example.com:8080',
      });
      expect(transport.client).toBeInstanceOf(https.Agent);
    });

    test('no_proxy works with a port', async () => {
      process.env.https_proxy = 'https://example.com:8080';
      process.env.no_proxy = 'sentry.io:8989';
      const transport = createTransport({
        dsn,
      });
      expect(transport.client).toBeInstanceOf(https.Agent);
      delete process.env.https_proxy;
    });

    test('no_proxy works with multiple comma-separated hosts', async () => {
      process.env.http_proxy = 'https://example.com:8080';
      process.env.no_proxy = 'example.com,sentry.io,wat.com:1337';
      const transport = createTransport({
        dsn,
      });
      expect(transport.client).toBeInstanceOf(https.Agent);
      delete process.env.https_proxy;
    });

    test('can configure tls certificate through client option', async () => {
      mockReturnCode = 200;
      const transport = createTransport({
        caCerts: './some/path.pem',
        dsn,
      });
      await transport.sendEvent({
        message: 'test',
      });
      const requestOptions = (transport.module!.request as jest.Mock).mock.calls[0][0];
      expect(requestOptions.ca).toEqual('mockedCert');
    });
  });
});
