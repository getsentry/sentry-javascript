/**
 * @vitest-environment jsdom
 */

import * as BrowserUtils from '@sentry-internal/browser-utils';
import { SENTRY_XHR_DATA_KEY } from '@sentry-internal/browser-utils';
import type { Event } from '@sentry/core/browser';
import * as SentryCore from '@sentry/core/browser';
import type { MockInstance } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../../src';
import type { BrowserClientOptions } from '../../src/client';
import { httpClientIntegration } from '../../src/integrations/httpclient';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

describe('httpClientIntegration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setup(options: Partial<BrowserClientOptions> = {}): {
    fetchHandler: (data: unknown) => void;
    xhrHandler: (data: unknown) => void;
    captureEventSpy: MockInstance;
  } {
    const client = new BrowserClient(getDefaultBrowserClientOptions(options));

    vi.spyOn(SentryCore, 'getClient').mockReturnValue(client);
    vi.spyOn(SentryCore, 'supportsNativeFetch').mockReturnValue(true);
    const addFetchSpy = vi
      .spyOn(SentryCore, 'addFetchInstrumentationHandler')
      .mockImplementation(() => () => undefined);
    const addXhrSpy = vi.spyOn(BrowserUtils, 'addXhrInstrumentationHandler').mockImplementation(() => () => undefined);
    const captureEventSpy = vi.spyOn(SentryCore, 'captureEvent').mockReturnValue('test-event-id');

    httpClientIntegration().setup!(client);

    return {
      fetchHandler: addFetchSpy.mock.calls[0]![0] as (data: unknown) => void,
      xhrHandler: addXhrSpy.mock.calls[0]![0] as (data: unknown) => void,
      captureEventSpy,
    };
  }

  function triggerFetch(
    fetchHandler: (data: unknown) => void,
    {
      requestHeaders = {},
      status = 500,
      responseHeaders = {},
    }: {
      requestHeaders?: Record<string, string>;
      status?: number;
      responseHeaders?: Record<string, string>;
    },
  ): void {
    const request = new Request('https://api.example.com/users/42', { method: 'GET', headers: requestHeaders });
    const response = new Response('{"error":"Internal Server Error"}', { status, headers: responseHeaders });

    fetchHandler({ args: [request], response });
  }

  function triggerXhr(
    xhrHandler: (data: unknown) => void,
    {
      status = 500,
      requestHeaders = {},
      setCookie,
      allResponseHeaders = '',
    }: {
      status?: number;
      requestHeaders?: Record<string, string>;
      setCookie?: string;
      allResponseHeaders?: string;
    },
  ): void {
    const xhr = {
      status,
      responseURL: 'https://api.example.com/users/42',
      getResponseHeader: (name: string) => (name.toLowerCase() === 'set-cookie' ? (setCookie ?? null) : null),
      getAllResponseHeaders: () => allResponseHeaders,
      [SENTRY_XHR_DATA_KEY]: { method: 'GET', request_headers: requestHeaders },
    };

    xhrHandler({ xhr });
  }

  function getEvent(captureEventSpy: MockInstance): Event {
    return captureEventSpy.mock.calls[0]![0] as Event;
  }

  describe('fetch', () => {
    it('filters sensitive request and response headers while keeping safe ones with sendDefaultPii', () => {
      const { fetchHandler, captureEventSpy } = setup({ sendDefaultPii: true });

      triggerFetch(fetchHandler, {
        requestHeaders: {
          Accept: 'application/json',
          Authorization: 'Bearer super-secret-token',
          'X-Api-Key': 'my-api-key-456',
          'X-Custom-Header': 'safe-value',
        },
        responseHeaders: {
          'Content-Type': 'text/html',
          'X-Auth-Token': 'secret-response-token',
          'X-Request-Id': 'abc-123',
        },
      });

      const event = getEvent(captureEventSpy);

      expect(event.request?.headers).toEqual({
        accept: 'application/json',
        authorization: '[Filtered]',
        'x-api-key': '[Filtered]',
        'x-custom-header': 'safe-value',
      });
      expect(event.contexts?.response?.headers).toEqual({
        'content-type': 'text/html',
        'x-auth-token': '[Filtered]',
        'x-request-id': 'abc-123',
      });
    });

    it('keeps PII headers like x-forwarded-for when collection is enabled', () => {
      const { fetchHandler, captureEventSpy } = setup({ sendDefaultPii: true });

      triggerFetch(fetchHandler, {
        requestHeaders: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '203.0.113.10',
          'X-Real-Ip': '203.0.113.10',
          Via: '1.1 vegur',
        },
      });

      expect(getEvent(captureEventSpy).request?.headers).toEqual({
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
        'x-real-ip': '203.0.113.10',
        via: '1.1 vegur',
      });
    });

    // TODO(v11): also collect safe headers by default (but no PII headers) to align with server behavior
    it('does not collect headers or cookies without sendDefaultPii or dataCollection', () => {
      const { fetchHandler, captureEventSpy } = setup();

      triggerFetch(fetchHandler, {
        requestHeaders: { Authorization: 'Bearer x', Accept: 'application/json' },
        responseHeaders: { 'Content-Type': 'text/html' },
      });

      expect(captureEventSpy).toHaveBeenCalledTimes(1);
      const event = getEvent(captureEventSpy);
      expect(event.request?.headers).toBeUndefined();
      expect(event.request?.cookies).toBeUndefined();
      expect(event.contexts?.response?.headers).toBeUndefined();
      expect(event.contexts?.response?.cookies).toBeUndefined();
    });

    it('filters PII headers when an explicit deny list is configured', () => {
      const { fetchHandler, captureEventSpy } = setup({
        dataCollection: { httpHeaders: { request: { deny: ['x-forwarded'] }, response: true } },
      });

      triggerFetch(fetchHandler, {
        requestHeaders: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '203.0.113.10',
          Authorization: 'Bearer x',
        },
      });

      expect(getEvent(captureEventSpy).request?.headers).toEqual({
        'content-type': 'application/json',
        'x-forwarded-for': '[Filtered]',
        authorization: '[Filtered]',
      });
    });

    it('only keeps allow-listed headers and always filters sensitive ones', () => {
      const { fetchHandler, captureEventSpy } = setup({
        dataCollection: { httpHeaders: { request: { allow: ['content-type'] }, response: true } },
      });

      triggerFetch(fetchHandler, {
        requestHeaders: {
          'Content-Type': 'application/json',
          'X-Trace-Id': 'trace-1',
          Authorization: 'Bearer x',
        },
      });

      expect(getEvent(captureEventSpy).request?.headers).toEqual({
        'content-type': 'application/json',
        'x-trace-id': '[Filtered]',
        authorization: '[Filtered]',
      });
    });

    it('does not collect request headers when dataCollection.httpHeaders.request is false', () => {
      const { fetchHandler, captureEventSpy } = setup({
        dataCollection: { httpHeaders: { request: false, response: true } },
      });

      triggerFetch(fetchHandler, {
        requestHeaders: { 'Content-Type': 'application/json', Authorization: 'Bearer x' },
        responseHeaders: { 'Content-Type': 'text/html' },
      });

      const event = getEvent(captureEventSpy);
      expect(event.request?.headers).toBeUndefined();
      expect(event.contexts?.response?.headers).toEqual({ 'content-type': 'text/html' });
    });
  });

  describe('xhr', () => {
    it('filters sensitive request and response headers with sendDefaultPii', () => {
      const { xhrHandler, captureEventSpy } = setup({ sendDefaultPii: true });

      triggerXhr(xhrHandler, {
        requestHeaders: { Authorization: 'Bearer super-secret-token', 'X-Custom': 'safe-value' },
        allResponseHeaders: 'content-type: text/html\r\nx-auth-token: secret-response-token\r\nx-request-id: abc-123',
      });

      const event = getEvent(captureEventSpy);

      // XHR request header keys keep their original casing (they come from the captured request, not a Headers object).
      expect(event.request?.headers).toEqual({
        Authorization: '[Filtered]',
        'X-Custom': 'safe-value',
      });
      expect(event.contexts?.response?.headers).toEqual({
        'content-type': 'text/html',
        'x-auth-token': '[Filtered]',
        'x-request-id': 'abc-123',
      });
    });

    it('parses and filters sensitive cookies from the Set-Cookie response header', () => {
      const { xhrHandler, captureEventSpy } = setup({ sendDefaultPii: true });

      triggerXhr(xhrHandler, {
        setCookie: 'session=abc123; theme=dark; connect.sid=secret',
      });

      expect(getEvent(captureEventSpy).contexts?.response?.cookies).toEqual({
        session: '[Filtered]',
        theme: 'dark',
        'connect.sid': '[Filtered]',
      });
    });

    it('does not collect response headers or cookies without sendDefaultPii or dataCollection', () => {
      const { xhrHandler, captureEventSpy } = setup();

      triggerXhr(xhrHandler, {
        requestHeaders: { Authorization: 'Bearer x' },
        setCookie: 'session=abc123; theme=dark',
        allResponseHeaders: 'content-type: text/html',
      });

      expect(captureEventSpy).toHaveBeenCalledTimes(1);
      const event = getEvent(captureEventSpy);
      expect(event.request?.headers).toBeUndefined();
      expect(event.contexts?.response?.headers).toBeUndefined();
      expect(event.contexts?.response?.cookies).toBeUndefined();
    });
  });
});
