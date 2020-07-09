import { BrowserClient } from '@sentry/browser';
import { Hub, makeMain } from '@sentry/hub';
// tslint:disable-next-line: no-implicit-dependencies
import { JSDOM } from 'jsdom';

import { BrowserTracing, BrowserTracingOptions, getMetaContent } from '../../src/browser/browsertracing';
import { defaultRoutingInstrumentation } from '../../src/browser/router';
import { getActiveTransaction } from '../../src/browser/utils';
import { DEFAULT_IDLE_TIMEOUT, IdleTransaction } from '../../src/idletransaction';

let mockChangeHistory: ({ to, from }: { to: string; from?: string }) => void = () => undefined;
jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addInstrumentationHandler: ({ callback, type }: any): void => {
      if (type === 'history') {
        mockChangeHistory = callback;
      }
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
    makeMain(hub);
    document.head.innerHTML = '';
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
    const browserTracing = createBrowserTracing();

    expect(browserTracing.options).toEqual({
      beforeNavigate: expect.any(Function),
      idleTimeout: DEFAULT_IDLE_TIMEOUT,
      routingInstrumentation: defaultRoutingInstrumentation,
      startTransactionOnLocationChange: true,
      startTransactionOnPageLoad: true,
    });
  });

  describe('route transaction', () => {
    const customRoutingInstrumentation = (startTransaction: Function) => {
      startTransaction({ name: 'a/path', op: 'pageload' });
    };

    it('calls custom routing instrumenation', () => {
      createBrowserTracing(true, {
        routingInstrumentation: customRoutingInstrumentation,
      });

      const transaction = getActiveTransaction(hub) as IdleTransaction;
      expect(transaction).toBeDefined();
      expect(transaction.name).toBe('a/path');
      expect(transaction.op).toBe('pageload');
    });

    it('calls beforeNavigate on transaction creation', () => {
      const mockBeforeNavigation = jest.fn().mockReturnValue({ name: 'here/is/my/path' });
      createBrowserTracing(true, {
        beforeNavigate: mockBeforeNavigation,
        routingInstrumentation: customRoutingInstrumentation,
      });
      const transaction = getActiveTransaction(hub) as IdleTransaction;
      expect(transaction).toBeDefined();

      expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
    });

    it('is not created if beforeNavigate returns undefined', () => {
      const mockBeforeNavigation = jest.fn().mockReturnValue(undefined);
      createBrowserTracing(true, {
        beforeNavigate: mockBeforeNavigation,
        routingInstrumentation: customRoutingInstrumentation,
      });
      const transaction = getActiveTransaction(hub) as IdleTransaction;
      expect(transaction).not.toBeDefined();

      expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
    });

    it('can use a custom beforeNavigate', () => {
      const mockBeforeNavigation = jest.fn(ctx => ({
        ...ctx,
        op: 'something-else',
      }));
      createBrowserTracing(true, {
        beforeNavigate: mockBeforeNavigation,
        routingInstrumentation: customRoutingInstrumentation,
      });
      const transaction = getActiveTransaction(hub) as IdleTransaction;
      expect(transaction).toBeDefined();
      expect(transaction.op).toBe('something-else');

      expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
    });

    it('sets transaction context from sentry-trace header', () => {
      const name = 'sentry-trace';
      const content = '126de09502ae4e0fb26c6967190756a4-b6e54397b12a2a0f-1';
      document.head.innerHTML = `<meta name="${name}" content="${content}">`;
      createBrowserTracing(true, { routingInstrumentation: customRoutingInstrumentation });
      const transaction = getActiveTransaction(hub) as IdleTransaction;

      expect(transaction.traceId).toBe('126de09502ae4e0fb26c6967190756a4');
      expect(transaction.parentSpanId).toBe('b6e54397b12a2a0f');
      expect(transaction.sampled).toBe(true);
    });

    it('is created with a default idleTimeout', () => {
      createBrowserTracing(true, { routingInstrumentation: customRoutingInstrumentation });
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
      createBrowserTracing(true, { idleTimeout: 2000, routingInstrumentation: customRoutingInstrumentation });
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

  // Integration tests for the default routing instrumentation
  describe('default routing instrumentation', () => {
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

    describe('navigation transaction', () => {
      beforeEach(() => {
        mockChangeHistory = () => undefined;
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
