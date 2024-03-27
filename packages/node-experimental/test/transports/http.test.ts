import * as http from 'http';
import { createGunzip } from 'zlib';
import { createTransport } from '@sentry/core';
import type { EventEnvelope, EventItem } from '@sentry/types';
import { addItemToEnvelope, createAttachmentEnvelopeItem, createEnvelope, serializeEnvelope } from '@sentry/utils';

import { makeNodeTransport } from '../../src/transports';

jest.mock('@sentry/core', () => {
  const actualCore = jest.requireActual('@sentry/core');
  return {
    ...actualCore,
    createTransport: jest.fn().mockImplementation(actualCore.createTransport),
  };
});

import * as httpProxyAgent from '../../src/proxy';

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
  requestInspector?: (req: http.IncomingMessage, body: string, raw: Uint8Array) => void,
) {
  testServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];

    const stream = req.headers['content-encoding'] === 'gzip' ? req.pipe(createGunzip({})) : req;

    stream.on('data', data => {
      chunks.push(data);
    });

    stream.on('end', () => {
      requestInspector?.(req, chunks.join(), Buffer.concat(chunks));
    });

    res.writeHead(options.statusCode, options.responseHeaders);
    res.end();

    // also terminate socket because keepalive hangs connection a bit
    // eslint-disable-next-line deprecation/deprecation
    res.connection?.end();
  });

  testServer.listen(18101);

  return new Promise(resolve => {
    testServer?.on('listening', resolve);
  });
}

const TEST_SERVER_URL = 'http://localhost:18101';

const EVENT_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

const SERIALIZED_EVENT_ENVELOPE = serializeEnvelope(EVENT_ENVELOPE);

const ATTACHMENT_ITEM = createAttachmentEnvelopeItem({ filename: 'empty-file.bin', data: new Uint8Array(50_000) });
const EVENT_ATTACHMENT_ENVELOPE = addItemToEnvelope(EVENT_ENVELOPE, ATTACHMENT_ITEM);
const SERIALIZED_EVENT_ATTACHMENT_ENVELOPE = serializeEnvelope(EVENT_ATTACHMENT_ENVELOPE) as Uint8Array;

const defaultOptions = {
  url: TEST_SERVER_URL,
  recordDroppedEvent: () => undefined,
};

// empty function to keep test output clean
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(done => {
  jest.clearAllMocks();

  if (testServer && testServer.listening) {
    testServer.close(done);
  } else {
    done();
  }
});

describe('makeNewHttpTransport()', () => {
  describe('.send()', () => {
    it('should correctly send envelope to server', async () => {
      await setupTestServer({ statusCode: SUCCESS }, (req, body) => {
        expect(req.method).toBe('POST');
        expect(body).toBe(SERIALIZED_EVENT_ENVELOPE);
      });

      const transport = makeNodeTransport(defaultOptions);
      await transport.send(EVENT_ENVELOPE);
    });

    it('allows overriding keepAlive', async () => {
      await setupTestServer({ statusCode: SUCCESS }, req => {
        expect(req.headers).toEqual(
          expect.objectContaining({
            // node http module lower-cases incoming headers
            connection: 'keep-alive',
          }),
        );
      });

      const transport = makeNodeTransport({ keepAlive: true, ...defaultOptions });
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
        ...defaultOptions,
        headers: {
          'X-Some-Custom-Header-1': 'value1',
          'X-Some-Custom-Header-2': 'value2',
        },
      });

      await transport.send(EVENT_ENVELOPE);
    });

    it.each([RATE_LIMIT, INVALID, FAILED])(
      'should resolve on bad server response (status %i)',
      async serverStatusCode => {
        await setupTestServer({ statusCode: serverStatusCode });

        const transport = makeNodeTransport(defaultOptions);

        await expect(transport.send(EVENT_ENVELOPE)).resolves.toEqual(
          expect.objectContaining({ statusCode: serverStatusCode }),
        );
      },
    );

    it('should resolve when server responds with rate limit header and status code 200', async () => {
      await setupTestServer({
        statusCode: SUCCESS,
        responseHeaders: {
          'Retry-After': '2700',
          'X-Sentry-Rate-Limits': '60::organization, 2700::organization',
        },
      });

      const transport = makeNodeTransport(defaultOptions);
      await expect(transport.send(EVENT_ENVELOPE)).resolves.toEqual({
        statusCode: SUCCESS,
        headers: {
          'retry-after': '2700',
          'x-sentry-rate-limits': '60::organization, 2700::organization',
        },
      });
    });
  });

  describe('compression', () => {
    it('small envelopes should not be compressed', async () => {
      await setupTestServer(
        {
          statusCode: SUCCESS,
          responseHeaders: {},
        },
        (req, body) => {
          expect(req.headers['content-encoding']).toBeUndefined();
          expect(body).toBe(SERIALIZED_EVENT_ENVELOPE);
        },
      );

      const transport = makeNodeTransport(defaultOptions);
      await transport.send(EVENT_ENVELOPE);
    });

    it('large envelopes should be compressed', async () => {
      await setupTestServer(
        {
          statusCode: SUCCESS,
          responseHeaders: {},
        },
        (req, _, raw) => {
          expect(req.headers['content-encoding']).toEqual('gzip');
          expect(raw.buffer).toStrictEqual(SERIALIZED_EVENT_ATTACHMENT_ENVELOPE.buffer);
        },
      );

      const transport = makeNodeTransport(defaultOptions);
      await transport.send(EVENT_ATTACHMENT_ENVELOPE);
    });
  });

  describe('proxy', () => {
    const proxyAgentSpy = jest
      .spyOn(httpProxyAgent, 'HttpsProxyAgent')
      // @ts-expect-error using http agent as https proxy agent
      .mockImplementation(() => new http.Agent({ keepAlive: false, maxSockets: 30, timeout: 2000 }));

    it('can be configured through option', () => {
      makeNodeTransport({
        ...defaultOptions,
        url: 'http://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
        proxy: 'http://example.com',
      });

      expect(proxyAgentSpy).toHaveBeenCalledTimes(1);
      expect(proxyAgentSpy).toHaveBeenCalledWith('http://example.com');
    });

    it('can be configured through env variables option', () => {
      process.env.http_proxy = 'http://example.com';
      makeNodeTransport({
        ...defaultOptions,
        url: 'http://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
      });

      expect(proxyAgentSpy).toHaveBeenCalledTimes(1);
      expect(proxyAgentSpy).toHaveBeenCalledWith('http://example.com');
      delete process.env.http_proxy;
    });

    it('client options have priority over env variables', () => {
      process.env.http_proxy = 'http://foo.com';
      makeNodeTransport({
        ...defaultOptions,
        url: 'http://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
        proxy: 'http://bar.com',
      });

      expect(proxyAgentSpy).toHaveBeenCalledTimes(1);
      expect(proxyAgentSpy).toHaveBeenCalledWith('http://bar.com');
      delete process.env.http_proxy;
    });

    it('no_proxy allows for skipping specific hosts', () => {
      process.env.no_proxy = 'sentry.io';
      makeNodeTransport({
        ...defaultOptions,
        url: 'http://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
        proxy: 'http://example.com',
      });

      expect(proxyAgentSpy).not.toHaveBeenCalled();

      delete process.env.no_proxy;
    });

    it('no_proxy works with a port', () => {
      process.env.http_proxy = 'http://example.com:8080';
      process.env.no_proxy = 'sentry.io:8989';

      makeNodeTransport({
        ...defaultOptions,
        url: 'http://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
      });

      expect(proxyAgentSpy).not.toHaveBeenCalled();

      delete process.env.no_proxy;
      delete process.env.http_proxy;
    });

    it('no_proxy works with multiple comma-separated hosts', () => {
      process.env.http_proxy = 'http://example.com:8080';
      process.env.no_proxy = 'example.com,sentry.io,wat.com:1337';

      makeNodeTransport({
        ...defaultOptions,
        url: 'http://9e9fd4523d784609a5fc0ebb1080592f@sentry.io:8989/mysubpath/50622',
      });

      expect(proxyAgentSpy).not.toHaveBeenCalled();

      delete process.env.no_proxy;
      delete process.env.http_proxy;
    });
  });

  describe('should register TransportRequestExecutor that returns the correct object from server response', () => {
    it('rate limit', async () => {
      await setupTestServer({
        statusCode: RATE_LIMIT,
        responseHeaders: {},
      });

      makeNodeTransport(defaultOptions);
      const registeredRequestExecutor = (createTransport as jest.Mock).mock.calls[0][1];

      const executorResult = registeredRequestExecutor({
        body: serializeEnvelope(EVENT_ENVELOPE),
        category: 'error',
      });

      await expect(executorResult).resolves.toEqual(
        expect.objectContaining({
          statusCode: RATE_LIMIT,
        }),
      );
    });

    it('OK', async () => {
      await setupTestServer({
        statusCode: SUCCESS,
      });

      makeNodeTransport(defaultOptions);
      const registeredRequestExecutor = (createTransport as jest.Mock).mock.calls[0][1];

      const executorResult = registeredRequestExecutor({
        body: serializeEnvelope(EVENT_ENVELOPE),
        category: 'error',
      });

      await expect(executorResult).resolves.toEqual(
        expect.objectContaining({
          statusCode: SUCCESS,
          headers: {
            'retry-after': null,
            'x-sentry-rate-limits': null,
          },
        }),
      );
    });

    it('OK with rate-limit headers', async () => {
      await setupTestServer({
        statusCode: SUCCESS,
        responseHeaders: {
          'Retry-After': '2700',
          'X-Sentry-Rate-Limits': '60::organization, 2700::organization',
        },
      });

      makeNodeTransport(defaultOptions);
      const registeredRequestExecutor = (createTransport as jest.Mock).mock.calls[0][1];

      const executorResult = registeredRequestExecutor({
        body: serializeEnvelope(EVENT_ENVELOPE),
        category: 'error',
      });

      await expect(executorResult).resolves.toEqual(
        expect.objectContaining({
          statusCode: SUCCESS,
          headers: {
            'retry-after': '2700',
            'x-sentry-rate-limits': '60::organization, 2700::organization',
          },
        }),
      );
    });

    it('NOK with rate-limit headers', async () => {
      await setupTestServer({
        statusCode: RATE_LIMIT,
        responseHeaders: {
          'Retry-After': '2700',
          'X-Sentry-Rate-Limits': '60::organization, 2700::organization',
        },
      });

      makeNodeTransport(defaultOptions);
      const registeredRequestExecutor = (createTransport as jest.Mock).mock.calls[0][1];

      const executorResult = registeredRequestExecutor({
        body: serializeEnvelope(EVENT_ENVELOPE),
        category: 'error',
      });

      await expect(executorResult).resolves.toEqual(
        expect.objectContaining({
          statusCode: RATE_LIMIT,
          headers: {
            'retry-after': '2700',
            'x-sentry-rate-limits': '60::organization, 2700::organization',
          },
        }),
      );
    });
  });

  it('should create a noop transport if an invalid url is passed', async () => {
    const requestSpy = jest.spyOn(http, 'request');
    const transport = makeNodeTransport({ ...defaultOptions, url: 'foo' });
    await transport.send(EVENT_ENVELOPE);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('should warn if an invalid url is passed', async () => {
    const transport = makeNodeTransport({ ...defaultOptions, url: 'invalid url' });
    await transport.send(EVENT_ENVELOPE);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[@sentry/node]: Invalid dsn or tunnel option, will not send any events. The tunnel option must be a full URL when used.',
    );
  });
});
