import { BrowserClient } from '@sentry/browser';
import { Hub, makeMain } from '@sentry/hub';
import * as utils from '@sentry/utils';

import { Span, SpanStatus, Transaction } from '../../src';
import {
  fetchCallback,
  FetchData,
  registerRequestInstrumentation,
  xhrCallback,
  XHRData,
} from '../../src/browser/request';
import { addExtensionMethods } from '../../src/hubextensions';
import * as tracingUtils from '../../src/utils';

// This is a normal base64 regex, modified to reflect that fact that we strip the trailing = or == off
const stripped_base64 = '([a-zA-Z0-9+/]{4})*([a-zA-Z0-9+/]{2,3})?';

const TRACESTATE_HEADER_REGEX = new RegExp(
  `sentry=(${stripped_base64})` +  // our part of the header - should be the only part or at least the first part
    `(,\\w+=\\w+)*`, // any number of copies of a comma followed by `name=value`
);

beforeAll(() => {
  addExtensionMethods();
  // @ts-ignore need to override global Request because it's not in the jest environment (even with an
  // `@jest-environment jsdom` directive, for some reason)
  global.Request = {};
});

const hasTracingEnabled = jest.spyOn(tracingUtils, 'hasTracingEnabled');
const addInstrumentationHandler = jest.spyOn(utils, 'addInstrumentationHandler');
const setRequestHeader = jest.fn();

describe('registerRequestInstrumentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('instruments fetch and xhr requests', () => {
    registerRequestInstrumentation();

    expect(addInstrumentationHandler).toHaveBeenCalledWith({
      callback: expect.any(Function),
      type: 'fetch',
    });
    expect(addInstrumentationHandler).toHaveBeenCalledWith({
      callback: expect.any(Function),
      type: 'xhr',
    });
  });

  it('does not instrument fetch requests if traceFetch is false', () => {
    registerRequestInstrumentation({ traceFetch: false });

    expect(addInstrumentationHandler).not.toHaveBeenCalledWith({ callback: expect.any(Function), type: 'fetch' });
  });

  it('does not instrument xhr requests if traceXHR is false', () => {
    registerRequestInstrumentation({ traceXHR: false });

    expect(addInstrumentationHandler).not.toHaveBeenCalledWith({ callback: expect.any(Function), type: 'xhr' });
  });
});

describe('callbacks', () => {
  let hub: Hub;
  let transaction: Transaction;
  const alwaysCreateSpan = () => true;
  const neverCreateSpan = () => false;
  const fetchHandlerData: FetchData = {
    args: ['http://dogs.are.great/', {}],
    fetchData: { url: 'http://dogs.are.great/', method: 'GET' },
    startTimestamp: 2012112120121231,
  };
  const xhrHandlerData: XHRData = {
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
    startTimestamp: 2012112120121231,
  };
  const endTimestamp = 2013041520130908;

  beforeAll(() => {
    hub = new Hub(
      new BrowserClient({
        dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
        environment: 'dogpark',
        release: 'off.leash.park',

        tracesSampleRate: 1,
      }),
    );
    makeMain(hub);
  });

  beforeEach(() => {
    transaction = hub.startTransaction({ name: 'meetNewDogFriend', op: 'wag.tail' }) as Transaction;
    hub.configureScope(scope => scope.setSpan(transaction));
    jest.clearAllMocks();
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

    it('does not add tracing headers if tracing is disabled', () => {
      hasTracingEnabled.mockReturnValueOnce(false);

      // make a local copy so the global one doesn't get mutated
      const handlerData = { ...fetchHandlerData };

      fetchCallback(handlerData, alwaysCreateSpan, {});

      const headers = (handlerData.args[1].headers as Record<string, string>) || {};
      expect(headers['sentry-trace']).not.toBeDefined();
      expect(headers['tracestate']).not.toBeDefined();
    });

    it('creates and finishes fetch span on active transaction', () => {
      const spans = {};

      // triggered by request being sent
      fetchCallback(fetchHandlerData, alwaysCreateSpan, spans);

      const newSpan = transaction.spanRecorder?.spans[1];

      expect(newSpan).toBeDefined();
      expect(newSpan).toBeInstanceOf(Span);
      expect(newSpan!.data).toEqual({
        method: 'GET',
        type: 'fetch',
        url: 'http://dogs.are.great/',
      });
      expect(newSpan!.description).toBe('GET http://dogs.are.great/');
      expect(newSpan!.op).toBe('http');
      expect(fetchHandlerData.fetchData?.__span).toBeDefined();

      const postRequestFetchHandlerData = {
        ...fetchHandlerData,
        endTimestamp,
      };

      // triggered by response coming back
      fetchCallback(postRequestFetchHandlerData, alwaysCreateSpan, spans);

      expect(newSpan!.endTimestamp).toBeDefined();
    });

    it('sets response status on finish', () => {
      const spans: Record<string, Span> = {};

      // triggered by request being sent
      fetchCallback(fetchHandlerData, alwaysCreateSpan, spans);

      const newSpan = transaction.spanRecorder?.spans[1];

      expect(newSpan).toBeDefined();

      const postRequestFetchHandlerData = {
        ...fetchHandlerData,
        endTimestamp,
        response: { status: 404 } as Response,
      };

      // triggered by response coming back
      fetchCallback(postRequestFetchHandlerData, alwaysCreateSpan, spans);

      expect(newSpan!.status).toBe(SpanStatus.fromHttpCode(404));
    });

    it('adds tracing headers to fetch requests', () => {
      // make a local copy so the global one doesn't get mutated
      const handlerData = { ...fetchHandlerData };

      fetchCallback(handlerData, alwaysCreateSpan, {});

      const headers = (handlerData.args[1].headers as Record<string, string>) || {};
      expect(headers['sentry-trace']).toBeDefined();
      expect(headers['tracestate']).toBeDefined();
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

    it('does not add tracing headers if tracing is disabled', () => {
      hasTracingEnabled.mockReturnValueOnce(false);

      xhrCallback(xhrHandlerData, alwaysCreateSpan, {});

      expect(setRequestHeader).not.toHaveBeenCalled();
    });

    it('adds tracing headers to XHR requests', () => {
      xhrCallback(xhrHandlerData, alwaysCreateSpan, {});

      expect(setRequestHeader).toHaveBeenCalledWith(
        'sentry-trace',
        expect.stringMatching(tracingUtils.SENTRY_TRACE_REGEX),
      );
      expect(setRequestHeader).toHaveBeenCalledWith('tracestate', expect.stringMatching(TRACESTATE_HEADER_REGEX));
    });

    it('creates and finishes XHR span on active transaction', () => {
      const spans = {};

      // triggered by request being sent
      xhrCallback(xhrHandlerData, alwaysCreateSpan, spans);

      const newSpan = transaction.spanRecorder?.spans[1];

      expect(newSpan).toBeInstanceOf(Span);
      expect(newSpan!.data).toEqual({
        method: 'GET',
        type: 'xhr',
        url: 'http://dogs.are.great/',
      });
      expect(newSpan!.description).toBe('GET http://dogs.are.great/');
      expect(newSpan!.op).toBe('http');
      expect(xhrHandlerData.xhr!.__sentry_xhr_span_id__).toBeDefined();
      expect(xhrHandlerData.xhr!.__sentry_xhr_span_id__).toEqual(newSpan?.spanId);

      const postRequestXHRHandlerData = {
        ...xhrHandlerData,
        endTimestamp,
      };

      // triggered by response coming back
      xhrCallback(postRequestXHRHandlerData, alwaysCreateSpan, spans);

      expect(newSpan!.endTimestamp).toBeDefined();
    });

    it('sets response status on finish', () => {
      const spans = {};

      // triggered by request being sent
      xhrCallback(xhrHandlerData, alwaysCreateSpan, spans);

      const newSpan = transaction.spanRecorder?.spans[1];

      expect(newSpan).toBeDefined();

      const postRequestXHRHandlerData = {
        ...xhrHandlerData,
        endTimestamp,
      };
      postRequestXHRHandlerData.xhr!.__sentry_xhr__!.status_code = 404;

      // triggered by response coming back
      xhrCallback(postRequestXHRHandlerData, alwaysCreateSpan, spans);

      expect(newSpan!.status).toBe(SpanStatus.fromHttpCode(404));
    });
  });
});
