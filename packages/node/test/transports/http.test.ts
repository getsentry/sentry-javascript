let mockReturnCode = 200;
let mockHeaders = {};
let mockCheckHeaders: any;
const mockSetEncoding = jest.fn();
jest.mock('http', () => ({
  Agent: jest.fn(),
  request: (options: any, callback: any) => {
    expect(options.headers['X-Sentry-Auth']).toContain('sentry_version');
    expect(options.headers['X-Sentry-Auth']).toContain('sentry_timestamp');
    expect(options.headers['X-Sentry-Auth']).toContain('sentry_client');
    expect(options.headers['X-Sentry-Auth']).toContain('sentry_key');
    expect(options.port).toEqual('8989');
    expect(options.path).toEqual('/mysubpath/api/50622/store/');
    expect(options.hostname).toEqual('sentry.io');
    if (mockCheckHeaders) {
      expect(options.headers).toEqual(expect.objectContaining(mockCheckHeaders));
    }
    return {
      end: () => {
        callback({
          headers: mockHeaders,
          setEncoding: mockSetEncoding,
          statusCode: mockReturnCode,
        });
      },
      on: jest.fn(),
    };
  },
}));

import { DSN, SentryError } from '@sentry/core';
import { getCurrentHub, init, NodeClient } from '../../src';

const dsn = 'http://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622';

describe('HTTPTransport', () => {
  beforeEach(() => {
    mockHeaders = {};
    mockReturnCode = 200;
  });

  test('send 200', async () => {
    init({
      dsn,
    });
    await getCurrentHub()
      .getClient()
      .captureMessage('test');
    expect(mockSetEncoding).toHaveBeenCalled();
  });

  test('send 400', async () => {
    mockReturnCode = 400;
    const client = new NodeClient({ dsn });
    client.install();
    return expect(client.captureMessage('test')).rejects.toEqual(new SentryError(`HTTP Error (${mockReturnCode})`));
  });

  test('send x-sentry-error header', async () => {
    mockReturnCode = 429;
    mockHeaders = {
      'x-sentry-error': 'test-failed',
    };
    const client = new NodeClient({ dsn });
    client.install();
    return expect(client.captureMessage('test')).rejects.toEqual(
      new SentryError(`HTTP Error (${mockReturnCode}): test-failed`),
    );
  });

  test('transport options', async () => {
    mockReturnCode = 200;
    const client = new NodeClient({
      dsn,
      transportOptions: {
        dsn: new DSN(dsn),
        headers: {
          a: 'b',
        },
      },
    });
    client.install();
    mockCheckHeaders = { a: 'b' };
    await client.captureMessage('test');
  });
});
