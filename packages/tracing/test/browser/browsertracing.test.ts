import { BrowserClient } from '@sentry/browser';
import { Hub } from '@sentry/hub';
// tslint:disable-next-line: no-implicit-dependencies
import { JSDOM } from 'jsdom';

import { BrowserTracing, BrowserTracingOptions, getMetaContent } from '../../src/browser/browsertracing';
import { DEFAULT_IDLE_TIMEOUT, IdleTransaction } from '../../src/idletransaction';

let mockChangeHistory: ({ to, from }: { to: string; from?: string }) => void = () => undefined;
let addInstrumentationHandlerType: string = '';

jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addInstrumentationHandler: ({ callback, type }: any): void => {
      addInstrumentationHandlerType = type;
      mockChangeHistory = callback;
    },
  };
});

beforeAll(() => {
  const dom = new JSDOM();
  // @ts-ignore
  global.document = dom.window.document;
  // @ts-ignore
  global.window = dom.window;
  // @ts-ignore
  global.location = dom.window.location;
});

describe('BrowserTracing', () => {
  let hub: Hub;
  beforeEach(() => {
    jest.useFakeTimers();
    hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
  });

  afterEach(() => {
    const transaction = getActiveTransaction(hub);
    if (transaction) {
      transaction.finishIdleTransaction();
    }
  });

  // tslint:disable-next-line: completed-docs
  function createBrowserTracing(setup?: boolean, _options?: Partial<BrowserTracingOptions>): BrowserTracing {
    const inst = new BrowserTracing(_options);
    if (setup) {
      const processor = () => undefined;
      inst.setupOnce(processor, () => hub);
    }

    return inst;
  }

  // These are important enough to check with a test as incorrect defaults could
  // break a lot of users configurations.
  it('is created with default settings', () => {
    createBrowserTracing();

    expect(BrowserTracing.options).toEqual({
      beforeNavigate: expect.any(Function),
      debug: {
        writeAsBreadcrumbs: false,
      },
      idleTimeout: DEFAULT_IDLE_TIMEOUT,
      routingInstrumentationProcessors: [],
      startTransactionOnLocationChange: true,
      startTransactionOnPageLoad: true,
    });
  });

  describe('routing instrumentation', () => {
    it('is setup with default processors', () => {
      createBrowserTracing(true);
      expect(BrowserTracing.options.routingInstrumentationProcessors).toHaveLength(1);
    });

    // We can test creating a route transaction with either navigation
    // or pageload, but for simplicities case, we check by creating a
    // pageload transaction.
    // Testing `BrowserTracing._createRouteTransaction()` functionality
    describe('route transaction', () => {
      it('calls beforeNavigate on transaction creation', () => {
        const mockBeforeNavigation = jest.fn().mockReturnValue('here/is/my/path');
        createBrowserTracing(true, { beforeNavigate: mockBeforeNavigation });
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction).toBeDefined();

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });

      it('is not created if beforeNavigate returns undefined', () => {
        const mockBeforeNavigation = jest.fn().mockReturnValue(undefined);
        createBrowserTracing(true, { beforeNavigate: mockBeforeNavigation });
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction).not.toBeDefined();

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });

      it('sets transaction context from sentry-trace header', () => {
        const name = 'sentry-trace';
        const content = '126de09502ae4e0fb26c6967190756a4-b6e54397b12a2a0f-1';
        document.head.innerHTML = `<meta name="${name}" content="${content}">`;
        createBrowserTracing(true);
        const transaction = getActiveTransaction(hub) as IdleTransaction;

        expect(transaction.traceId).toBe('126de09502ae4e0fb26c6967190756a4');
        expect(transaction.parentSpanId).toBe('b6e54397b12a2a0f');
        expect(transaction.sampled).toBe(true);
      });

      it('uses a custom routing instrumentation processor', () => {
        createBrowserTracing(true, { routingInstrumentationProcessors: [] });
        const transaction = getActiveTransaction(hub) as IdleTransaction;

        expect(transaction.traceId).toBe('126de09502ae4e0fb26c6967190756a4');
        expect(transaction.parentSpanId).toBe('b6e54397b12a2a0f');
        expect(transaction.sampled).toBe(true);
      });

      it('is created with a default idleTimeout', () => {
        createBrowserTracing(true);
        const mockFinish = jest.fn();
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        transaction.finish = mockFinish;

        const span = transaction.startChild(); // activities = 1
        span.finish(); // activities = 0

        expect(mockFinish).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT);
        expect(mockFinish).toHaveBeenCalledTimes(1);
      });

      it('can be created with a custom idleTimeout', () => {
        createBrowserTracing(true, { idleTimeout: 2000 });
        const mockFinish = jest.fn();
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        transaction.finish = mockFinish;

        const span = transaction.startChild(); // activities = 1
        span.finish(); // activities = 0

        expect(mockFinish).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(2000);
        expect(mockFinish).toHaveBeenCalledTimes(1);
      });
    });

    describe('pageload transaction', () => {
      it('is created on setup on scope', () => {
        createBrowserTracing(true);
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction).toBeDefined();

        expect(transaction.op).toBe('pageload');
      });

      it('is not created if the option is false', () => {
        createBrowserTracing(true, { startTransactionOnPageLoad: false });
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction).not.toBeDefined();
      });
    });

    // TODO: This needs integration testing
    describe('navigation transaction', () => {
      beforeEach(() => {
        mockChangeHistory = () => undefined;
        addInstrumentationHandlerType = '';
      });

      it('it is not created automatically', () => {
        createBrowserTracing(true);
        jest.runAllTimers();

        const transaction = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction).not.toBeDefined();
      });

      it('is created on location change', () => {
        createBrowserTracing(true);
        const transaction1 = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction1.op).toBe('pageload');
        expect(transaction1.endTimestamp).not.toBeDefined();

        mockChangeHistory({ to: 'here', from: 'there' });
        expect(addInstrumentationHandlerType).toBe('history');
        const transaction2 = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction2.op).toBe('navigation');

        expect(transaction1.endTimestamp).toBeDefined();
      });

      it('is not created if startTransactionOnLocationChange is false', () => {
        createBrowserTracing(true, { startTransactionOnLocationChange: false });
        const transaction1 = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction1.op).toBe('pageload');
        expect(transaction1.endTimestamp).not.toBeDefined();

        mockChangeHistory({ to: 'here', from: 'there' });
        expect(addInstrumentationHandlerType).toBe('history');
        const transaction2 = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction2.op).toBe('pageload');
      });
    });
  });
});

describe('getMeta', () => {
  it('returns a found meta tag contents', () => {
    const name = 'sentry-trace';
    const content = '126de09502ae4e0fb26c6967190756a4-b6e54397b12a2a0f-1';
    document.head.innerHTML = `<meta name="${name}" content="${content}">`;

    const meta = getMetaContent(name);
    expect(meta).toBe(content);
  });

  it('only returns meta tags queried for', () => {
    document.head.innerHTML = `<meta name="not-test">`;

    const meta = getMetaContent('test');
    expect(meta).toBe(null);
  });
});

/** Get active transaction from scope */
function getActiveTransaction(hub: Hub): IdleTransaction | undefined {
  const scope = hub.getScope();
  if (scope) {
    return scope.getTransaction() as IdleTransaction;
  }

  return undefined;
}
