import { BrowserClient } from '@sentry/browser';
import { setupBrowserTransport } from '@sentry/browser/src/transports';
import { getDefaultBrowserClientOptions } from '@sentry/browser/test/unit/helper/browser-client-options';
import { Hub, makeMain } from '@sentry/hub';
import { getGlobalObject, InstrumentHandlerCallback, InstrumentHandlerType } from '@sentry/utils';
import { JSDOM } from 'jsdom';

import {
  BrowserTracing,
  BrowserTracingOptions,
  DEFAULT_MAX_TRANSACTION_DURATION_SECONDS,
  getHeaderContext,
  getMetaContent,
} from '../../src/browser/browsertracing';
import { MetricsInstrumentation } from '../../src/browser/metrics';
import { defaultRequestInstrumentationOptions } from '../../src/browser/request';
import { instrumentRoutingWithDefaults } from '../../src/browser/router';
import * as hubExtensions from '../../src/hubextensions';
import { DEFAULT_IDLE_TIMEOUT, IdleTransaction } from '../../src/idletransaction';
import { getActiveTransaction, secToMs } from '../../src/utils';

let mockChangeHistory: ({ to, from }: { to: string; from?: string }) => void = () => undefined;

jest.mock('@sentry/utils', () => {
  const actual = jest.requireActual('@sentry/utils');
  return {
    ...actual,
    addInstrumentationHandler: (type: InstrumentHandlerType, callback: InstrumentHandlerCallback): void => {
      if (type === 'history') {
        // rather than actually add the navigation-change handler, grab a reference to it, so we can trigger it manually
        mockChangeHistory = callback;
      }
    },
  };
});

jest.mock('../../src/browser/metrics');

const { logger } = jest.requireActual('@sentry/utils');
const warnSpy = jest.spyOn(logger, 'warn');

beforeAll(() => {
  const dom = new JSDOM();
  // @ts-ignore need to override global document
  global.document = dom.window.document;
  // @ts-ignore need to override global document
  global.window = dom.window;
  // @ts-ignore need to override global document
  global.location = dom.window.location;
});

describe('BrowserTracing', () => {
  let hub: Hub;
  beforeEach(() => {
    jest.useFakeTimers();
    const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
    hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
    makeMain(hub);
    document.head.innerHTML = '';

    warnSpy.mockClear();
  });

  afterEach(() => {
    const activeTransaction = getActiveTransaction();
    if (activeTransaction) {
      // Should unset off of scope.
      activeTransaction.finish();
    }
  });

  function createBrowserTracing(setup?: boolean, _options?: Partial<BrowserTracingOptions>): BrowserTracing {
    const instance = new BrowserTracing(_options);
    if (setup) {
      const processor = () => undefined;
      instance.setupOnce(processor, () => hub);
    }

    return instance;
  }

  // These are important enough to check with a test as incorrect defaults could
  // break a lot of users' configurations.
  it('is created with default settings', () => {
    const browserTracing = createBrowserTracing();

    expect(browserTracing.options).toEqual({
      idleTimeout: DEFAULT_IDLE_TIMEOUT,
      markBackgroundTransactions: true,
      maxTransactionDuration: DEFAULT_MAX_TRANSACTION_DURATION_SECONDS,
      routingInstrumentation: instrumentRoutingWithDefaults,
      startTransactionOnLocationChange: true,
      startTransactionOnPageLoad: true,
      ...defaultRequestInstrumentationOptions,
    });
  });

  /**
   * All of these tests under `describe('route transaction')` are tested with
   * `browserTracing.options = { routingInstrumentation: customInstrumentRouting }`,
   * so that we can show this functionality works independent of the default routing integration.
   */
  describe('route transaction', () => {
    const customInstrumentRouting = (customStartTransaction: (obj: any) => void) => {
      customStartTransaction({ name: 'a/path', op: 'pageload' });
    };

    it('calls custom routing instrumenation', () => {
      createBrowserTracing(true, {
        routingInstrumentation: customInstrumentRouting,
      });

      const transaction = getActiveTransaction(hub) as IdleTransaction;
      expect(transaction).toBeDefined();
      expect(transaction.name).toBe('a/path');
      expect(transaction.op).toBe('pageload');
    });

    it('trims all transactions', () => {
      createBrowserTracing(true, {
        routingInstrumentation: customInstrumentRouting,
      });

      const transaction = getActiveTransaction(hub) as IdleTransaction;
      const span = transaction.startChild();
      span.finish();

      if (span.endTimestamp) {
        transaction.finish(span.endTimestamp + 12345);
      }
      expect(transaction.endTimestamp).toBe(span.endTimestamp);
    });

    describe('tracingOrigins', () => {
      it('warns and uses default tracing origins if none are provided', () => {
        const inst = createBrowserTracing(true, {
          routingInstrumentation: customInstrumentRouting,
        });

        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(inst.options.tracingOrigins).toEqual(defaultRequestInstrumentationOptions.tracingOrigins);
      });

      it('warns and uses default tracing origins if empty array given', () => {
        const inst = createBrowserTracing(true, {
          routingInstrumentation: customInstrumentRouting,
          tracingOrigins: [],
        });

        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(inst.options.tracingOrigins).toEqual(defaultRequestInstrumentationOptions.tracingOrigins);
      });

      it('warns and uses default tracing origins if tracing origins are not defined', () => {
        const inst = createBrowserTracing(true, {
          routingInstrumentation: customInstrumentRouting,
          tracingOrigins: undefined,
        });

        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(inst.options.tracingOrigins).toEqual(defaultRequestInstrumentationOptions.tracingOrigins);
      });

      it('sets tracing origins if provided and does not warn', () => {
        const inst = createBrowserTracing(true, {
          routingInstrumentation: customInstrumentRouting,
          tracingOrigins: ['something'],
        });

        expect(warnSpy).toHaveBeenCalledTimes(0);
        expect(inst.options.tracingOrigins).toEqual(['something']);
      });
    });

    describe('beforeNavigate', () => {
      it('is called on transaction creation', () => {
        const mockBeforeNavigation = jest.fn().mockReturnValue({ name: 'here/is/my/path' });
        createBrowserTracing(true, {
          beforeNavigate: mockBeforeNavigation,
          routingInstrumentation: customInstrumentRouting,
        });
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction).toBeDefined();

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });

      it('creates a transaction with sampled = false if beforeNavigate returns undefined', () => {
        const mockBeforeNavigation = jest.fn().mockReturnValue(undefined);
        createBrowserTracing(true, {
          beforeNavigate: mockBeforeNavigation,
          routingInstrumentation: customInstrumentRouting,
        });
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction.sampled).toBe(false);

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });

      it('can override default context values', () => {
        const mockBeforeNavigation = jest.fn(ctx => ({
          ...ctx,
          op: 'not-pageload',
        }));
        createBrowserTracing(true, {
          beforeNavigate: mockBeforeNavigation,
          routingInstrumentation: customInstrumentRouting,
        });
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction).toBeDefined();
        expect(transaction.op).toBe('not-pageload');

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });
    });

    it('sets transaction context from sentry-trace header', () => {
      const name = 'sentry-trace';
      const content = '126de09502ae4e0fb26c6967190756a4-b6e54397b12a2a0f-1';
      document.head.innerHTML = `<meta name="${name}" content="${content}">`;
      const startIdleTransaction = jest.spyOn(hubExtensions, 'startIdleTransaction');

      createBrowserTracing(true, { routingInstrumentation: customInstrumentRouting });

      expect(startIdleTransaction).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          traceId: '126de09502ae4e0fb26c6967190756a4',
          parentSpanId: 'b6e54397b12a2a0f',
          parentSampled: true,
        }),
        expect.any(Number),
        expect.any(Boolean),
        expect.any(Object),
      );
    });

    describe('idleTimeout', () => {
      it('is created by default', () => {
        createBrowserTracing(true, { routingInstrumentation: customInstrumentRouting });
        const mockFinish = jest.fn();
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        transaction.finish = mockFinish;

        const span = transaction.startChild(); // activities = 1
        span.finish(); // activities = 0

        expect(mockFinish).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT);
        expect(mockFinish).toHaveBeenCalledTimes(1);

        expect(transaction.tags).toEqual({ finishReason: 'idleTimeout', idleTimeout: undefined });
      });

      it('can be a custom value', () => {
        createBrowserTracing(true, { idleTimeout: 2000, routingInstrumentation: customInstrumentRouting });
        const mockFinish = jest.fn();
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        transaction.finish = mockFinish;

        const span = transaction.startChild(); // activities = 1
        span.finish(); // activities = 0

        expect(mockFinish).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(2000);
        expect(mockFinish).toHaveBeenCalledTimes(1);

        expect(transaction.tags).toEqual({ finishReason: 'idleTimeout', idleTimeout: 2000 });
      });
    });

    describe('maxTransactionDuration', () => {
      it('cancels a transaction if exceeded', () => {
        createBrowserTracing(true, { routingInstrumentation: customInstrumentRouting });
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        transaction.finish(transaction.startTimestamp + secToMs(DEFAULT_MAX_TRANSACTION_DURATION_SECONDS) + 1);

        expect(transaction.status).toBe('deadline_exceeded');
        expect(transaction.tags.maxTransactionDurationExceeded).toBeDefined();
      });

      it('does not cancel a transaction if not exceeded', () => {
        createBrowserTracing(true, { routingInstrumentation: customInstrumentRouting });
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        transaction.finish(transaction.startTimestamp + secToMs(DEFAULT_MAX_TRANSACTION_DURATION_SECONDS));

        expect(transaction.status).toBe(undefined);
        expect(transaction.tags.maxTransactionDurationExceeded).not.toBeDefined();
      });

      it('can have a custom value', () => {
        const customMaxTransactionDuration = 700;
        // Test to make sure default duration is less than tested custom value.
        expect(DEFAULT_MAX_TRANSACTION_DURATION_SECONDS < customMaxTransactionDuration).toBe(true);
        createBrowserTracing(true, {
          maxTransactionDuration: customMaxTransactionDuration,
          routingInstrumentation: customInstrumentRouting,
        });
        const transaction = getActiveTransaction(hub) as IdleTransaction;

        transaction.finish(transaction.startTimestamp + secToMs(customMaxTransactionDuration));

        expect(transaction.status).toBe(undefined);
        expect(transaction.tags.maxTransactionDurationExceeded).not.toBeDefined();
      });
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

      it('it is not created automatically at startup', () => {
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

  describe('sentry-trace <meta> element', () => {
    describe('getMetaContent', () => {
      it('finds the specified tag and extracts the value', () => {
        const name = 'sentry-trace';
        const content = '126de09502ae4e0fb26c6967190756a4-b6e54397b12a2a0f-1';
        document.head.innerHTML = `<meta name="${name}" content="${content}">`;

        const metaTagValue = getMetaContent(name);
        expect(metaTagValue).toBe(content);
      });

      it("doesn't return meta tags other than the one specified", () => {
        document.head.innerHTML = '<meta name="cat-cafe">';

        const metaTagValue = getMetaContent('dogpark');
        expect(metaTagValue).toBe(null);
      });

      it('can pick the correct tag out of multiple options', () => {
        const name = 'sentry-trace';
        const content = '126de09502ae4e0fb26c6967190756a4-b6e54397b12a2a0f-1';
        const sentryTraceMeta = `<meta name="${name}" content="${content}">`;
        const otherMeta = '<meta name="cat-cafe">';
        document.head.innerHTML = `${sentryTraceMeta} ${otherMeta}`;

        const metaTagValue = getMetaContent(name);
        expect(metaTagValue).toBe(content);
      });
    });

    describe('getHeaderContext', () => {
      it('correctly parses a valid sentry-trace meta header', () => {
        document.head.innerHTML =
          '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">';

        const headerContext = getHeaderContext();

        expect(headerContext).toBeDefined();
        expect(headerContext!.traceId).toEqual('12312012123120121231201212312012');
        expect(headerContext!.parentSpanId).toEqual('1121201211212012');
        expect(headerContext!.parentSampled).toEqual(false);
      });

      it('returns undefined if the header is malformed', () => {
        document.head.innerHTML = '<meta name="sentry-trace" content="12312012-112120121-0">';

        const headerContext = getHeaderContext();

        expect(headerContext).toBeUndefined();
      });

      it("returns undefined if the header isn't there", () => {
        document.head.innerHTML = '<meta name="dogs" content="12312012123120121231201212312012-1121201211212012-0">';

        const headerContext = getHeaderContext();

        expect(headerContext).toBeUndefined();
      });
    });

    describe('using the data', () => {
      it('uses the data for pageload transactions', () => {
        // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
        document.head.innerHTML =
          '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">';

        // pageload transactions are created as part of the BrowserTracing integration's initialization
        createBrowserTracing(true);
        const transaction = getActiveTransaction(hub) as IdleTransaction;

        expect(transaction).toBeDefined();
        expect(transaction.op).toBe('pageload');
        expect(transaction.traceId).toEqual('12312012123120121231201212312012');
        expect(transaction.parentSpanId).toEqual('1121201211212012');
        expect(transaction.sampled).toBe(false);
      });

      it('ignores the data for navigation transactions', () => {
        mockChangeHistory = () => undefined;
        document.head.innerHTML =
          '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">';

        createBrowserTracing(true);

        mockChangeHistory({ to: 'here', from: 'there' });
        const transaction = getActiveTransaction(hub) as IdleTransaction;

        expect(transaction).toBeDefined();
        expect(transaction.op).toBe('navigation');
        expect(transaction.traceId).not.toEqual('12312012123120121231201212312012');
        expect(transaction.parentSpanId).toBeUndefined();
      });
    });
  });

  describe('sampling', () => {
    const dogParkLocation = {
      hash: '#next-to-the-fountain',
      host: 'the.dog.park',
      hostname: 'the.dog.park',
      href: 'mutualsniffing://the.dog.park/by/the/trees/?chase=me&please=thankyou#next-to-the-fountain',
      origin: "'mutualsniffing://the.dog.park",
      pathname: '/by/the/trees/',
      port: '',
      protocol: 'mutualsniffing:',
      search: '?chase=me&please=thankyou',
    };

    it('extracts window.location/self.location for sampling context in pageload transactions', () => {
      getGlobalObject<Window>().location = dogParkLocation as any;

      const tracesSampler = jest.fn();
      const options = getDefaultBrowserClientOptions({ tracesSampler });
      hub.bindClient(new BrowserClient(options, setupBrowserTransport(options).transport));
      // setting up the BrowserTracing integration automatically starts a pageload transaction
      createBrowserTracing(true);

      expect(tracesSampler).toHaveBeenCalledWith(
        expect.objectContaining({
          location: dogParkLocation,
          transactionContext: expect.objectContaining({ op: 'pageload' }),
        }),
      );
    });

    it('extracts window.location/self.location for sampling context in navigation transactions', () => {
      getGlobalObject<Window>().location = dogParkLocation as any;

      const tracesSampler = jest.fn();
      const options = getDefaultBrowserClientOptions({ tracesSampler });
      hub.bindClient(new BrowserClient(options, setupBrowserTransport(options).transport));
      // setting up the BrowserTracing integration normally automatically starts a pageload transaction, but that's not
      // what we're testing here
      createBrowserTracing(true, { startTransactionOnPageLoad: false });

      mockChangeHistory({ to: 'here', from: 'there' });
      expect(tracesSampler).toHaveBeenCalledWith(
        expect.objectContaining({
          location: dogParkLocation,
          transactionContext: expect.objectContaining({ op: 'navigation' }),
        }),
      );
    });
  });

  describe('metrics', () => {
    beforeEach(() => {
      // @ts-ignore mock clear
      MetricsInstrumentation.mockClear();
    });

    it('creates metrics instrumentation', () => {
      createBrowserTracing(true, {});

      expect(MetricsInstrumentation).toHaveBeenCalledTimes(1);
      expect(MetricsInstrumentation).toHaveBeenLastCalledWith(undefined);
    });

    it('creates metrics instrumentation with custom options', () => {
      createBrowserTracing(true, {
        _metricOptions: {
          _reportAllChanges: true,
        },
      });

      expect(MetricsInstrumentation).toHaveBeenCalledTimes(1);
      expect(MetricsInstrumentation).toHaveBeenLastCalledWith(true);
    });
  });
});
