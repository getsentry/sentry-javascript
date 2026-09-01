import type { Client } from '@sentry/core/browser';
import * as utils from '@sentry/core/browser';
import * as browserUtils from '@sentry/browser-utils';
import { HTTP_REQUEST_METHOD } from '@sentry/conventions/attributes';
import type { MockInstance } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '../../src/client';
import { instrumentOutgoingRequests, shouldAttachHeaders } from '../../src/tracing/request';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

beforeAll(() => {
  // @ts-expect-error need to override global Request because it's not in the vi environment (even with an
  // `@vi-environment jsdom` directive, for some reason)
  global.Request = {};
});

class MockClient implements Partial<Client> {
  // @ts-expect-error not returning options for the test
  public getOptions() {
    return {};
  }

  public emit(): void {}
}

describe('instrumentOutgoingRequests', () => {
  let client: Client;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new MockClient() as unknown as Client;
    utils._INTERNAL_setSpanForScope(utils.getCurrentScope(), undefined);
  });

  it('instruments fetch and xhr requests', () => {
    const addFetchSpy = vi.spyOn(utils, 'addFetchInstrumentationHandler');
    const addXhrSpy = vi.spyOn(browserUtils, 'addXhrInstrumentationHandler');

    instrumentOutgoingRequests(client);

    expect(addFetchSpy).toHaveBeenCalledWith(expect.any(Function));
    expect(addXhrSpy).toHaveBeenCalledWith(expect.any(Function));
  });

  it('does not instrument fetch requests if traceFetch is false', () => {
    const addFetchSpy = vi.spyOn(utils, 'addFetchInstrumentationHandler');

    instrumentOutgoingRequests(client, { traceFetch: false });

    expect(addFetchSpy).not.toHaveBeenCalled();
  });

  it('does not instrument xhr requests if traceXHR is false', () => {
    const addXhrSpy = vi.spyOn(browserUtils, 'addXhrInstrumentationHandler');

    instrumentOutgoingRequests(client, { traceXHR: false });

    expect(addXhrSpy).not.toHaveBeenCalled();
  });

  it('creates a QUERY fetch span with the QUERY method attribute', () => {
    let fetchHandler: ((data: utils.HandlerDataFetch) => void) | undefined;
    let requestSpan: utils.Span | undefined;

    vi.spyOn(utils, 'addFetchInstrumentationHandler').mockImplementation(handler => {
      fetchHandler = handler;
    });
    const tracingClient = new BrowserClient(getDefaultBrowserClientOptions({ tracesSampleRate: 1 }));
    utils.setCurrentClient(tracingClient);
    utils._INTERNAL_setSpanForScope(utils.getCurrentScope(), new utils.SentrySpan({ sampled: true }));

    instrumentOutgoingRequests(tracingClient, {
      traceXHR: false,
      enableHTTPTimings: false,
      onRequestSpanStart: span => {
        requestSpan = span;
      },
    });
    fetchHandler?.({
      fetchData: { method: 'QUERY', url: 'https://example.com/rest/v1/users?select=id' },
      args: ['https://example.com/rest/v1/users?select=id'],
      startTimestamp: Date.now(),
    });

    expect(fetchHandler).toBeDefined();
    expect(requestSpan).toBeDefined();
    const requestSpanJson = utils.spanToJSON(requestSpan!);
    expect(requestSpanJson.name).toBe('QUERY example.com');
    expect(requestSpanJson.attributes[HTTP_REQUEST_METHOD]).toBe('QUERY');
  });

  it('creates a QUERY XHR span with the QUERY method attribute', () => {
    let xhrHandler: ((data: browserUtils.HandlerDataXhr) => void) | undefined;
    let requestSpan: utils.Span | undefined;

    vi.spyOn(browserUtils, 'addXhrInstrumentationHandler').mockImplementation(handler => {
      xhrHandler = handler;
    });
    const tracingClient = new BrowserClient(getDefaultBrowserClientOptions({ tracesSampleRate: 1 }));
    utils.setCurrentClient(tracingClient);
    utils._INTERNAL_setSpanForScope(utils.getCurrentScope(), new utils.SentrySpan({ sampled: true }));

    instrumentOutgoingRequests(tracingClient, {
      traceFetch: false,
      enableHTTPTimings: false,
      onRequestSpanStart: span => {
        requestSpan = span;
      },
    });
    xhrHandler?.({
      xhr: {
        [browserUtils.SENTRY_XHR_DATA_KEY]: {
          method: 'QUERY',
          url: 'https://example.com/rest/v1/users?select=id',
          request_headers: {},
        },
        setRequestHeader: vi.fn(),
      },
      startTimestamp: Date.now(),
    } as browserUtils.HandlerDataXhr);

    expect(xhrHandler).toBeDefined();
    expect(requestSpan).toBeDefined();
    const requestSpanJson = utils.spanToJSON(requestSpan!);
    expect(requestSpanJson.name).toBe('QUERY example.com');
    expect(requestSpanJson.attributes[HTTP_REQUEST_METHOD]).toBe('QUERY');
  });

  it('keeps the sanitized URL in the fetch span name with `traceLifecycle: "static"`', () => {
    let fetchHandler: ((data: utils.HandlerDataFetch) => void) | undefined;
    let requestSpan: utils.Span | undefined;

    vi.spyOn(utils, 'addFetchInstrumentationHandler').mockImplementation(handler => {
      fetchHandler = handler;
    });
    const tracingClient = new BrowserClient(
      getDefaultBrowserClientOptions({ tracesSampleRate: 1, traceLifecycle: 'static' }),
    );
    utils.setCurrentClient(tracingClient);
    utils._INTERNAL_setSpanForScope(utils.getCurrentScope(), new utils.SentrySpan({ sampled: true }));

    instrumentOutgoingRequests(tracingClient, {
      traceXHR: false,
      enableHTTPTimings: false,
      onRequestSpanStart: span => {
        requestSpan = span;
      },
    });
    fetchHandler?.({
      fetchData: { method: 'QUERY', url: 'https://example.com/rest/v1/users?select=id' },
      args: ['https://example.com/rest/v1/users?select=id'],
      startTimestamp: Date.now(),
    });

    expect(utils.spanToJSON(requestSpan!).name).toBe('QUERY https://example.com/rest/v1/users');
  });

  it('keeps the sanitized URL in the XHR span name with `traceLifecycle: "static"`', () => {
    let xhrHandler: ((data: utils.HandlerDataXhr) => void) | undefined;
    let requestSpan: utils.Span | undefined;

    vi.spyOn(browserUtils, 'addXhrInstrumentationHandler').mockImplementation(handler => {
      xhrHandler = handler;
    });
    const tracingClient = new BrowserClient(
      getDefaultBrowserClientOptions({ tracesSampleRate: 1, traceLifecycle: 'static' }),
    );
    utils.setCurrentClient(tracingClient);
    utils._INTERNAL_setSpanForScope(utils.getCurrentScope(), new utils.SentrySpan({ sampled: true }));

    instrumentOutgoingRequests(tracingClient, {
      traceFetch: false,
      enableHTTPTimings: false,
      onRequestSpanStart: span => {
        requestSpan = span;
      },
    });
    xhrHandler?.({
      xhr: {
        [browserUtils.SENTRY_XHR_DATA_KEY]: {
          method: 'QUERY',
          url: 'https://example.com/rest/v1/users?select=id',
          request_headers: {},
        },
        setRequestHeader: vi.fn(),
      },
      startTimestamp: Date.now(),
    } as utils.HandlerDataXhr);

    expect(utils.spanToJSON(requestSpan!).name).toBe('QUERY https://example.com/rest/v1/users');
  });

  it('strips userinfo and the port from the streamed XHR span name and `url.domain`', () => {
    let xhrHandler: ((data: utils.HandlerDataXhr) => void) | undefined;
    let requestSpan: utils.Span | undefined;

    vi.spyOn(browserUtils, 'addXhrInstrumentationHandler').mockImplementation(handler => {
      xhrHandler = handler;
    });
    const tracingClient = new BrowserClient(getDefaultBrowserClientOptions({ tracesSampleRate: 1 }));
    utils.setCurrentClient(tracingClient);
    utils._INTERNAL_setSpanForScope(utils.getCurrentScope(), new utils.SentrySpan({ sampled: true }));

    instrumentOutgoingRequests(tracingClient, {
      traceFetch: false,
      enableHTTPTimings: false,
      onRequestSpanStart: span => {
        requestSpan = span;
      },
    });
    xhrHandler?.({
      xhr: {
        [browserUtils.SENTRY_XHR_DATA_KEY]: {
          method: 'GET',
          url: 'https://user:pass@example.com:8443/rest/v1/users',
          request_headers: {},
        },
        setRequestHeader: vi.fn(),
      },
      startTimestamp: Date.now(),
    } as utils.HandlerDataXhr);

    const requestSpanJson = utils.spanToJSON(requestSpan!);
    expect(requestSpanJson.name).toBe('GET example.com');
    expect(requestSpanJson.attributes['url.domain']).toBe('example.com');
    expect(requestSpanJson.attributes['server.address']).toBe('example.com:8443');
  });

  it('resolves a relative fetch URL against the page origin for the streamed span name', () => {
    vi.stubGlobal('location', { origin: 'https://app.example.com' });

    let fetchHandler: ((data: utils.HandlerDataFetch) => void) | undefined;
    let requestSpan: utils.Span | undefined;

    vi.spyOn(utils, 'addFetchInstrumentationHandler').mockImplementation(handler => {
      fetchHandler = handler;
    });
    const tracingClient = new BrowserClient(getDefaultBrowserClientOptions({ tracesSampleRate: 1 }));
    utils.setCurrentClient(tracingClient);
    utils._INTERNAL_setSpanForScope(utils.getCurrentScope(), new utils.SentrySpan({ sampled: true }));

    instrumentOutgoingRequests(tracingClient, {
      traceXHR: false,
      enableHTTPTimings: false,
      onRequestSpanStart: span => {
        requestSpan = span;
      },
    });
    fetchHandler?.({
      fetchData: { method: 'GET', url: '/rest/v1/users?select=id' },
      args: ['/rest/v1/users?select=id'],
      startTimestamp: Date.now(),
    });

    const requestSpanJson = utils.spanToJSON(requestSpan!);
    expect(requestSpanJson.name).toBe('GET app.example.com');
    expect(requestSpanJson.attributes['url.domain']).toBe('app.example.com');

    vi.unstubAllGlobals();
  });

  it('resolves a relative XHR URL against the page origin for the streamed span name', () => {
    vi.stubGlobal('location', { origin: 'https://app.example.com' });

    let xhrHandler: ((data: utils.HandlerDataXhr) => void) | undefined;
    let requestSpan: utils.Span | undefined;

    vi.spyOn(browserUtils, 'addXhrInstrumentationHandler').mockImplementation(handler => {
      xhrHandler = handler;
    });
    const tracingClient = new BrowserClient(getDefaultBrowserClientOptions({ tracesSampleRate: 1 }));
    utils.setCurrentClient(tracingClient);
    utils._INTERNAL_setSpanForScope(utils.getCurrentScope(), new utils.SentrySpan({ sampled: true }));

    instrumentOutgoingRequests(tracingClient, {
      traceFetch: false,
      enableHTTPTimings: false,
      onRequestSpanStart: span => {
        requestSpan = span;
      },
    });
    xhrHandler?.({
      xhr: {
        [browserUtils.SENTRY_XHR_DATA_KEY]: {
          method: 'GET',
          url: '/rest/v1/users?select=id',
          request_headers: {},
        },
        setRequestHeader: vi.fn(),
      },
      startTimestamp: Date.now(),
    } as utils.HandlerDataXhr);

    const requestSpanJson = utils.spanToJSON(requestSpan!);
    expect(requestSpanJson.name).toBe('GET app.example.com');
    expect(requestSpanJson.attributes['url.domain']).toBe('app.example.com');

    vi.unstubAllGlobals();
  });

  it('falls back to the request method for a data URL, which has no domain', () => {
    let fetchHandler: ((data: utils.HandlerDataFetch) => void) | undefined;
    let requestSpan: utils.Span | undefined;

    vi.spyOn(utils, 'addFetchInstrumentationHandler').mockImplementation(handler => {
      fetchHandler = handler;
    });
    const tracingClient = new BrowserClient(getDefaultBrowserClientOptions({ tracesSampleRate: 1 }));
    utils.setCurrentClient(tracingClient);
    utils._INTERNAL_setSpanForScope(utils.getCurrentScope(), new utils.SentrySpan({ sampled: true }));

    instrumentOutgoingRequests(tracingClient, {
      traceXHR: false,
      enableHTTPTimings: false,
      onRequestSpanStart: span => {
        requestSpan = span;
      },
    });
    fetchHandler?.({
      fetchData: { method: 'GET', url: 'data:text/plain,hello' },
      args: ['data:text/plain,hello'],
      startTimestamp: Date.now(),
    });

    const requestSpanJson = utils.spanToJSON(requestSpan!);
    expect(requestSpanJson.name).toBe('GET');
    expect(requestSpanJson.attributes['url.domain']).toBeUndefined();
  });

  describe('XHR trace header span', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('uses the active propagation context for an ignored child span', () => {
      const activeSpan = new utils.SentryNonRecordingSpan();
      const ignoredSpan = new utils.SentryNonRecordingSpan({ dropReason: 'ignored' });
      let xhrHandler: ((data: browserUtils.HandlerDataXhr) => void) | undefined;

      vi.spyOn(browserUtils, 'addXhrInstrumentationHandler').mockImplementation(handler => {
        xhrHandler = handler;
      });
      vi.spyOn(utils, 'getClient').mockReturnValue(client);
      vi.spyOn(utils, 'getActiveSpan').mockReturnValue(activeSpan);
      vi.spyOn(utils, 'hasSpansEnabled').mockReturnValue(true);
      vi.spyOn(utils, 'hasSpanStreamingEnabled').mockReturnValue(true);
      vi.spyOn(utils, 'startInactiveSpan').mockReturnValue(ignoredSpan);
      const getTraceDataSpy = vi.spyOn(utils, 'getTraceData').mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      });

      instrumentOutgoingRequests(client, {
        traceFetch: false,
        tracePropagationTargets: ['example.com'],
        enableHTTPTimings: false,
      });
      xhrHandler?.({
        xhr: {
          [browserUtils.SENTRY_XHR_DATA_KEY]: {
            method: 'GET',
            url: 'https://example.com/outgoing',
            request_headers: {},
          },
          setRequestHeader: vi.fn(),
        },
        startTimestamp: Date.now(),
      } as browserUtils.HandlerDataXhr);

      expect(xhrHandler).toBeDefined();
      expect(getTraceDataSpy).toHaveBeenCalledWith({
        span: undefined,
        propagateTraceparent: undefined,
      });
    });
  });
});

describe('shouldAttachHeaders', () => {
  describe('should prefer `tracePropagationTargets` over defaults', () => {
    it('should return `true` if the url matches the new tracePropagationTargets', () => {
      expect(shouldAttachHeaders('http://example.com', ['example.com'])).toBe(true);
    });

    it('should return `false` if tracePropagationTargets array is empty', () => {
      expect(shouldAttachHeaders('http://localhost:3000/test', [])).toBe(false);
    });

    it("should return `false` if tracePropagationTargets array doesn't match", () => {
      expect(shouldAttachHeaders('http://localhost:3000/test', ['example.com'])).toBe(false);
    });
  });

  describe('with no defined `tracePropagationTargets`', () => {
    let locationHrefSpy: MockInstance;

    beforeEach(() => {
      locationHrefSpy = vi.spyOn(browserUtils, 'getLocationHref').mockImplementation(() => 'https://my-origin.com');
    });

    afterEach(() => {
      locationHrefSpy.mockReset();
    });

    it.each([
      'https://my-origin.com',
      'https://my-origin.com/test',
      '/',
      '/api/test',
      '//my-origin.com/',
      '//my-origin.com/test',
      'foobar', // this is a relative request
      'not-my-origin.com', // this is a relative request
      'not-my-origin.com/api/test', // this is a relative request
    ])('should return `true` for same-origin URLs (%s)', url => {
      expect(shouldAttachHeaders(url, undefined)).toBe(true);
    });

    it.each([
      'http://my-origin.com', // wrong protocol
      'http://my-origin.com/api', // wrong protocol
      'http://localhost:3000',
      '//not-my-origin.com/test',
      'https://somewhere.com/test/localhost/123',
      'https://somewhere.com/test?url=https://my-origin.com',
      '//example.com',
    ])('should return `false` for cross-origin URLs (%s)', url => {
      expect(shouldAttachHeaders(url, undefined)).toBe(false);
    });
  });

  describe('with `tracePropagationTargets`', () => {
    let locationHrefSpy: MockInstance;

    beforeEach(() => {
      locationHrefSpy = vi
        .spyOn(browserUtils, 'getLocationHref')
        .mockImplementation(() => 'https://my-origin.com/api/my-route');
    });

    afterEach(() => {
      locationHrefSpy.mockReset();
    });

    it.each([
      ['https://my-origin.com', /^\//, true], // pathname defaults to "/"
      ['https://my-origin.com/', /^\//, true],
      ['https://not-my-origin.com', /^\//, false], // pathname does not match in isolation for cross origin
      ['https://not-my-origin.com/', /^\//, false], // pathname does not match in isolation for cross origin

      ['http://my-origin.com/', /^\//, false], // different protocol than origin

      ['//my-origin.com', /^\//, true], // pathname defaults to "/"
      ['//my-origin.com/', /^\//, true], // matches pathname
      ['//not-my-origin.com', /^\//, false],
      ['//not-my-origin.com/', /^\//, false], // different origin should not match pathname

      ['//my-origin.com', /^https:/, true],
      ['//not-my-origin.com', /^https:/, true],
      ['//my-origin.com', /^http:/, false],
      ['//not-my-origin.com', /^http:/, false],

      ['https://my-origin.com/api', /^\/api/, true],
      ['https://not-my-origin.com/api', /^\/api/, false], // different origin should not match pathname in isolation

      ['https://my-origin.com/api', /api/, true],
      ['https://not-my-origin.com/api', /api/, true],

      ['/api', /^\/api/, true], // matches pathname
      ['/api', /\/\/my-origin\.com\/api/, true], // matches full url
      ['foobar', /\/foobar/, true], // matches full url
      ['foobar', /^\/api\/foobar/, true], // full url match
      ['some-url.com', /\/some-url\.com/, true],
      ['some-url.com', /^\/some-url\.com/, false], // does not match pathname or full url
      ['some-url.com', /^\/api\/some-url\.com/, true], // matches pathname

      ['/api', /^http:/, false],
      ['foobar', /^http:/, false],
      ['some-url.com', /^http:/, false],
      ['/api', /^https:/, true],
      ['foobar', /^https:/, true],
      ['some-url.com', /^https:/, true],

      ['https://my-origin.com', 'my-origin', true],
      ['https://not-my-origin.com', 'my-origin', true],
      ['https://my-origin.com', 'not-my-origin', false],
      ['https://not-my-origin.com', 'not-my-origin', true],

      ['https://my-origin.com', 'https', true],
      ['https://my-origin.com', 'http', true], // partially matches https
      ['//my-origin.com', 'https', true],
      ['//my-origin.com', 'http', true], // partially matches https

      ['/api', '/api', true],
      ['api', '/api', true], // full url match
      ['https://not-my-origin.com/api', 'api', true],
      ['https://my-origin.com?my-query', 'my-query', true],
      ['https://not-my-origin.com?my-query', 'my-query', true],

      // matching is case-insensitive in both directions, because `new URL()` lower-cases the origin
      ['https://MY-ORIGIN.com', 'my-origin', true],
      ['https://my-origin.com', 'MY-ORIGIN', true],
      ['https://my-origin.com', /^https:\/\/MY-ORIGIN\.com\//, true],
      ['https://MY-ORIGIN.com', /^https:\/\/my-origin\.com\//, true],
      ['https://my-origin.com/API/my-route', '/api/', true],
      ['https://my-origin.com/api/my-route', '/API/', true],
      ['https://my-origin.com/API/my-route', /^\/api\//, true],
      ['https://MY-ORIGIN.com', 'not-my-origin', false], // still no match on a genuinely different target
    ])(
      'for url %j and tracePropagationTarget %j on page "https://my-origin.com/api/my-route" should return %j',
      (url, matcher, result) => {
        expect(shouldAttachHeaders(url, [matcher])).toBe(result);
      },
    );
  });

  it.each([
    'https://my-origin.com',
    'https://my-origin.com/',
    'https://not-my-origin.com',
    'https://not-my-origin.com/',
    'http://my-origin.com/',
    '//my-origin.com',
    '//my-origin.com/',
    '//not-my-origin.com',
    '//not-my-origin.com/',
    '//my-origin.com',
    '//not-my-origin.com',
    '//my-origin.com',
    '//not-my-origin.com',
    'https://my-origin.com/api',
    'https://not-my-origin.com/api',
    'https://my-origin.com/api',
    'https://not-my-origin.com/api',
    '/api',
    '/api',
    'foobar',
    'foobar',
    'some-url.com',
    'some-url.com',
    'some-url.com',
    '/api',
    'foobar',
    'some-url.com',
    '/api',
    'foobar',
    'some-url.com',
    'https://my-origin.com',
    'https://not-my-origin.com',
    'https://my-origin.com',
    'https://not-my-origin.com',
    'https://my-origin.com',
    'https://my-origin.com',
    '//my-origin.com',
    '//my-origin.com',
    '/api',
    'api',
    'https://not-my-origin.com/api',
    'https://my-origin.com?my-query',
    'https://not-my-origin.com?my-query',
  ])('should return false for everything if tracePropagationTargets are empty (%j)', url => {
    expect(shouldAttachHeaders(url, [])).toBe(false);
  });

  describe('when window.location.href is not available', () => {
    let locationHrefSpy: MockInstance;

    beforeEach(() => {
      locationHrefSpy = vi.spyOn(browserUtils, 'getLocationHref').mockImplementation(() => '');
    });

    afterEach(() => {
      locationHrefSpy.mockReset();
    });

    describe('with no defined `tracePropagationTargets`', () => {
      it.each([
        ['https://my-origin.com', false],
        ['https://my-origin.com/test', false],
        ['/', true],
        ['/api/test', true],
        ['//my-origin.com/', false],
        ['//my-origin.com/test', false],
        ['//not-my-origin.com/test', false],
        ['foobar', false],
        ['not-my-origin.com', false],
        ['not-my-origin.com/api/test', false],
        ['http://my-origin.com', false],
        ['http://my-origin.com/api', false],
        ['http://localhost:3000', false],
        ['https://somewhere.com/test/localhost/123', false],
        ['https://somewhere.com/test?url=https://my-origin.com', false],
      ])('for URL %j should return %j', (url, expectedResult) => {
        expect(shouldAttachHeaders(url, undefined)).toBe(expectedResult);
      });
    });

    // Here we should only quite literally match the provided urls
    it.each([
      ['https://my-origin.com', /^\//, false],
      ['https://my-origin.com/', /^\//, false],
      ['https://not-my-origin.com', /^\//, false],
      ['https://not-my-origin.com/', /^\//, false],

      ['http://my-origin.com/', /^\//, false],

      // It is arguably bad that these match, at the same time, these targets are very unusual in environments without location.
      ['//my-origin.com', /^\//, true],
      ['//my-origin.com/', /^\//, true],
      ['//not-my-origin.com', /^\//, true],
      ['//not-my-origin.com/', /^\//, true],

      ['//my-origin.com', /^https:/, false],
      ['//not-my-origin.com', /^https:/, false],
      ['//my-origin.com', /^http:/, false],
      ['//not-my-origin.com', /^http:/, false],

      ['https://my-origin.com/api', /^\/api/, false],
      ['https://not-my-origin.com/api', /^\/api/, false],

      ['https://my-origin.com/api', /api/, true],
      ['https://not-my-origin.com/api', /api/, true],

      ['/api', /^\/api/, true],
      ['/api', /\/\/my-origin\.com\/api/, false],
      ['foobar', /\/foobar/, false],
      ['foobar', /^\/api\/foobar/, false],
      ['some-url.com', /\/some-url\.com/, false],
      ['some-url.com', /^\/some-url\.com/, false],
      ['some-url.com', /^\/api\/some-url\.com/, false],

      ['/api', /^http:/, false],
      ['foobar', /^http:/, false],
      ['some-url.com', /^http:/, false],
      ['/api', /^https:/, false],
      ['foobar', /^https:/, false],
      ['some-url.com', /^https:/, false],

      ['https://my-origin.com', 'my-origin', true],
      ['https://not-my-origin.com', 'my-origin', true],
      ['https://my-origin.com', 'not-my-origin', false],
      ['https://not-my-origin.com', 'not-my-origin', true],

      ['https://my-origin.com', 'https', true],
      ['https://my-origin.com', 'http', true],
      ['//my-origin.com', 'https', false],
      ['//my-origin.com', 'http', false],

      ['/api', '/api', true],
      ['api', '/api', false],
      ['https://not-my-origin.com/api', 'api', true],
      ['https://my-origin.com?my-query', 'my-query', true],
      ['https://not-my-origin.com?my-query', 'my-query', true],

      // matching is case-insensitive in both directions, because `new URL()` lower-cases the origin
      ['https://MY-ORIGIN.com', 'my-origin', true],
      ['https://my-origin.com', 'MY-ORIGIN', true],
      ['https://my-origin.com/', /^https:\/\/MY-ORIGIN\.com\//, true],
      ['https://MY-ORIGIN.com/', /^https:\/\/my-origin\.com\//, true],
      ['https://MY-ORIGIN.com', 'not-my-origin', false], // still no match on a genuinely different target
    ])('for url %j and tracePropagationTarget %j should return %j', (url, matcher, result) => {
      expect(shouldAttachHeaders(url, [matcher])).toBe(result);
    });
  });
});
