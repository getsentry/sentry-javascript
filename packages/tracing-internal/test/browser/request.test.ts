/* eslint-disable deprecation/deprecation */
import * as sentryCore from '@sentry/core';
import * as utils from '@sentry/utils';
import { SENTRY_XHR_DATA_KEY } from '@sentry/utils';

import type { Transaction } from '../../../tracing/src';
import { addExtensionMethods, Span, spanStatusfromHttpCode } from '../../../tracing/src';
import { getDefaultBrowserClientOptions } from '../../../tracing/test/testutils';
import type { FetchData, XHRData } from '../../src/browser/request';
import { fetchCallback, instrumentOutgoingRequests, shouldAttachHeaders, xhrCallback } from '../../src/browser/request';
import { TestClient } from '../utils/TestClient';

beforeAll(() => {
  addExtensionMethods();
  // @ts-ignore need to override global Request because it's not in the jest environment (even with an
  // `@jest-environment jsdom` directive, for some reason)
  global.Request = {};
});

const hasTracingEnabled = jest.spyOn(sentryCore, 'hasTracingEnabled');
const addInstrumentationHandler = jest.spyOn(utils, 'addInstrumentationHandler');
const setRequestHeader = jest.fn();

describe('instrumentOutgoingRequests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('instruments fetch and xhr requests', () => {
    instrumentOutgoingRequests();

    expect(addInstrumentationHandler).toHaveBeenCalledWith('fetch', expect.any(Function));
    expect(addInstrumentationHandler).toHaveBeenCalledWith('xhr', expect.any(Function));
  });

  it('does not instrument fetch requests if traceFetch is false', () => {
    instrumentOutgoingRequests({ traceFetch: false });

    expect(addInstrumentationHandler).not.toHaveBeenCalledWith('fetch', expect.any(Function));
  });

  it('does not instrument xhr requests if traceXHR is false', () => {
    instrumentOutgoingRequests({ traceXHR: false });

    expect(addInstrumentationHandler).not.toHaveBeenCalledWith('xhr', expect.any(Function));
  });
});

describe('callbacks', () => {
  let hub: sentryCore.Hub;
  let transaction: Transaction;
  const alwaysCreateSpan = () => true;
  const alwaysAttachHeaders = () => true;
  const startTimestamp = 1356996072000;
  const endTimestamp = 1356996072000;

  beforeAll(() => {
    const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
    hub = new sentryCore.Hub(new TestClient(options));
    sentryCore.makeMain(hub);
  });

  beforeEach(() => {
    transaction = hub.startTransaction({ name: 'organizations/users/:userid', op: 'pageload' }) as Transaction;
    hub.configureScope(scope => scope.setSpan(transaction));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchCallback()', () => {
    let fetchHandlerData: FetchData;

    const fetchSpan = {
      data: {
        'http.method': 'GET',
        url: 'http://dogs.are.great/',
        type: 'fetch',
      },
      description: 'GET http://dogs.are.great/',
      op: 'http.client',
      parentSpanId: expect.any(String),
      spanId: expect.any(String),
      startTimestamp: expect.any(Number),
      traceId: expect.any(String),
    };

    beforeEach(() => {
      fetchHandlerData = {
        args: ['http://dogs.are.great/', {}],
        fetchData: { url: 'http://dogs.are.great/', method: 'GET' },
        startTimestamp,
      };
    });

    it.each([
      // each case is [shouldCreateSpanReturnValue, shouldAttachHeadersReturnValue, expectedSpan, expectedHeaderKeys]
      [true, true, expect.objectContaining(fetchSpan), ['sentry-trace', 'baggage']],
      [true, false, expect.objectContaining(fetchSpan), []],
      [false, true, undefined, ['sentry-trace', 'baggage']],
      [false, false, undefined, []],
    ])(
      'span creation/header attachment interaction - shouldCreateSpan: %s, shouldAttachHeaders: %s',
      (shouldCreateSpanReturnValue, shouldAttachHeadersReturnValue, expectedSpan, expectedHeaderKeys) => {
        fetchCallback(
          fetchHandlerData,
          () => shouldCreateSpanReturnValue,
          () => shouldAttachHeadersReturnValue,
          {},
        );

        // spans[0] is the transaction itself
        const newSpan = transaction.spanRecorder?.spans[1] as Span;
        expect(newSpan).toEqual(expectedSpan);

        const headers = (fetchHandlerData.args[1].headers as Record<string, string>) || {};
        expect(Object.keys(headers)).toEqual(expectedHeaderKeys);
      },
    );

    it('adds neither fetch request spans nor fetch request headers if there is no fetch data in handler data', () => {
      delete fetchHandlerData.fetchData;
      const spans = {};

      fetchCallback(fetchHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      expect(spans).toEqual({});

      const headers = (fetchHandlerData.args[1].headers as Record<string, string>) || {};
      expect(Object.keys(headers)).toEqual([]);
    });

    it('adds neither fetch request spans nor fetch request headers if tracing is disabled', () => {
      hasTracingEnabled.mockReturnValueOnce(false);
      const spans = {};

      fetchCallback(fetchHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      expect(spans).toEqual({});

      const headers = (fetchHandlerData.args[1].headers as Record<string, string>) || {};
      expect(Object.keys(headers)).toEqual([]);
    });

    it('creates and finishes fetch span on active transaction', () => {
      const spans = {};

      // triggered by request being sent
      fetchCallback(fetchHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      const newSpan = transaction.spanRecorder?.spans[1] as Span;

      expect(newSpan).toBeDefined();
      expect(newSpan).toBeInstanceOf(Span);
      expect(newSpan.data).toEqual({
        'http.method': 'GET',
        type: 'fetch',
        url: 'http://dogs.are.great/',
      });
      expect(newSpan.description).toBe('GET http://dogs.are.great/');
      expect(newSpan.op).toBe('http.client');
      expect(fetchHandlerData.fetchData?.__span).toBeDefined();

      const postRequestFetchHandlerData = {
        ...fetchHandlerData,
        endTimestamp,
      };

      // triggered by response coming back
      fetchCallback(postRequestFetchHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      expect(newSpan.endTimestamp).toBeDefined();
    });

    it('sets response status on finish', () => {
      const spans: Record<string, Span> = {};

      // triggered by request being sent
      fetchCallback(fetchHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      const newSpan = transaction.spanRecorder?.spans[1] as Span;

      expect(newSpan).toBeDefined();

      const postRequestFetchHandlerData = {
        ...fetchHandlerData,
        endTimestamp,
        response: { status: 404 } as Response,
      };

      // triggered by response coming back
      fetchCallback(postRequestFetchHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      expect(newSpan.status).toBe(spanStatusfromHttpCode(404));
    });

    it('ignores response with no associated span', () => {
      // the request might be missed somehow. E.g. if it was sent before tracing gets enabled.

      const postRequestFetchHandlerData = {
        ...fetchHandlerData,
        endTimestamp,
        response: { status: 404 } as Response,
      };

      // in that case, the response coming back will be ignored
      fetchCallback(postRequestFetchHandlerData, alwaysCreateSpan, alwaysAttachHeaders, {});

      const newSpan = transaction.spanRecorder?.spans[1];

      expect(newSpan).toBeUndefined();
    });

    it('adds content-length to span data on finish', () => {
      const spans: Record<string, Span> = {};

      // triggered by request being sent
      fetchCallback(fetchHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      const newSpan = transaction.spanRecorder?.spans[1] as Span;

      expect(newSpan).toBeDefined();

      const postRequestFetchHandlerData = {
        ...fetchHandlerData,
        endTimestamp,
        response: { status: 404, headers: { get: () => 123 } },
      };

      // triggered by response coming back
      fetchCallback(postRequestFetchHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      const finishedSpan = transaction.spanRecorder?.spans[1] as Span;

      expect(finishedSpan).toBeDefined();
      expect(finishedSpan).toBeInstanceOf(Span);
      expect(finishedSpan.data).toEqual({
        'http.response_content_length': 123,
        'http.method': 'GET',
        'http.response.status_code': 404,
        type: 'fetch',
        url: 'http://dogs.are.great/',
      });
    });
  });

  describe('xhrCallback()', () => {
    let xhrHandlerData: XHRData;

    const xhrSpan = {
      data: {
        'http.method': 'GET',
        url: 'http://dogs.are.great/',
        type: 'xhr',
      },
      description: 'GET http://dogs.are.great/',
      op: 'http.client',
      parentSpanId: expect.any(String),
      spanId: expect.any(String),
      startTimestamp: expect.any(Number),
      traceId: expect.any(String),
    };

    beforeEach(() => {
      xhrHandlerData = {
        xhr: {
          [SENTRY_XHR_DATA_KEY]: {
            method: 'GET',
            url: 'http://dogs.are.great/',
            status_code: 200,
            data: {},
          },
          __sentry_xhr_span_id__: '1231201211212012',
          setRequestHeader,
        },
        startTimestamp,
      };
    });

    it.each([
      // each case is [shouldCreateSpanReturnValue, shouldAttachHeadersReturnValue, expectedSpan, expectedHeaderKeys]
      [true, true, expect.objectContaining(xhrSpan), ['sentry-trace', 'baggage']],
      [true, false, expect.objectContaining(xhrSpan), []],
      // If there's no span then there's no parent span id to stick into a header, so no headers, even if there's a
      // `tracingOrigins` match
      [false, true, undefined, []],
      [false, false, undefined, []],
    ])(
      'span creation/header attachment interaction - shouldCreateSpan: %s, shouldAttachHeaders: %s',
      (shouldCreateSpanReturnValue, shouldAttachHeadersReturnValue, expectedSpan, expectedHeaderKeys) => {
        xhrCallback(
          xhrHandlerData,
          () => shouldCreateSpanReturnValue,
          () => shouldAttachHeadersReturnValue,
          {},
        );

        // spans[0] is the transaction itself
        const newSpan = transaction.spanRecorder?.spans[1] as Span;
        expect(newSpan).toEqual(expectedSpan);

        const headerKeys = setRequestHeader.mock.calls.map(header => header[0]);
        expect(headerKeys).toEqual(expectedHeaderKeys);
      },
    );

    it('adds neither xhr request spans nor xhr request headers if tracing is disabled', () => {
      hasTracingEnabled.mockReturnValueOnce(false);
      const spans = {};

      xhrCallback(xhrHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      expect(spans).toEqual({});
      expect(setRequestHeader).not.toHaveBeenCalled();
    });

    it('creates and finishes XHR span on active transaction', () => {
      const spans = {};

      // triggered by request being sent
      xhrCallback(xhrHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      const newSpan = transaction.spanRecorder?.spans[1] as Span;

      expect(newSpan).toBeInstanceOf(Span);
      expect(newSpan.data).toEqual({
        'http.method': 'GET',
        type: 'xhr',
        url: 'http://dogs.are.great/',
      });
      expect(newSpan.description).toBe('GET http://dogs.are.great/');
      expect(newSpan.op).toBe('http.client');
      expect(xhrHandlerData.xhr?.__sentry_xhr_span_id__).toBeDefined();
      expect(xhrHandlerData.xhr?.__sentry_xhr_span_id__).toEqual(newSpan?.spanId);

      const postRequestXHRHandlerData = {
        ...xhrHandlerData,
        endTimestamp,
      };

      // triggered by response coming back
      xhrCallback(postRequestXHRHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      expect(newSpan.endTimestamp).toBeDefined();
    });

    it('sets response status on finish', () => {
      const spans = {};

      // triggered by request being sent
      xhrCallback(xhrHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      const newSpan = transaction.spanRecorder?.spans[1] as Span;

      expect(newSpan).toBeDefined();

      const postRequestXHRHandlerData = {
        ...xhrHandlerData,
        endTimestamp,
      };
      postRequestXHRHandlerData.xhr![SENTRY_XHR_DATA_KEY]!.status_code = 404;

      // triggered by response coming back
      xhrCallback(postRequestXHRHandlerData, alwaysCreateSpan, alwaysAttachHeaders, spans);

      expect(newSpan.status).toBe(spanStatusfromHttpCode(404));
    });

    it('ignores response with no associated span', () => {
      // the request might be missed somehow. E.g. if it was sent before tracing gets enabled.

      const postRequestXHRHandlerData = {
        ...{
          xhr: {
            [SENTRY_XHR_DATA_KEY]: xhrHandlerData.xhr?.[SENTRY_XHR_DATA_KEY],
          },
        },
        startTimestamp,
        endTimestamp,
      };

      // in that case, the response coming back will be ignored
      xhrCallback(postRequestXHRHandlerData, alwaysCreateSpan, alwaysAttachHeaders, {});

      const newSpan = transaction.spanRecorder?.spans[1];

      expect(newSpan).toBeUndefined();
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

  describe('should fall back to defaults if no options are specified', () => {
    it.each([
      '/api/test',
      'http://localhost:3000/test',
      'http://somewhere.com/test/localhost/123',
      'http://somewhere.com/test?url=localhost:3000&test=123',
      '//localhost:3000/test',
      '/',
    ])('return `true` for urls matching defaults (%s)', url => {
      expect(shouldAttachHeaders(url, undefined)).toBe(true);
    });

    it.each(['notmydoman/api/test', 'example.com', '//example.com'])(
      'return `false` for urls not matching defaults (%s)',
      url => {
        expect(shouldAttachHeaders(url, undefined)).toBe(false);
      },
    );
  });
});
