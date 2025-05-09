import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResponseMiddlewareResponse } from '../../src/server';
import { sentryBeforeResponseMiddleware } from '../../src/server';

describe('middleware', () => {
  describe('sentryBeforeResponseMiddleware', () => {
    vi.spyOn(SentryCore, 'getTraceMetaTags').mockReturnValue(`
      <meta name="sentry-trace" content="123">,
      <meta name="baggage" content="abc">
    `);

    const mockFetchEvent = {
      request: {},
      locals: {},
      response: {
        // mocks a pageload
        headers: new Headers([['content-type', 'text/html']]),
      },
      nativeEvent: {},
    };

    let mockMiddlewareHTMLResponse: ResponseMiddlewareResponse;
    let mockMiddlewareHTMLNoHeadResponse: ResponseMiddlewareResponse;
    let mockMiddlewareJSONResponse: ResponseMiddlewareResponse;

    beforeEach(() => {
      // h3 doesn't pass a proper Response object to the middleware
      mockMiddlewareHTMLResponse = {
        body: new Response('<head><meta charset="utf-8"></head>').body,
      };
      mockMiddlewareHTMLNoHeadResponse = {
        body: new Response('<body>Hello World</body>').body,
      };
      mockMiddlewareJSONResponse = {
        body: new Response('{"prefecture": "Kagoshima"}').body,
      };
    });

    it('injects tracing meta tags into the response body', async () => {
      const onBeforeResponse = sentryBeforeResponseMiddleware();
      onBeforeResponse(mockFetchEvent, mockMiddlewareHTMLResponse);

      // for testing convenience, we pass the body back into a proper response
      // mockMiddlewareHTMLResponse has been modified by our middleware
      const html = await new Response(mockMiddlewareHTMLResponse.body).text();
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain('<meta name="sentry-trace" content="123">');
      expect(html).toContain('<meta name="baggage" content="abc">');
    });

    it('does not add meta tags if there is no head tag', async () => {
      const onBeforeResponse = sentryBeforeResponseMiddleware();
      onBeforeResponse(mockFetchEvent, mockMiddlewareHTMLNoHeadResponse);

      const html = await new Response(mockMiddlewareHTMLNoHeadResponse.body).text();
      expect(html).toEqual('<body>Hello World</body>');
    });

    it('does not add tracing meta tags twice into the same response', async () => {
      const onBeforeResponse1 = sentryBeforeResponseMiddleware();
      onBeforeResponse1(mockFetchEvent, mockMiddlewareHTMLResponse);

      const onBeforeResponse2 = sentryBeforeResponseMiddleware();
      onBeforeResponse2(mockFetchEvent, mockMiddlewareHTMLResponse);

      const html = await new Response(mockMiddlewareHTMLResponse.body).text();
      expect(html.match(/<meta name="sentry-trace" content="123">/g)).toHaveLength(1);
      expect(html.match(/<meta name="baggage" content="abc">/g)).toHaveLength(1);
    });

    it('does not modify a non-HTML response', async () => {
      const onBeforeResponse = sentryBeforeResponseMiddleware();
      onBeforeResponse({ ...mockFetchEvent, response: { headers: new Headers() } }, mockMiddlewareJSONResponse);

      const json = await new Response(mockMiddlewareJSONResponse.body).json();
      expect(json).toEqual({
        prefecture: 'Kagoshima',
      });
    });
  });
});
