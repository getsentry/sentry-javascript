import { createTransport } from '@sentry/core';
import { EventEnvelope, EventItem } from '@sentry/types';
import { createEnvelope, serializeEnvelope } from '@sentry/utils';
import * as http from 'http';
import * as https from 'https';

import { HTTPModule, HTTPModuleRequestIncomingMessage } from '../../../src/transports/base/http-module';
import { makeNodeTransport } from '../../../src/transports/new';
import testServerCerts from './test-server-certs';

jest.mock('@sentry/core', () => {
  const actualCore = jest.requireActual('@sentry/core');
  return {
    ...actualCore,
    createTransport: jest.fn().mockImplementation(actualCore.createTransport),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const httpProxyAgent = require('https-proxy-agent');
jest.mock('https-proxy-agent', () => {
  return jest.fn().mockImplementation(() => new http.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 }));
});

const SUCCESS = 200;
const RATE_LIMIT = 429;
const INVALID = 400;
const FAILED = 500;

interface TestServerOptions {
  statusCode: number;
  responseHeaders?: Record<string, string | string[] | undefined>;
}

let testServer: http.Server | undefined;

function setupTestServer(
  options: TestServerOptions,
  requestInspector?: (req: http.IncomingMessage, body: string) => void,
) {
  testServer = https.createServer(testServerCerts, (req, res) => {
    let body = '';

    req.on('data', data => {
      body += data;
    });

    req.on('end', () => {
      requestInspector?.(req, body);
    });

    res.writeHead(options.statusCode, options.responseHeaders);
    res.end();

    // also terminate socket because keepalive hangs connection a bit
    res.connection.end();
  });

  testServer.listen(8099);

  return new Promise(resolve => {
    testServer?.on('listening', resolve);
  });
}

const TEST_SERVER_URL = 'https://localhost:8099';

const EVENT_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

const SERIALIZED_EVENT_ENVELOPE = serializeEnvelope(EVENT_ENVELOPE);

const unsafeHttpsModule: HTTPModule = {
  request: jest
    .fn()
    .mockImplementation((options: https.RequestOptions, callback?: (res: HTTPModuleRequestIncomingMessage) => void) => {
      return https.request({ ...options, rejectUnauthorized: false }, callback);
    }),
};

describe('makeNewHttpsTransport()', () => {
  afterEach(() => {
    jest.clearAllMocks();

    if (testServer) {
      testServer.close();
    }
  });

  describe('.send()', () => {
    it('should correctly return successful server response', async () => {
      await setupTestServer({ statusCode: SUCCESS });

      const transport = makeNodeTransport({ httpModule: unsafeHttpsModule, url: TEST_SERVER_URL });
      const transportResponse = await transport.send(EVENT_ENVELOPE);

      expect(transportResponse).toEqual(expect.objectContaining({ status: 'success' }));
    });

    it('should correctly send envelope to server', async () => {
      await setupTestServer({ statusCode: SUCCESS }, (req, body) => {
        expect(req.method).toBe('POST');
        expect(body).toBe(SERIALIZED_EVENT_ENVELOPE);
      });

      const transport = makeNodeTransport({ httpModule: unsafeHttpsModule, url: TEST_SERVER_URL });
      await transport.send(EVENT_ENVELOPE);
    });

    it('should correctly send user-provided headers to server', async () => {
      await setupTestServer({ statusCode: SUCCESS }, req => {
        expect(req.headers).toEqual(
          expect.objectContaining({
            // node http module lower-cases incoming headers
            'x-some-custom-header-1': 'value1',
            'x-some-custom-header-2': 'value2',
          }),
        );
      });

      const transport = makeNodeTransport({
        httpModule: unsafeHttpsModule,
        url: TEST_SERVER_URL,
        headers: {
          'X-Some-Custom-Header-1': 'value1',
          'X-Some-Custom-Header-2': 'value2',
        },
      });

      await transport.send(EVENT_ENVELOPE);
    });

    it.each([
      [RATE_LIMIT, 'rate_limit'],
      [INVALID, 'invalid'],
      [FAILED, 'failed'],
    ])('should correctly reject bad server response (status %i)', async (serverStatusCode, expectedStatus) => {
      await setupTestServer({ statusCode: serverStatusCode });

      const transport = makeNodeTransport({ httpModule: unsafeHttpsModule, url: TEST_SERVER_URL });
      await expect(transport.send(EVENT_ENVELOPE)).rejects.toEqual(expect.objectContaining({ status: expectedStatus }));
    });

    it('should resolve when server responds with rate limit header and status code 200', async () => {
      await setupTestServer({
        statusCode: SUCCESS,
        responseHeaders: {
          'Retry-After': '2700',
          'X-Sentry-Rate-Limits': '60::organization, 2700::organization',
        },
      });

      const transport = makeNodeTransport({ httpModule: unsafeHttpsModule, url: TEST_SERVER_URL });
      const transportResponse = await transport.send(EVENT_ENVELOPE);

      expect(transportResponse).toEqual(expect.objectContaining({ status: 'success' }));
    });

    it('should resolve when server responds with rate limit header and status code 200', async () => {
      await setupTestServer({
        statusCode: SUCCESS,
        responseHeaders: {
          'Retry-After': '2700',
          'X-Sentry-Rate-Limits': '60::organization, 2700::organization',
        },
      });

      const transport = makeNodeTransport({ httpModule: unsafeHttpsModule, url: TEST_SERVER_URL });
      const transportResponse = await transport.send(EVENT_ENVELOPE);

      expect(transportResponse).toEqual(expect.objectContaining({ status: 'success' }));
    });

    it('should use `caCerts` option', async () => {
      await setupTestServer({ statusCode: SUCCESS });

      const transport = makeNodeTransport({
        httpModule: unsafeHttpsModule,
        url: TEST_SERVER_URL,
        caCerts: 'some cert',
      });

      await transport.send(EVENT_ENVELOPE);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(unsafeHttpsModule.request).toHaveBeenCalledWith(
        expect.objectContaining({
          ca: 'some cert',
        }),
        expect.anything(),
      );
    });
  });

  describe('proxy', () => {
    it('can be configured through option', () => {
      makeNodeTransport({
        httpModule: unsafeHttpsModule,
        url: 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
        proxy: 'https://example.com',
      });

      expect(httpProxyAgent).toHaveBeenCalledTimes(1);
      expect(httpProxyAgent).toHaveBeenCalledWith('https://example.com');
    });

    it('can be configured through env variables option (http)', () => {
      process.env.http_proxy = 'https://example.com';
      makeNodeTransport({
        httpModule: unsafeHttpsModule,
        url: 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
      });

      expect(httpProxyAgent).toHaveBeenCalledTimes(1);
      expect(httpProxyAgent).toHaveBeenCalledWith('https://example.com');
      delete process.env.http_proxy;
    });

    it('can be configured through env variables option (https)', () => {
      process.env.https_proxy = 'https://example.com';
      makeNodeTransport({
        httpModule: unsafeHttpsModule,
        url: 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
      });

      expect(httpProxyAgent).toHaveBeenCalledTimes(1);
      expect(httpProxyAgent).toHaveBeenCalledWith('https://example.com');
      delete process.env.https_proxy;
    });

    it('client options have priority over env variables', () => {
      process.env.https_proxy = 'https://foo.com';
      makeNodeTransport({
        httpModule: unsafeHttpsModule,
        url: 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
        proxy: 'https://bar.com',
      });

      expect(httpProxyAgent).toHaveBeenCalledTimes(1);
      expect(httpProxyAgent).toHaveBeenCalledWith('https://bar.com');
      delete process.env.https_proxy;
    });

    it('no_proxy allows for skipping specific hosts', () => {
      process.env.no_proxy = 'sentry.io';
      makeNodeTransport({
        httpModule: unsafeHttpsModule,
        url: 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
        proxy: 'https://example.com',
      });

      expect(httpProxyAgent).not.toHaveBeenCalled();

      delete process.env.no_proxy;
    });

    it('no_proxy works with a port', () => {
      process.env.http_proxy = 'https://example.com:8080';
      process.env.no_proxy = 'sentry.io:8989';

      makeNodeTransport({
        httpModule: unsafeHttpsModule,
        url: 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
      });

      expect(httpProxyAgent).not.toHaveBeenCalled();

      delete process.env.no_proxy;
      delete process.env.http_proxy;
    });

    it('no_proxy works with multiple comma-separated hosts', () => {
      process.env.http_proxy = 'https://example.com:8080';
      process.env.no_proxy = 'example.com,sentry.io,wat.com:1337';

      makeNodeTransport({
        httpModule: unsafeHttpsModule,
        url: 'https://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
      });

      expect(httpProxyAgent).not.toHaveBeenCalled();

      delete process.env.no_proxy;
      delete process.env.http_proxy;
    });
  });

  it('should register TransportRequestExecutor that returns the correct object from server response (rate limit)', async () => {
    await setupTestServer({
      statusCode: RATE_LIMIT,
      responseHeaders: {
        'Retry-After': '2700',
        'X-Sentry-Rate-Limits': '60::organization, 2700::organization',
      },
    });

    makeNodeTransport({ httpModule: unsafeHttpsModule, url: TEST_SERVER_URL });
    const registeredRequestExecutor = (createTransport as jest.Mock).mock.calls[0][1];

    const executorResult = registeredRequestExecutor({
      body: serializeEnvelope(EVENT_ENVELOPE),
      category: 'error',
    });

    await expect(executorResult).resolves.toEqual(
      expect.objectContaining({
        headers: {
          'retry-after': '2700',
          'x-sentry-rate-limits': '60::organization, 2700::organization',
        },
        statusCode: RATE_LIMIT,
      }),
    );
  });

  it('should register TransportRequestExecutor that returns the correct object from server response (OK)', async () => {
    await setupTestServer({
      statusCode: SUCCESS,
    });

    makeNodeTransport({ httpModule: unsafeHttpsModule, url: TEST_SERVER_URL });
    const registeredRequestExecutor = (createTransport as jest.Mock).mock.calls[0][1];

    const executorResult = registeredRequestExecutor({
      body: serializeEnvelope(EVENT_ENVELOPE),
      category: 'error',
    });

    await expect(executorResult).resolves.toEqual(
      expect.objectContaining({
        headers: {
          'retry-after': null,
          'x-sentry-rate-limits': null,
        },
        statusCode: SUCCESS,
      }),
    );
  });

  it('should register TransportRequestExecutor that returns the correct object from server response (OK with rate-limit headers)', async () => {
    await setupTestServer({
      statusCode: SUCCESS,
      responseHeaders: {
        'Retry-After': '2700',
        'X-Sentry-Rate-Limits': '60::organization, 2700::organization',
      },
    });

    makeNodeTransport({ httpModule: unsafeHttpsModule, url: TEST_SERVER_URL });
    const registeredRequestExecutor = (createTransport as jest.Mock).mock.calls[0][1];

    const executorResult = registeredRequestExecutor({
      body: serializeEnvelope(EVENT_ENVELOPE),
      category: 'error',
    });

    await expect(executorResult).resolves.toEqual(
      expect.objectContaining({
        headers: {
          'retry-after': '2700',
          'x-sentry-rate-limits': '60::organization, 2700::organization',
        },
        statusCode: SUCCESS,
      }),
    );
  });

  it('should register TransportRequestExecutor that returns the correct object from server response (NOK with rate-limit headers)', async () => {
    await setupTestServer({
      statusCode: RATE_LIMIT,
      responseHeaders: {
        'Retry-After': '2700',
        'X-Sentry-Rate-Limits': '60::organization, 2700::organization',
      },
    });

    makeNodeTransport({ httpModule: unsafeHttpsModule, url: TEST_SERVER_URL });
    const registeredRequestExecutor = (createTransport as jest.Mock).mock.calls[0][1];

    const executorResult = registeredRequestExecutor({
      body: serializeEnvelope(EVENT_ENVELOPE),
      category: 'error',
    });

    await expect(executorResult).resolves.toEqual(
      expect.objectContaining({
        headers: {
          'retry-after': '2700',
          'x-sentry-rate-limits': '60::organization, 2700::organization',
        },
        statusCode: RATE_LIMIT,
      }),
    );
  });
});
