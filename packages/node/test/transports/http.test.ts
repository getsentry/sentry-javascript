import { TransportOptions } from '@sentry/types';
import { SentryError } from '@sentry/utils/error';
import * as HttpsProxyAgent from 'https-proxy-agent';
import { HTTPTransport } from '../../src/transports/http';

const mockSetEncoding = jest.fn();
const dsn = 'http://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622';
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

function assertBasicOptions(options: any): void {
  expect(options.headers['X-Sentry-Auth']).toContain('sentry_version');
  expect(options.headers['X-Sentry-Auth']).toContain('sentry_timestamp');
  expect(options.headers['X-Sentry-Auth']).toContain('sentry_client');
  expect(options.headers['X-Sentry-Auth']).toContain('sentry_key');
  expect(options.port).toEqual('8989');
  expect(options.path).toEqual('/mysubpath/api/50622/store/');
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
