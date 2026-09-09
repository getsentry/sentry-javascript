import { afterEach, describe, expect, it, vi } from 'vitest';
import * as breadcrumbModule from '../../../../src/integrations/http/add-outgoing-request-breadcrumb';
import { HTTP_ON_CLIENT_REQUEST } from '../../../../src/integrations/http/constants';
import { getHttpClientSubscriptions } from '../../../../src/integrations/http/client-subscriptions';
import type { HttpClientRequest, HttpIncomingMessage } from '../../../../src/integrations/http/types';
import { SUPPRESS_TRACING_KEY } from '../../../../src/tracing';
import { getCurrentScope, withScope } from '../../../../src/currentScopes';
import type { Client } from '../../../../src/client';
import { setCurrentClient } from '../../../../src/sdk';
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
      const subscriptions = getHttpClientSubscriptions({ breadcrumbs: false, spans: false, propagateTrace: true });
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

  describe("the SDK's own requests", () => {
    afterEach(() => {
      setCurrentClient(undefined as unknown as Client);
    });

    function setUpClientWithDsn(): void {
      const client = new TestClient(getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337' }));
      setCurrentClient(client);
    }

    it('does not instrument requests to the ingest endpoint', () => {
      setUpClientWithDsn();
      const spy = vi.spyOn(breadcrumbModule, 'addOutgoingRequestBreadcrumb');
      const subscriptions = getHttpClientSubscriptions({ breadcrumbs: true, spans: false, propagateTrace: true });
      const handler = subscriptions[HTTP_ON_CLIENT_REQUEST];

      const request = makeMockRequest();
      (request as { host: string }).host = 'dsn.ingest.sentry.io';
      (request as { path: string }).path = '/api/1337/envelope/?sentry_version=7&sentry_key=public';

      handler({ request }, HTTP_ON_CLIENT_REQUEST);

      expect(request._responseListeners).toHaveLength(0);
      expect(request.setHeader).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
    });

    it('still instruments requests to the same host that are not envelope sends', () => {
      setUpClientWithDsn();
      const spy = vi.spyOn(breadcrumbModule, 'addOutgoingRequestBreadcrumb');
      const subscriptions = getHttpClientSubscriptions({ breadcrumbs: true, spans: false });
      const handler = subscriptions[HTTP_ON_CLIENT_REQUEST];

      const request = makeMockRequest();
      (request as { host: string }).host = 'dsn.ingest.sentry.io';

      handler({ request }, HTTP_ON_CLIENT_REQUEST);

      const response = makeMockResponse();
      request._responseListeners.forEach(fn => fn(response));
      response._endListeners.forEach(fn => fn());

      expect(spy).toHaveBeenCalledOnce();
    });
  });
});
