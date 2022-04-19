import { BrowserClient } from '@sentry/browser';
import { setupBrowserTransport } from '@sentry/browser/src/transports';
import { getDefaultBrowserClientOptions } from '@sentry/browser/test/unit/helper/browser-client-options';
import { Hub, makeMain } from '@sentry/hub';
import * as utils from '@sentry/utils';

import { Span, spanStatusfromHttpCode, Transaction } from '../../src';
import { fetchCallback, FetchData, instrumentOutgoingRequests, xhrCallback } from '../../src/browser/request';
import { addExtensionMethods } from '../../src/hubextensions';
import * as tracingUtils from '../../src/utils';

beforeAll(() => {
  addExtensionMethods();
  // @ts-ignore need to override global Request because it's not in the jest environment (even with an
  // `@jest-environment jsdom` directive, for some reason)
  global.Request = {};
});

const hasTracingEnabled = jest.spyOn(tracingUtils, 'hasTracingEnabled');
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
  let hub: Hub;
  let transaction: Transaction;
  const alwaysCreateSpan = () => true;
  const neverCreateSpan = () => false;
  const startTimestamp = 1356996072000;
  const endTimestamp = 1356996072000;
  const fetchHandlerData: FetchData = {
    args: ['http://dogs.are.great/', {}],
    fetchData: { url: 'http://dogs.are.great/', method: 'GET' },
    startTimestamp,
  };
  const xhrHandlerData = {
    xhr: {
      __sentry_xhr__: {
        method: 'GET',
        url: 'http://dogs.are.great/',
        status_code: 200,
        data: {},
      },
      __sentry_xhr_span_id__: '1231201211212012',
      // eslint-disable-next-line @typescript-eslint/unbound-method
      // setRequestHeader: XMLHttpRequest.prototype.setRequestHeader,
      setRequestHeader,
    },
    startTimestamp,
  };

  beforeAll(() => {
    const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
    hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
    makeMain(hub);
  });

  beforeEach(() => {
    transaction = hub.startTransaction({ name: 'organizations/users/:userid', op: 'pageload' }) as Transaction;
    hub.configureScope(scope => scope.setSpan(transaction));
  });

  describe('fetchCallback()', () => {
    it('does not create span if shouldCreateSpan returns false', () => {
      const spans = {};

      fetchCallback(fetchHandlerData, neverCreateSpan, spans);

      expect(spans).toEqual({});
    });

    it('does not create span if there is no fetch data in handler data', () => {
      const noFetchData = { args: fetchHandlerData.args, startTimestamp: fetchHandlerData.startTimestamp };
      const spans = {};

      fetchCallback(noFetchData, alwaysCreateSpan, spans);
      expect(spans).toEqual({});
    });

    it('does not add fetch request spans if tracing is disabled', () => {
      hasTracingEnabled.mockReturnValueOnce(false);
      const spans = {};

      fetchCallback(fetchHandlerData, alwaysCreateSpan, spans);
      expect(spans).toEqual({});
    });

    it('does not add fetch request headers if tracing is disabled', () => {
      hasTracingEnabled.mockReturnValueOnce(false);

      // make a local copy so the global one doesn't get mutated
      const handlerData: FetchData = {
        args: ['http://dogs.are.great/', {}],
        fetchData: { url: 'http://dogs.are.great/', method: 'GET' },
        startTimestamp: 1353501072000,
      };

      fetchCallback(handlerData, alwaysCreateSpan, {});

      const headers = (handlerData.args[1].headers as Record<string, string>) || {};
      expect(headers['sentry-trace']).not.toBeDefined();
    });

    it('creates and finishes fetch span on active transaction', () => {
      const spans = {};

      // triggered by request being sent
      fetchCallback(fetchHandlerData, alwaysCreateSpan, spans);

      const newSpan = transaction.spanRecorder?.spans[1] as Span;

      expect(newSpan).toBeDefined();
      expect(newSpan).toBeInstanceOf(Span);
      expect(newSpan.data).toEqual({
        method: 'GET',
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
      fetchCallback(postRequestFetchHandlerData, alwaysCreateSpan, spans);

      expect(newSpan.endTimestamp).toBeDefined();
    });

    it('sets response status on finish', () => {
      const spans: Record<string, Span> = {};

      // triggered by request being sent
      fetchCallback(fetchHandlerData, alwaysCreateSpan, spans);

      const newSpan = transaction.spanRecorder?.spans[1] as Span;

      expect(newSpan).toBeDefined();

      const postRequestFetchHandlerData = {
        ...fetchHandlerData,
        endTimestamp,
        response: { status: 404 } as Response,
      };

      // triggered by response coming back
      fetchCallback(postRequestFetchHandlerData, alwaysCreateSpan, spans);

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
      fetchCallback(postRequestFetchHandlerData, alwaysCreateSpan, {});

      const newSpan = transaction.spanRecorder?.spans[1];

      expect(newSpan).toBeUndefined();
    });

    it('adds sentry-trace header to fetch requests', () => {
      // TODO
    });
  });

  describe('xhrCallback()', () => {
    it('does not create span if shouldCreateSpan returns false', () => {
      const spans = {};

      xhrCallback(xhrHandlerData, neverCreateSpan, spans);

      expect(spans).toEqual({});
    });

    it('does not add xhr request spans if tracing is disabled', () => {
      hasTracingEnabled.mockReturnValueOnce(false);
      const spans = {};

      xhrCallback(xhrHandlerData, alwaysCreateSpan, spans);
      expect(spans).toEqual({});
    });

    it('does not add xhr request headers if tracing is disabled', () => {
      hasTracingEnabled.mockReturnValueOnce(false);

      xhrCallback(xhrHandlerData, alwaysCreateSpan, {});

      expect(setRequestHeader).not.toHaveBeenCalled();
    });

    it('adds sentry-trace header to XHR requests', () => {
      xhrCallback(xhrHandlerData, alwaysCreateSpan, {});

      expect(setRequestHeader).toHaveBeenCalledWith(
        'sentry-trace',
        expect.stringMatching(tracingUtils.TRACEPARENT_REGEXP),
      );
    });

    it('creates and finishes XHR span on active transaction', () => {
      const spans = {};

      // triggered by request being sent
      xhrCallback(xhrHandlerData, alwaysCreateSpan, spans);

      const newSpan = transaction.spanRecorder?.spans[1] as Span;

      expect(newSpan).toBeInstanceOf(Span);
      expect(newSpan.data).toEqual({
        method: 'GET',
        type: 'xhr',
        url: 'http://dogs.are.great/',
      });
      expect(newSpan.description).toBe('GET http://dogs.are.great/');
      expect(newSpan.op).toBe('http.client');
      expect(xhrHandlerData.xhr.__sentry_xhr_span_id__).toBeDefined();
      expect(xhrHandlerData.xhr.__sentry_xhr_span_id__).toEqual(newSpan?.spanId);

      const postRequestXHRHandlerData = {
        ...xhrHandlerData,
        endTimestamp,
      };

      // triggered by response coming back
      xhrCallback(postRequestXHRHandlerData, alwaysCreateSpan, spans);

      expect(newSpan.endTimestamp).toBeDefined();
    });

    it('sets response status on finish', () => {
      const spans = {};

      // triggered by request being sent
      xhrCallback(xhrHandlerData, alwaysCreateSpan, spans);

      const newSpan = transaction.spanRecorder?.spans[1] as Span;

      expect(newSpan).toBeDefined();

      const postRequestXHRHandlerData = {
        ...xhrHandlerData,
        endTimestamp,
      };
      postRequestXHRHandlerData.xhr.__sentry_xhr__.status_code = 404;

      // triggered by response coming back
      xhrCallback(postRequestXHRHandlerData, alwaysCreateSpan, spans);

      expect(newSpan.status).toBe(spanStatusfromHttpCode(404));
    });

    it('ignores response with no associated span', () => {
      // the request might be missed somehow. E.g. if it was sent before tracing gets enabled.

      const postRequestXHRHandlerData = {
        ...{
          xhr: {
            __sentry_xhr__: xhrHandlerData.xhr.__sentry_xhr__,
          },
        },
        startTimestamp,
        endTimestamp,
      };

      // in that case, the response coming back will be ignored
      xhrCallback(postRequestXHRHandlerData, alwaysCreateSpan, {});

      const newSpan = transaction.spanRecorder?.spans[1];

      expect(newSpan).toBeUndefined();
    });
  });
});
