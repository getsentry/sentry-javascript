import { BrowserClient } from '@sentry/browser';
import { Hub, makeMain } from '@sentry/hub';

import { Span, SpanStatus, Transaction } from '../../src';
import { _fetchCallback, FetchData, registerRequestInstrumentation } from '../../src/browser/request';
import { addExtensionMethods } from '../../src/hubextensions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      // Have to mock out Request because it is not defined in jest environment
      Request: Request;
    }
  }
}

beforeAll(() => {
  addExtensionMethods();
  // @ts-ignore need to override global Request
  global.Request = {};
});

const mockAddInstrumentationHandler = jest.fn();
let mockFetchCallback = jest.fn();
let mockXHRCallback = jest.fn();
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addInstrumentationHandler: ({ callback, type }: any) => {
      if (type === 'fetch') {
        mockFetchCallback = jest.fn(callback);
      }
      if (type === 'xhr') {
        mockXHRCallback = jest.fn(callback);
      }
      if (typeof mockAddInstrumentationHandler === 'function') {
        return mockAddInstrumentationHandler({ callback, type });
      }
    },
  };
});

describe('registerRequestInstrumentation', () => {
  beforeEach(() => {
    mockFetchCallback.mockReset();
    mockXHRCallback.mockReset();
    mockAddInstrumentationHandler.mockReset();
  });

  it('tracks fetch and xhr requests', () => {
    registerRequestInstrumentation();
    expect(mockAddInstrumentationHandler).toHaveBeenCalledTimes(2);
    // fetch
    expect(mockAddInstrumentationHandler).toHaveBeenNthCalledWith(1, { callback: expect.any(Function), type: 'fetch' });
    // xhr
    expect(mockAddInstrumentationHandler).toHaveBeenNthCalledWith(2, { callback: expect.any(Function), type: 'xhr' });
  });

  it('does not add fetch requests spans if traceFetch is false', () => {
    registerRequestInstrumentation({ traceFetch: false });
    expect(mockAddInstrumentationHandler).toHaveBeenCalledTimes(1);
    expect(mockFetchCallback()).toBe(undefined);
  });

  it('does not add xhr requests spans if traceXHR is false', () => {
    registerRequestInstrumentation({ traceXHR: false });
    expect(mockAddInstrumentationHandler).toHaveBeenCalledTimes(1);
    expect(mockXHRCallback()).toBe(undefined);
  });
});

describe('_fetchCallback()', () => {
  let hub: Hub;
  let transaction: Transaction;
  beforeAll(() => {
    hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
    makeMain(hub);
  });

  beforeEach(() => {
    transaction = hub.startTransaction({ name: 'organizations/users/:userid', op: 'pageload' }) as Transaction;
    hub.configureScope(scope => scope.setSpan(transaction));
  });

  it('does not create span if it should not be created', () => {
    const shouldCreateSpan = (url: string): boolean => url === '/organizations';
    const data: FetchData = {
      args: ['/users'],
      fetchData: {
        method: 'GET',
        url: '/users',
      },
      startTimestamp: 1595509730275,
    };
    const spans = {};

    _fetchCallback(data, shouldCreateSpan, spans);
    expect(spans).toEqual({});
  });

  it('does not create span if there is no fetch data', () => {
    const shouldCreateSpan = (_: string): boolean => true;
    const data: FetchData = {
      args: [],
      startTimestamp: 1595509730275,
    };
    const spans = {};

    _fetchCallback(data, shouldCreateSpan, spans);
    expect(spans).toEqual({});
  });

  it('creates and finishes fetch span on active transaction', () => {
    const shouldCreateSpan = (_: string): boolean => true;
    const data: FetchData = {
      args: ['/users'],
      fetchData: {
        method: 'GET',
        url: '/users',
      },
      startTimestamp: 1595509730275,
    };
    const spans: Record<string, Span> = {};

    // Start fetch request
    _fetchCallback(data, shouldCreateSpan, spans);
    const spanKey = Object.keys(spans)[0];

    const fetchSpan = spans[spanKey];
    expect(fetchSpan).toBeInstanceOf(Span);
    expect(fetchSpan.data).toEqual({
      method: 'GET',
      type: 'fetch',
      url: '/users',
    });
    expect(fetchSpan.description).toBe('GET /users');
    expect(fetchSpan.op).toBe('http');
    if (data.fetchData) {
      expect(data.fetchData.__span).toBeDefined();
    } else {
      fail('Fetch data does not exist');
    }

    const newData = {
      ...data,
      endTimestamp: data.startTimestamp + 12343234,
    };

    // End fetch request
    _fetchCallback(newData, shouldCreateSpan, spans);
    expect(spans).toEqual({});
    if (transaction.spanRecorder) {
      expect(transaction.spanRecorder.spans[1].endTimestamp).toBeDefined();
    } else {
      fail('Transaction does not have span recorder');
    }
  });

  it('sets response status on finish', () => {
    const shouldCreateSpan = (_: string): boolean => true;
    const data: FetchData = {
      args: ['/users'],
      fetchData: {
        method: 'GET',
        url: '/users',
      },
      startTimestamp: 1595509730275,
    };
    const spans: Record<string, Span> = {};

    // Start fetch request
    _fetchCallback(data, shouldCreateSpan, spans);

    const newData = {
      ...data,
      endTimestamp: data.startTimestamp + 12343234,
      response: (() => {
        const response = { status: 404 } as Response;
        return response;
      })(),
    };
    // End fetch request
    _fetchCallback(newData, shouldCreateSpan, spans);
    if (transaction.spanRecorder) {
      expect(transaction.spanRecorder.spans[1].status).toBe(SpanStatus.fromHttpCode(404));
    } else {
      fail('Transaction does not have span recorder');
    }
  });
});
