import { createTransport } from '@sentry/core';
import { EventEnvelope, EventItem } from '@sentry/types';
import { createEnvelope, serializeEnvelope } from '@sentry/utils';
import * as http from 'http';

import { makeNewHttpTransport } from '../../../src/transports/new';

jest.mock('@sentry/core', () => {
  const actualCore = jest.requireActual('@sentry/core');
  return {
    ...actualCore,
    createTransport: jest.fn().mockImplementation(actualCore.createTransport),
  };
});

const SUCCESS = 200;
const RATE_LIMIT = 429;
const INVALID = 400;
const FAILED = 500;

interface TestServerOptions {
  statusCode: number;
  responseHeaders: Record<string, string | string[] | undefined>;
}

let testServer: http.Server | undefined;

function setupTestServer(
  options: TestServerOptions,
  requestInspector?: (req: http.IncomingMessage, body: string) => void,
) {
  testServer = http.createServer((req, res) => {
    let body = '';

    req.on('data', data => {
      body += data;
    });

    req.on('end', () => {
      requestInspector?.(req, body);
    });

    res.writeHead(options.statusCode, options.responseHeaders);
    res.end();
  });

  testServer.listen(12345);

  return new Promise(resolve => {
    testServer?.on('listening', resolve);
  });
}

const testServerUrl = 'http://localhost:12345';

const EVENT_ENVELOPE = createEnvelope<EventEnvelope>({ event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2', sent_at: '123' }, [
  [{ type: 'event' }, { event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2' }] as EventItem,
]);

const SERIALIZED_EVENT_ENVELOPE = serializeEnvelope(EVENT_ENVELOPE);

describe('makeNewHttpTransport()', () => {
  afterEach(() => {
    jest.clearAllMocks();

    if (testServer) {
      testServer.close();
    }
  });

  describe('.send()', () => {
    it('should correctly return successful server response', async () => {
      await setupTestServer({ statusCode: SUCCESS, responseHeaders: {} });

      const transport = makeNewHttpTransport({ url: testServerUrl });
      const transportResponse = await transport.send(EVENT_ENVELOPE);

      expect(transportResponse).toEqual(expect.objectContaining({ status: 'success' }));
    });

    it('should correctly send envelope to server', async () => {
      await setupTestServer({ statusCode: SUCCESS, responseHeaders: {} }, (req, body) => {
        expect(req.method).toBe('POST');
        expect(body).toBe(SERIALIZED_EVENT_ENVELOPE);
      });

      const transport = makeNewHttpTransport({ url: testServerUrl });
      await transport.send(EVENT_ENVELOPE);
    });

    it('should correctly send user-provided headers to server', async () => {
      await setupTestServer({ statusCode: SUCCESS, responseHeaders: {} }, req => {
        expect(req.headers).toEqual(
          expect.objectContaining({
            // node http module lower-cases incoming headers
            'x-some-custom-header-1': 'value1',
            'x-some-custom-header-2': 'value2',
          }),
        );
      });

      const transport = makeNewHttpTransport({
        url: testServerUrl,
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
      await setupTestServer({ statusCode: serverStatusCode, responseHeaders: {} });

      const transport = makeNewHttpTransport({ url: testServerUrl });
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

      const transport = makeNewHttpTransport({ url: testServerUrl });
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

      const transport = makeNewHttpTransport({ url: testServerUrl });
      const transportResponse = await transport.send(EVENT_ENVELOPE);

      expect(transportResponse).toEqual(expect.objectContaining({ status: 'success' }));
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

    makeNewHttpTransport({ url: testServerUrl });
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

  it('should register TransportRequestExecutor that returns the correct object from server response (success)', async () => {
    await setupTestServer({
      statusCode: SUCCESS,
      responseHeaders: {},
    });

    makeNewHttpTransport({ url: testServerUrl });
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

  it('should register TransportRequestExecutor that returns the correct object from server response (success but rate-limit)', async () => {
    await setupTestServer({
      statusCode: SUCCESS,
      responseHeaders: {
        'Retry-After': '2700',
        'X-Sentry-Rate-Limits': '60::organization, 2700::organization',
      },
    });

    makeNewHttpTransport({ url: testServerUrl });
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
});
