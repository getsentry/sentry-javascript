import * as http from 'node:http';
import { errorMonitor } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as breadcrumbModule from '../../../../src/integrations/http/add-outgoing-request-breadcrumb';
import { HTTP_ON_CLIENT_REQUEST } from '../../../../src/integrations/http/constants';
import { getHttpClientSubscriptions } from '../../../../src/integrations/http/client-subscriptions';
import type { HttpClientRequest, HttpIncomingMessage } from '../../../../src/integrations/http/types';
import { SUPPRESS_TRACING_KEY } from '../../../../src/tracing/constants';
import { getCurrentScope, withScope } from '../../../../src/currentScopes';
import { setCurrentClient } from '../../../../src/sdk';
import { startSpan } from '../../../../src/tracing/trace';
import { spanToJSON } from '../../../../src/utils/spanUtils';
import type { SpanJSON } from '../../../../src/types/span';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

function makeMockRequest(): HttpClientRequest & {
  _responseListeners: ((res: HttpIncomingMessage) => void)[];
} {
  const responseListeners: ((res: HttpIncomingMessage) => void)[] = [];
  return {
    method: 'GET',
    path: '/test',
    host: 'example.com',
    protocol: 'http:',
    port: 80,
    getHeader: () => undefined,
    getHeaders: () => ({}),
    setHeader: vi.fn(),
    removeHeader: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    prependListener: vi.fn((_event: string, fn: (...args: unknown[]) => void) => {
      responseListeners.push(fn as (res: HttpIncomingMessage) => void);
    }),
    listenerCount: () => 0,
    removeListener: vi.fn(),
    _responseListeners: responseListeners,
  } as unknown as HttpClientRequest & { _responseListeners: ((res: HttpIncomingMessage) => void)[] };
}

function makeMockResponse(): HttpIncomingMessage & { _endListeners: (() => void)[] } {
  const endListeners: (() => void)[] = [];
  return {
    statusCode: 200,
    statusMessage: 'OK',
    httpVersion: '1.1',
    headers: {},
    resume: vi.fn(),
    on: vi.fn((_event: string, fn: (...args: unknown[]) => void) => {
      if (_event === 'end') endListeners.push(fn as () => void);
    }),
    addListener: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    _endListeners: endListeners,
  } as unknown as HttpIncomingMessage & { _endListeners: (() => void)[] };
}

describe('getHttpClientSubscriptions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    getCurrentScope().setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: undefined });
  });

  describe('suppressTracing', () => {
    it('does not add breadcrumbs when suppressTracing is active', () => {
      const spy = vi.spyOn(breadcrumbModule, 'addOutgoingRequestBreadcrumb');
      const subscriptions = getHttpClientSubscriptions({ breadcrumbs: true, spans: false });
      const handler = subscriptions[HTTP_ON_CLIENT_REQUEST];

      withScope(scope => {
        scope.setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: true });

        const request = makeMockRequest();
        handler({ request }, HTTP_ON_CLIENT_REQUEST);

        // no response listeners should have been registered
        expect(request._responseListeners).toHaveLength(0);

        // simulate a response completing anyway — breadcrumb must still not fire
        const response = makeMockResponse();
        request._responseListeners.forEach(fn => fn(response));
        response._endListeners.forEach(fn => fn());
      });

      expect(spy).not.toHaveBeenCalled();
    });

    it('does not propagate trace headers when suppressTracing is active', () => {
      const subscriptions = getHttpClientSubscriptions({ breadcrumbs: false, spans: false, tracePropagation: true });
      const handler = subscriptions[HTTP_ON_CLIENT_REQUEST];

      withScope(scope => {
        scope.setSDKProcessingMetadata({ [SUPPRESS_TRACING_KEY]: true });

        const request = makeMockRequest();
        handler({ request }, HTTP_ON_CLIENT_REQUEST);

        expect(request.setHeader).not.toHaveBeenCalled();
      });
    });

    it('still adds breadcrumbs when suppressTracing is NOT active', () => {
      const spy = vi.spyOn(breadcrumbModule, 'addOutgoingRequestBreadcrumb');
      const subscriptions = getHttpClientSubscriptions({ breadcrumbs: true, spans: false });
      const handler = subscriptions[HTTP_ON_CLIENT_REQUEST];

      const request = makeMockRequest();
      handler({ request }, HTTP_ON_CLIENT_REQUEST);

      const response = makeMockResponse();
      request._responseListeners.forEach(fn => fn(response));
      response._endListeners.forEach(fn => fn());

      expect(spy).toHaveBeenCalledOnce();
    });
  });

  describe('request errors', () => {
    let server: http.Server;
    let port: number;

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        res.writeHead(req.url === '/not-found' ? 404 : 200);
        // Keep the body open so that the request can be aborted after the response arrived.
        res.write('x');
        if (req.url === '/server-abort') {
          // The server goes away before the body is complete.
          setTimeout(() => res.socket?.destroy(), 10);
        }
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      port = (server.address() as AddressInfo).port;
    });

    afterAll(() => {
      server.closeAllConnections();
      server.close();
    });

    function makeRequest(
      path: string,
      abortAt:
        | 'beforeResponse'
        | 'afterResponse'
        | 'destroyWithError'
        | 'destroyResponse'
        | 'destroyResponseWithError'
        | 'never',
      { listenForResponseErrors = true }: { listenForResponseErrors?: boolean } = {},
    ): Promise<SpanJSON> {
      const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
      setCurrentClient(client);
      client.init();

      return new Promise(resolve => {
        client.on('spanEnd', span => {
          if (!spanToJSON(span).is_segment) {
            resolve(spanToJSON(span));
          }
        });

        const controller = new AbortController();
        const request = http.request({ host: '127.0.0.1', port, path, signal: controller.signal });
        startSpan({ name: 'parent' }, () => {
          // Like @sentry/node, pass the real `errorMonitor`, so Sentry itself does not add an `error` listener.
          getHttpClientSubscriptions({ errorMonitor })[HTTP_ON_CLIENT_REQUEST]({ request }, HTTP_ON_CLIENT_REQUEST);
        });
        request.on('error', () => {});
        request.on('response', response => {
          if (listenForResponseErrors) {
            response.on('error', () => {});
          }
          response.once('data', () => {
            if (abortAt === 'destroyWithError') {
              request.destroy(new Error('boom'));
            } else if (abortAt === 'destroyResponse') {
              response.destroy();
            } else if (abortAt === 'destroyResponseWithError') {
              response.destroy(new Error('boom'));
            } else if (abortAt !== 'never') {
              controller.abort();
            }
          });
        });
        if (abortAt === 'beforeResponse') {
          controller.abort();
        }
        request.end();
      });
    }

    it('does not set an error status when the request is aborted before the response', async () => {
      const span = await makeRequest('/', 'beforeResponse');

      expect(span.status).toBe('ok');
    });

    it('keeps the response status when the request is aborted after the response', async () => {
      expect((await makeRequest('/', 'afterResponse')).status).toBe('ok');
      expect((await makeRequest('/not-found', 'afterResponse')).status).toBe('error');
    });

    it('sets an error status when the request fails for another reason', async () => {
      const span = await makeRequest('/', 'destroyWithError');

      expect(span.status).toBe('error');
    });

    it('ends the span with the response status when the caller destroys the response mid-body', async () => {
      expect((await makeRequest('/', 'destroyResponse')).status).toBe('ok');
      expect((await makeRequest('/not-found', 'destroyResponse')).status).toBe('error');
    });

    it('ends the span with an error status when the response is destroyed with an error mid-body', async () => {
      const span = await makeRequest('/', 'destroyResponseWithError');

      expect(span.status).toBe('error');
    });

    it('sets an error status when the server closes the connection mid-body', async () => {
      const span = await makeRequest('/server-abort', 'never');

      expect(span.status).toBe('error');
    });

    it('sets an error status when the connection resets mid-body and nothing listens for response errors', async () => {
      const span = await makeRequest('/server-abort', 'never', { listenForResponseErrors: false });

      expect(span.status).toBe('error');
    });
  });
});
