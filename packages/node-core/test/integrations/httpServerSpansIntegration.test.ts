import { EventEmitter } from 'node:events';
import { URL_FULL, URL_PATH } from '@sentry/conventions/attributes';
import * as SentryCore from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import {
  httpServerSpansIntegration,
  isStaticAssetRequest,
} from '../../src/integrations/http/httpServerSpansIntegration';

describe('httpIntegration', () => {
  describe('isStaticAssetRequest', () => {
    it.each([
      ['/favicon.ico', true],
      ['/apple-touch-icon.png', true],
      ['/static/style.css', true],
      ['/assets/app.js', true],
      ['/fonts/font.woff2', true],
      ['/images/logo.svg', true],
      ['/img/photo.jpeg', true],
      ['/img/photo.jpg', true],
      ['/img/photo.jpg?v=123', true],
      ['/img/photo.webp', true],
      ['/font/font.ttf', true],
      ['/robots.txt', true],
      ['/sitemap.xml', true],
      ['/manifest.json', true],
      ['/browserconfig.xml', true],
      // non-static routes
      ['/api/users', false],
      ['/some-json.json', false],
      ['/some-xml.xml', false],
      ['/some-txt.txt', false],
      ['/users', false],
      ['/graphql', false],
      ['/', false],
    ])('returns %s -> %s', (urlPath, expected) => {
      expect(isStaticAssetRequest(urlPath)).toBe(expected);
    });
  });

  it('omits url.full when the incoming request URL is relative', () => {
    let onHttpServerRequest:
      | ((request: unknown, response: unknown, normalizedRequest: SentryCore.RequestEventData) => void)
      | undefined;
    const client = {
      on: (hook: string, callback: typeof onHttpServerRequest) => {
        if (hook === 'httpServerRequest') {
          onHttpServerRequest = callback;
        }
      },
      getDataCollectionOptions: () => false,
    };
    const span = {
      end: () => undefined,
      setAttributes: () => undefined,
      setStatus: () => undefined,
    } as unknown as SentryCore.Span;
    const startInactiveSpan = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue(span);
    const request = Object.assign(new EventEmitter(), {
      headers: {},
      httpVersion: '1.0',
      method: 'GET',
      socket: {},
      url: '/users/42?foo=bar',
    }) as EventEmitter & {
      _startSpanCallback?: { deref: () => ((next: () => boolean) => boolean) | undefined };
    };
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });

    const integration = httpServerSpansIntegration();
    integration.setup?.(client as Parameters<NonNullable<typeof integration.setup>>[0]);
    onHttpServerRequest?.(request, response, { headers: {}, method: 'GET' });
    request._startSpanCallback?.deref()(() => true);

    const attributes = startInactiveSpan.mock.calls[0]?.[0].attributes;
    expect(attributes).toEqual(
      expect.objectContaining({
        [URL_PATH]: '/users/42',
      }),
    );
    expect(attributes?.[URL_FULL]).toBeUndefined();
  });

  describe('processEvent', () => {
    function runProcessEvent(event: Record<string, unknown>, options = {}): any {
      const integration = httpServerSpansIntegration(options);
      return (integration as any).processEvent(event, {}, {});
    }

    it('lifts the HTTP response status code into the top-level `response` context', () => {
      const event = runProcessEvent(
        { type: 'transaction', contexts: { trace: { data: { 'http.response.status_code': 200 } } } },
        { ignoreStatusCodes: [] },
      );

      expect(event.contexts.response).toEqual({ status_code: 200 });
    });

    it('preserves existing `response` context fields', () => {
      const event = runProcessEvent(
        {
          type: 'transaction',
          contexts: { response: { body_size: 42 }, trace: { data: { 'http.response.status_code': 201 } } },
        },
        { ignoreStatusCodes: [] },
      );

      expect(event.contexts.response).toEqual({ body_size: 42, status_code: 201 });
    });

    it('does not add a `response` context when there is no HTTP status code', () => {
      const event = runProcessEvent(
        { type: 'transaction', contexts: { trace: { data: {} } } },
        { ignoreStatusCodes: [] },
      );

      expect(event.contexts.response).toBeUndefined();
    });

    it('drops transactions whose status code is in `ignoreStatusCodes`', () => {
      const event = runProcessEvent(
        { type: 'transaction', contexts: { trace: { data: { 'http.response.status_code': 404 } } } },
        { ignoreStatusCodes: [404] },
      );

      expect(event).toBeNull();
    });
  });
});
