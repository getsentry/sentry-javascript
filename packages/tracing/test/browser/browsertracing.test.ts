import { BrowserClient, WINDOW } from '@sentry/browser';
import { Hub, makeMain } from '@sentry/core';
import type { BaseTransportOptions, ClientOptions, DsnComponents } from '@sentry/types';
import type { InstrumentHandlerCallback, InstrumentHandlerType } from '@sentry/utils';
import { JSDOM } from 'jsdom';

import type { BrowserTracingOptions } from '../../src/browser/browsertracing';
import { BrowserTracing, getMetaContent } from '../../src/browser/browsertracing';
import { defaultRequestInstrumentationOptions } from '../../src/browser/request';
import { instrumentRoutingWithDefaults } from '../../src/browser/router';
import * as hubExtensions from '../../src/hubextensions';
import type { IdleTransaction } from '../../src/idletransaction';
import { DEFAULT_FINAL_TIMEOUT, DEFAULT_HEARTBEAT_INTERVAL, DEFAULT_IDLE_TIMEOUT } from '../../src/idletransaction';
import { getActiveTransaction } from '../../src/utils';
import { getDefaultBrowserClientOptions } from '../testutils';

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

const instrumentOutgoingRequestsMock = jest.fn();
jest.mock('./../../src/browser/request', () => {
  const actual = jest.requireActual('./../../src/browser/request');
  return {
    ...actual,
    instrumentOutgoingRequests: (options: Partial<BrowserTracingOptions>) => instrumentOutgoingRequestsMock(options),
  };
});

beforeAll(() => {
  const dom = new JSDOM();
  // @ts-ignore need to override global document
  WINDOW.document = dom.window.document;
  // @ts-ignore need to override global document
  WINDOW.window = dom.window;
  // @ts-ignore need to override global document
  WINDOW.location = dom.window.location;
});

describe('BrowserTracing', () => {
  let hub: Hub;
  beforeEach(() => {
    jest.useFakeTimers();
    const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
    hub = new Hub(new BrowserClient(options));
    makeMain(hub);
    document.head.innerHTML = '';
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
      _experiments: {
        enableLongTask: true,
        enableInteractions: false,
      },
      idleTimeout: DEFAULT_IDLE_TIMEOUT,
      finalTimeout: DEFAULT_FINAL_TIMEOUT,
      heartbeatInterval: DEFAULT_HEARTBEAT_INTERVAL,
      markBackgroundTransactions: true,
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

    // TODO (v8): remove these tests
    describe('tracingOrigins', () => {
      it('sets tracing origins if provided and does not warn', () => {
        const sampleTracingOrigins = ['something'];
        const inst = createBrowserTracing(true, {
          routingInstrumentation: customInstrumentRouting,
          tracingOrigins: sampleTracingOrigins,
        });

        // eslint-disable-next-line deprecation/deprecation
        expect(inst.options.tracingOrigins).toEqual(sampleTracingOrigins);
      });

      it('sets tracing origins to an empty array and does not warn', () => {
        const sampleTracingOrigins: string[] = [];
        const inst = createBrowserTracing(true, {
          routingInstrumentation: customInstrumentRouting,
          tracingOrigins: sampleTracingOrigins,
        });

        // eslint-disable-next-line deprecation/deprecation
        expect(inst.options.tracingOrigins).toEqual(sampleTracingOrigins);
      });
    });

    describe('tracePropagationTargets', () => {
      it('sets tracePropagationTargets if provided', () => {
        const sampleTracePropagationTargets = ['something'];
        const inst = createBrowserTracing(true, {
          routingInstrumentation: customInstrumentRouting,
          tracePropagationTargets: sampleTracePropagationTargets,
        });

        expect(inst.options.tracePropagationTargets).toEqual(sampleTracePropagationTargets);
      });

      it('sets tracePropagationTargets to an empty array and does not warn', () => {
        const sampleTracePropagationTargets: string[] = [];
        const inst = createBrowserTracing(true, {
          routingInstrumentation: customInstrumentRouting,
          tracePropagationTargets: sampleTracePropagationTargets,
        });

        expect(inst.options.tracePropagationTargets).toEqual(sampleTracePropagationTargets);
      });

      it('correctly passes tracePropagationTargets to `instrumentOutgoingRequests` in `setupOnce`', () => {
        jest.clearAllMocks();
        const sampleTracePropagationTargets = ['something'];
        createBrowserTracing(true, {
          routingInstrumentation: customInstrumentRouting,
          tracePropagationTargets: sampleTracePropagationTargets,
        });

        expect(instrumentOutgoingRequestsMock).toHaveBeenCalledWith({
          traceFetch: true,
          traceXHR: true,
          tracePropagationTargets: ['something'],
        });
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

      it("sets transaction name source to `'custom'` if name is changed", () => {
        const mockBeforeNavigation = jest.fn(ctx => ({
          ...ctx,
          name: 'newName',
        }));
        createBrowserTracing(true, {
          beforeNavigate: mockBeforeNavigation,
          routingInstrumentation: customInstrumentRouting,
        });
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction).toBeDefined();
        expect(transaction.name).toBe('newName');
        expect(transaction.metadata.source).toBe('custom');

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });

      it('sets transaction name source to default `custom` if name is not changed', () => {
        const mockBeforeNavigation = jest.fn(ctx => ({
          ...ctx,
        }));
        createBrowserTracing(true, {
          beforeNavigate: mockBeforeNavigation,
          routingInstrumentation: customInstrumentRouting,
        });
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        expect(transaction).toBeDefined();
        expect(transaction.name).toBe('a/path');
        expect(transaction.metadata.source).toBe('custom');

        expect(mockBeforeNavigation).toHaveBeenCalledTimes(1);
      });
    });

    it('sets transaction context from sentry-trace header', () => {
      const name = 'sentry-trace';
      const content = '126de09502ae4e0fb26c6967190756a4-b6e54397b12a2a0f-1';
      document.head.innerHTML =
        `<meta name="${name}" content="${content}">` + '<meta name="baggage" content="sentry-release=2.1.14,foo=bar">';
      const startIdleTransaction = jest.spyOn(hubExtensions, 'startIdleTransaction');

      createBrowserTracing(true, { routingInstrumentation: customInstrumentRouting });

      expect(startIdleTransaction).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          traceId: '126de09502ae4e0fb26c6967190756a4',
          parentSpanId: 'b6e54397b12a2a0f',
          parentSampled: true,
          metadata: {
            dynamicSamplingContext: { release: '2.1.14' },
          },
        }),
        expect.any(Number),
        expect.any(Number),
        expect.any(Boolean),
        expect.any(Object),
        expect.any(Number),
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
      });
    });

    describe('heartbeatInterval', () => {
      it('can be a custom value', () => {
        const interval = 200;
        createBrowserTracing(true, { heartbeatInterval: interval, routingInstrumentation: customInstrumentRouting });
        const mockFinish = jest.fn();
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        transaction.finish = mockFinish;

        const span = transaction.startChild(); // activities = 1
        span.finish(); // activities = 0

        expect(mockFinish).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(interval * 3);
        expect(mockFinish).toHaveBeenCalledTimes(1);
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

  describe('sentry-trace and baggage <meta> elements', () => {
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

    describe('using the <meta> tag data', () => {
      beforeEach(() => {
        hub.getClient()!.getOptions = () => {
          return {
            release: '1.0.0',
            environment: 'production',
          } as ClientOptions<BaseTransportOptions>;
        };

        hub.getClient()!.getDsn = () => {
          return {
            publicKey: 'pubKey',
          } as DsnComponents;
        };
      });

      it('uses the tracing data for pageload transactions', () => {
        // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
        document.head.innerHTML =
          '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
          '<meta name="baggage" content="sentry-release=2.1.14,foo=bar">';

        // pageload transactions are created as part of the BrowserTracing integration's initialization
        createBrowserTracing(true);
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        const dynamicSamplingContext = transaction.getDynamicSamplingContext()!;

        expect(transaction).toBeDefined();
        expect(transaction.op).toBe('pageload');
        expect(transaction.traceId).toEqual('12312012123120121231201212312012');
        expect(transaction.parentSpanId).toEqual('1121201211212012');
        expect(transaction.sampled).toBe(false);
        expect(dynamicSamplingContext).toBeDefined();
        expect(dynamicSamplingContext).toStrictEqual({ release: '2.1.14' });
      });

      it('puts frozen Dynamic Sampling Context on pageload transactions if sentry-trace data and only 3rd party baggage is present', () => {
        // make sampled false here, so we can see that it's being used rather than the tracesSampleRate-dictated one
        document.head.innerHTML =
          '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
          '<meta name="baggage" content="foo=bar">';

        // pageload transactions are created as part of the BrowserTracing integration's initialization
        createBrowserTracing(true);
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        const dynamicSamplingContext = transaction.getDynamicSamplingContext()!;

        expect(transaction).toBeDefined();
        expect(transaction.op).toBe('pageload');
        expect(transaction.traceId).toEqual('12312012123120121231201212312012');
        expect(transaction.parentSpanId).toEqual('1121201211212012');
        expect(transaction.sampled).toBe(false);
        expect(dynamicSamplingContext).toStrictEqual({});
      });

      it('ignores the meta tag data for navigation transactions', () => {
        mockChangeHistory = () => undefined;
        document.head.innerHTML =
          '<meta name="sentry-trace" content="12312012123120121231201212312012-1121201211212012-0">' +
          '<meta name="baggage" content="sentry-release=2.1.14">';

        createBrowserTracing(true);

        mockChangeHistory({ to: 'here', from: 'there' });
        const transaction = getActiveTransaction(hub) as IdleTransaction;
        const dynamicSamplingContext = transaction.getDynamicSamplingContext()!;

        expect(transaction).toBeDefined();
        expect(transaction.op).toBe('navigation');
        expect(transaction.traceId).not.toEqual('12312012123120121231201212312012');
        expect(transaction.parentSpanId).toBeUndefined();
        expect(dynamicSamplingContext).toStrictEqual({
          release: '1.0.0',
          environment: 'production',
          public_key: 'pubKey',
          trace_id: expect.not.stringMatching('12312012123120121231201212312012'),
        });
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
      WINDOW.location = dogParkLocation as any;

      const tracesSampler = jest.fn();
      const options = getDefaultBrowserClientOptions({ tracesSampler });
      hub.bindClient(new BrowserClient(options));
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
      WINDOW.location = dogParkLocation as any;

      const tracesSampler = jest.fn();
      const options = getDefaultBrowserClientOptions({ tracesSampler });
      hub.bindClient(new BrowserClient(options));
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
});
