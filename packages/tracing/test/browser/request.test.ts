import { BrowserClient } from '@sentry/browser';
import { Hub, makeMain } from '@sentry/hub';
import * as utils from '@sentry/utils';

import { Span, SpanStatus, Transaction } from '../../src';
import { fetchCallback, FetchData, registerRequestInstrumentation } from '../../src/browser/request';
import { addExtensionMethods } from '../../src/hubextensions';

beforeAll(() => {
  addExtensionMethods();
  // @ts-ignore need to override global Request because it's not in the jest environment (even with an
  // `@jest-environment jsdom` directive, for some reason)
  global.Request = {};
});

const addInstrumentationHandler = jest.spyOn(utils, 'addInstrumentationHandler');

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
  const alwaysCreateSpan = jest.fn().mockReturnValue(true);
  const neverCreateSpan = jest.fn().mockReturnValue(false);
  const fetchHandlerData: FetchData = {
    args: ['http://dogs.are.great/', {}],
    fetchData: { url: 'http://dogs.are.great/', method: 'GET' },
    startTimestamp: 1356996072000,
  };
  const endTimestamp = 1356996072000;

  beforeAll(() => {
    hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
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

    it('adds sentry-trace header to fetch requests', () => {
      // TODO
    });
  });
});
