import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  Scope,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getMainCarrier,
  setAsyncContextStrategy,
  setCurrentClient,
  spanToJSON,
  withScope,
} from '../../../src';
import { getAsyncContextStrategy } from '../../../src/asyncContext';
import {
  SentrySpan,
  continueTrace,
  getDynamicSamplingContextFromSpan,
  registerSpanErrorInstrumentation,
  startInactiveSpan,
  startSpan,
  startSpanManual,
  suppressTracing,
  withActiveSpan,
} from '../../../src/tracing';
import { SentryNonRecordingSpan } from '../../../src/tracing/sentryNonRecordingSpan';
import { startNewTrace } from '../../../src/tracing/trace';
import type { Event, Span, StartSpanOptions } from '../../../src/types-hoist';
import { _setSpanForScope } from '../../../src/utils/spanOnScope';
import { getActiveSpan, getRootSpan, getSpanDescendants, spanIsSampled } from '../../../src/utils/spanUtils';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

const enum Type {
  Sync = 'sync',
  Async = 'async',
}

let client: TestClient;

describe('startSpan', () => {
  beforeEach(() => {
    registerSpanErrorInstrumentation();

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    setAsyncContextStrategy(undefined);

    const options = getDefaultTestClientOptions({ tracesSampleRate: 1 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe.each([
    // isSync, isError, callback, expectedReturnValue
    [Type.Async, false, () => Promise.resolve('async good'), 'async good'],
    [Type.Sync, false, () => 'sync good', 'sync good'],
    [Type.Async, true, () => Promise.reject('async bad'), 'async bad'],
    [
      Type.Sync,
      true,
      () => {
        throw 'sync bad';
      },
      'sync bad',
    ],
  ])('with %s callback and error %s', (_type, isError, callback, expected) => {
    it('should return the same value as the callback', async () => {
      try {
        const result = await startSpan({ name: 'GET users/[id]' }, () => {
          return callback();
        });
        expect(result).toEqual(expected);
      } catch (e) {
        expect(e).toEqual(expected);
      }
    });

    it('creates a transaction', async () => {
      let _span: Span | undefined = undefined;
      client.on('spanEnd', span => {
        _span = span;
      });
      try {
        await startSpan({ name: 'GET users/[id]' }, () => {
          return callback();
        });
      } catch (e) {
        //
      }
      expect(_span).toBeDefined();

      expect(spanToJSON(_span!).description).toEqual('GET users/[id]');
      expect(spanToJSON(_span!).status).toEqual(isError ? 'internal_error' : undefined);
    });

    it('allows for transaction to be mutated', async () => {
      let _span: Span | undefined = undefined;
      client.on('spanEnd', span => {
        _span = span;
      });
      try {
        await startSpan({ name: 'GET users/[id]' }, span => {
          span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'http.server');
          return callback();
        });
      } catch (e) {
        //
      }

      expect(spanToJSON(_span!).op).toEqual('http.server');
    });

    it('creates a span with correct description', async () => {
      let _span: Span | undefined = undefined;
      client.on('spanEnd', span => {
        if (span === getRootSpan(span)) {
          _span = span;
        }
      });
      try {
        await startSpan({ name: 'GET users/[id]' }, () => {
          return startSpan({ name: 'SELECT * from users' }, () => {
            return callback();
          });
        });
      } catch (e) {
        //
      }

      expect(_span).toBeDefined();
      const spans = getSpanDescendants(_span!);

      expect(spans).toHaveLength(2);
      expect(spanToJSON(spans[1]!).description).toEqual('SELECT * from users');
      expect(spanToJSON(spans[1]!).parent_span_id).toEqual(_span!.spanContext().spanId);
      expect(spanToJSON(spans[1]!).status).toEqual(isError ? 'internal_error' : undefined);
    });

    it('allows for span to be mutated', async () => {
      let _span: Span | undefined = undefined;
      client.on('spanEnd', span => {
        if (span === getRootSpan(span)) {
          _span = span;
        }
      });
      try {
        await startSpan({ name: 'GET users/[id]' }, () => {
          return startSpan({ name: 'SELECT * from users' }, childSpan => {
            childSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'db.query');
            return callback();
          });
        });
      } catch (e) {
        //
      }

      expect(_span).toBeDefined();
      const spans = getSpanDescendants(_span!);

      expect(spans).toHaveLength(2);
      expect(spanToJSON(spans[1]!).op).toEqual('db.query');
    });

    it('correctly sets the span origin', async () => {
      let _span: Span | undefined = undefined;
      client.on('spanEnd', span => {
        _span = span;
      });
      try {
        await startSpan(
          {
            name: 'GET users/[id]',
            attributes: { [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser' },
          },
          () => {
            return callback();
          },
        );
      } catch (e) {
        //
      }

      expect(_span).toBeDefined();
      const jsonSpan = spanToJSON(_span!);
      expect(jsonSpan).toEqual({
        data: {
          'sentry.origin': 'auto.http.browser',
          'sentry.sample_rate': 1,
          'sentry.source': 'custom',
        },
        origin: 'auto.http.browser',
        description: 'GET users/[id]',
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        status: isError ? 'internal_error' : undefined,
        timestamp: expect.any(Number),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      });
    });
  });

  it('returns a non recording span if tracing is disabled', () => {
    const options = getDefaultTestClientOptions({});
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const span = startSpan({ name: 'GET users/[id]' }, span => {
      return span;
    });

    expect(span).toBeDefined();
    expect(span).toBeInstanceOf(SentryNonRecordingSpan);
    expect(getDynamicSamplingContextFromSpan(span)).toEqual({
      environment: 'production',
      sample_rate: '0',
      sampled: 'false',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      transaction: 'GET users/[id]',
    });
  });

  it('creates & finishes span', async () => {
    const span = startSpan({ name: 'GET users/[id]' }, span => {
      expect(span).toBeDefined();
      expect(span).toBeInstanceOf(SentrySpan);
      expect(spanToJSON(span).timestamp).toBeUndefined();
      return span;
    });

    expect(span).toBeDefined();
    expect(spanToJSON(span).timestamp).toBeDefined();
  });

  it('allows to pass a `startTime`', () => {
    const start = startSpan({ name: 'outer', startTime: [1234, 0] }, span => {
      return spanToJSON(span).start_timestamp;
    });

    expect(start).toEqual(1234);
  });

  it('forks the scope', () => {
    const initialScope = getCurrentScope();

    startSpan({ name: 'GET users/[id]' }, span => {
      expect(getCurrentScope()).not.toBe(initialScope);
      expect(getActiveSpan()).toBe(span);
    });

    expect(getCurrentScope()).toBe(initialScope);
    expect(getActiveSpan()).toBe(undefined);
  });

  it('starts the span on the fork of a passed custom scope', () => {
    const initialScope = getCurrentScope();

    const customScope = initialScope.clone();
    customScope.setTag('dogs', 'great');

    const parentSpan = new SentrySpan({ spanId: 'parent-span-id', sampled: true });
    _setSpanForScope(customScope, parentSpan);

    startSpan({ name: 'GET users/[id]', scope: customScope }, span => {
      // current scope is forked from the customScope
      expect(getCurrentScope()).not.toBe(initialScope);
      expect(getCurrentScope()).not.toBe(customScope);
      expect(getCurrentScope().getScopeData().tags).toEqual({ dogs: 'great' });

      // active span is set correctly
      expect(getActiveSpan()).toBe(span);

      // span has the correct parent span
      expect(spanToJSON(span).parent_span_id).toBe('parent-span-id');

      // scope data modifications
      getCurrentScope().setTag('cats', 'great');
      customScope.setTag('bears', 'great');

      expect(getCurrentScope().getScopeData().tags).toEqual({ dogs: 'great', cats: 'great' });
      expect(customScope.getScopeData().tags).toEqual({ dogs: 'great', bears: 'great' });
    });

    // customScope modifications are persisted
    expect(customScope.getScopeData().tags).toEqual({ dogs: 'great', bears: 'great' });

    // span is parent span again on customScope
    withScope(customScope, () => {
      expect(getActiveSpan()).toBe(parentSpan);
    });

    // but activeSpan and currentScope are reset, since customScope was never active
    expect(getCurrentScope()).toBe(initialScope);
    expect(getActiveSpan()).toBe(undefined);
  });

  describe('handles multiple spans in sequence with a custom scope', () => {
    it('with parent span', () => {
      const initialScope = getCurrentScope();

      const customScope = initialScope.clone();
      const parentSpan = new SentrySpan({ spanId: 'parent-span-id', sampled: true });
      _setSpanForScope(customScope, parentSpan);

      startSpan({ name: 'span 1', scope: customScope }, span1 => {
        // current scope is forked from the customScope
        expect(getCurrentScope()).not.toBe(initialScope);
        expect(getCurrentScope()).not.toBe(customScope);

        expect(getActiveSpan()).toBe(span1);
        expect(spanToJSON(span1).parent_span_id).toBe('parent-span-id');
      });

      // active span on customScope is reset
      withScope(customScope, () => {
        expect(getActiveSpan()).toBe(parentSpan);
      });

      startSpan({ name: 'span 2', scope: customScope }, span2 => {
        // current scope is forked from the customScope
        expect(getCurrentScope()).not.toBe(initialScope);
        expect(getCurrentScope()).not.toBe(customScope);

        expect(getActiveSpan()).toBe(span2);
        // both, span1 and span2 are children of the parent span
        expect(spanToJSON(span2).parent_span_id).toBe('parent-span-id');
      });

      withScope(customScope, () => {
        expect(getActiveSpan()).toBe(parentSpan);
      });

      expect(getCurrentScope()).toBe(initialScope);
      expect(getActiveSpan()).toBe(undefined);
    });

    it('without parent span', () => {
      const initialScope = getCurrentScope();
      const customScope = initialScope.clone();

      const traceId = customScope.getPropagationContext()?.traceId;

      startSpan({ name: 'span 1', scope: customScope }, span1 => {
        expect(getCurrentScope()).not.toBe(initialScope);
        expect(getCurrentScope()).not.toBe(customScope);

        expect(getActiveSpan()).toBe(span1);
        expect(getRootSpan(getActiveSpan()!)).toBe(span1);

        expect(span1.spanContext().traceId).toBe(traceId);
      });

      withScope(customScope, () => {
        expect(getActiveSpan()).toBe(undefined);
      });

      startSpan({ name: 'span 2', scope: customScope }, span2 => {
        expect(getCurrentScope()).not.toBe(initialScope);
        expect(getCurrentScope()).not.toBe(customScope);

        expect(getActiveSpan()).toBe(span2);
        expect(getRootSpan(getActiveSpan()!)).toBe(span2);

        expect(span2.spanContext().traceId).toBe(traceId);
      });

      withScope(customScope, () => {
        expect(getActiveSpan()).toBe(undefined);
      });

      expect(getCurrentScope()).toBe(initialScope);
      expect(getActiveSpan()).toBe(undefined);
    });
  });

  it('allows to pass a parentSpan', () => {
    const parentSpan = new SentrySpan({ spanId: 'parent-span-id', sampled: true, name: 'parent-span' });

    startSpan({ name: 'GET users/[id]', parentSpan }, span => {
      expect(getActiveSpan()).toBe(span);
      expect(spanToJSON(span).parent_span_id).toBe('parent-span-id');
    });

    expect(getActiveSpan()).toBe(undefined);
  });

  it('allows to pass parentSpan=null', () => {
    startSpan({ name: 'GET users/[id]' }, () => {
      startSpan({ name: 'GET users/[id]', parentSpan: null }, span => {
        expect(spanToJSON(span).parent_span_id).toBe(undefined);
      });
    });
  });

  it('allows to force a transaction with forceTransaction=true', async () => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const transactionEvents: Event[] = [];

    client.addEventProcessor(event => {
      if (event.type === 'transaction') {
        transactionEvents.push(event);
      }
      return event;
    });

    startSpan({ name: 'outer transaction' }, () => {
      startSpan({ name: 'inner span' }, () => {
        startSpan({ name: 'inner transaction', forceTransaction: true }, () => {
          startSpan({ name: 'inner span 2' }, () => {
            // all good
          });
        });
      });
    });

    await client.flush();

    const normalizedTransactionEvents = transactionEvents.map(event => {
      return {
        ...event,
        spans: event.spans?.map(span => ({ name: span.description, id: span.span_id })),
        sdkProcessingMetadata: {
          dynamicSamplingContext: event.sdkProcessingMetadata?.dynamicSamplingContext,
        },
      };
    });

    expect(normalizedTransactionEvents).toHaveLength(2);

    const outerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'outer transaction');
    const innerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'inner transaction');

    const outerTraceId = outerTransaction?.contexts?.trace?.trace_id;
    // The inner transaction should be a child of the last span of the outer transaction
    const innerParentSpanId = outerTransaction?.spans?.[0]?.id;
    const innerSpanId = innerTransaction?.contexts?.trace?.span_id;

    expect(outerTraceId).toBeDefined();
    expect(innerParentSpanId).toBeDefined();
    expect(innerSpanId).toBeDefined();
    // inner span ID should _not_ be the parent span ID, but the id of the new span
    expect(innerSpanId).not.toEqual(innerParentSpanId);

    expect(outerTransaction?.contexts).toEqual({
      trace: {
        data: {
          'sentry.source': 'custom',
          'sentry.sample_rate': 1,
          'sentry.origin': 'manual',
        },
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        origin: 'manual',
      },
    });
    expect(outerTransaction?.spans).toEqual([{ name: 'inner span', id: expect.any(String) }]);
    expect(outerTransaction?.transaction).toEqual('outer transaction');
    expect(outerTransaction?.sdkProcessingMetadata).toEqual({
      dynamicSamplingContext: {
        environment: 'production',
        trace_id: outerTraceId,
        sample_rate: '1',
        transaction: 'outer transaction',
        sampled: 'true',
        sample_rand: expect.any(String),
      },
    });

    expect(innerTransaction?.contexts).toEqual({
      trace: {
        data: {
          'sentry.source': 'custom',
          'sentry.origin': 'manual',
        },
        parent_span_id: innerParentSpanId,
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: outerTraceId,
        origin: 'manual',
      },
    });
    expect(innerTransaction?.spans).toEqual([{ name: 'inner span 2', id: expect.any(String) }]);
    expect(innerTransaction?.transaction).toEqual('inner transaction');
    expect(innerTransaction?.sdkProcessingMetadata).toEqual({
      dynamicSamplingContext: {
        environment: 'production',
        trace_id: outerTraceId,
        sample_rate: '1',
        transaction: 'outer transaction',
        sampled: 'true',
        sample_rand: expect.any(String),
      },
    });
  });

  it("picks up the trace id off the parent scope's propagation context", () => {
    expect.assertions(1);
    withScope(scope => {
      scope.setPropagationContext({
        traceId: '99999999999999999999999999999999',
        sampleRand: Math.random(),
        dsc: {},
        parentSpanId: '4242424242424242',
      });

      startSpan({ name: 'span' }, span => {
        expect(span.spanContext().traceId).toBe('99999999999999999999999999999999');
      });
    });
  });

  describe('onlyIfParent', () => {
    it('starts a non recording span if there is no parent', () => {
      const span = startSpan({ name: 'test span', onlyIfParent: true }, span => {
        return span;
      });

      expect(span).toBeDefined();
      expect(span).toBeInstanceOf(SentryNonRecordingSpan);
    });

    it('creates a span if there is a parent', () => {
      const span = startSpan({ name: 'parent span' }, () => {
        const span = startSpan({ name: 'test span', onlyIfParent: true }, span => {
          return span;
        });

        return span;
      });

      expect(span).toBeDefined();
      expect(span).toBeInstanceOf(SentrySpan);
    });
  });

  describe('parentSpanIsAlwaysRootSpan', () => {
    it('creates a span as child of root span if parentSpanIsAlwaysRootSpan=true', () => {
      const options = getDefaultTestClientOptions({
        tracesSampleRate: 1,
        parentSpanIsAlwaysRootSpan: true,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      startSpan({ name: 'parent span' }, span => {
        expect(spanToJSON(span).parent_span_id).toBe(undefined);
        startSpan({ name: 'child span' }, childSpan => {
          expect(spanToJSON(childSpan).parent_span_id).toBe(span.spanContext().spanId);
          startSpan({ name: 'grand child span' }, grandChildSpan => {
            expect(spanToJSON(grandChildSpan).parent_span_id).toBe(span.spanContext().spanId);
          });
        });
      });
    });

    it('does not creates a span as child of root span if parentSpanIsAlwaysRootSpan=false', () => {
      const options = getDefaultTestClientOptions({
        tracesSampleRate: 1,
        parentSpanIsAlwaysRootSpan: false,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      startSpan({ name: 'parent span' }, span => {
        expect(spanToJSON(span).parent_span_id).toBe(undefined);
        startSpan({ name: 'child span' }, childSpan => {
          expect(spanToJSON(childSpan).parent_span_id).toBe(span.spanContext().spanId);
          startSpan({ name: 'grand child span' }, grandChildSpan => {
            expect(spanToJSON(grandChildSpan).parent_span_id).toBe(childSpan.spanContext().spanId);
          });
        });
      });
    });
  });

  it('samples with a tracesSampler', () => {
    const tracesSampler = jest.fn(() => {
      return true;
    });

    const options = getDefaultTestClientOptions({ tracesSampler });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    startSpan({ name: 'outer', attributes: { test1: 'aa', test2: 'aa', test3: 'bb' } }, outerSpan => {
      expect(outerSpan).toBeDefined();
    });

    expect(tracesSampler).toBeCalledTimes(1);
    expect(tracesSampler).toHaveBeenLastCalledWith({
      parentSampled: undefined,
      name: 'outer',
      attributes: {
        test1: 'aa',
        test2: 'aa',
        test3: 'bb',
      },
      inheritOrSampleWith: expect.any(Function),
    });
  });

  it('includes the scope at the time the span was started when finished', async () => {
    const beforeSendTransaction = jest.fn(event => event);

    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        tracesSampleRate: 1,
        beforeSendTransaction,
      }),
    );
    setCurrentClient(client);
    client.init();

    withScope(scope1 => {
      scope1.setTag('scope', 1);
      startSpanManual({ name: 'my-span' }, span => {
        withScope(scope2 => {
          scope2.setTag('scope', 2);
          span.end();
        });
      });
    });

    await client.flush();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(beforeSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.objectContaining({
          scope: 1,
        }),
      }),
      expect.anything(),
    );
  });

  it('sets a child span reference on the parent span', () => {
    expect.assertions(1);
    startSpan({ name: 'outer' }, (outerSpan: any) => {
      startSpan({ name: 'inner' }, innerSpan => {
        const childSpans = Array.from(outerSpan._sentryChildSpans);
        expect(childSpans).toContain(innerSpan);
      });
    });
  });

  it('uses implementation from ACS, if it exists', () => {
    const staticSpan = new SentrySpan({ spanId: 'aha', sampled: true });

    const carrier = getMainCarrier();

    const customFn = jest.fn((_options: StartSpanOptions, callback: (span: Span) => string) => {
      callback(staticSpan);
      return 'aha';
    }) as typeof startSpan;

    const acs = {
      ...getAsyncContextStrategy(carrier),
      startSpan: customFn,
    };
    setAsyncContextStrategy(acs);

    const result = startSpan({ name: 'GET users/[id]' }, span => {
      expect(span).toEqual(staticSpan);
      return 'oho?';
    });

    expect(result).toBe('aha');
  });

  describe('[experimental] standalone spans', () => {
    it('starts a standalone segment span if standalone is set', () => {
      const span = startSpan(
        {
          name: 'test span',
          experimental: { standalone: true },
        },
        span => {
          return span;
        },
      );

      const spanJson = spanToJSON(span);
      expect(spanJson.is_segment).toBe(true);
      expect(spanJson.segment_id).toBe(spanJson.span_id);
      expect(spanJson.segment_id).toMatch(/^[a-f0-9]{16}$/);
    });

    it.each([undefined, false])("doesn't set segment properties if standalone is falsy (%s)", standalone => {
      const span = startSpan(
        {
          name: 'test span',
          experimental: { standalone },
        },
        span => {
          return span;
        },
      );

      const spanJson = spanToJSON(span);
      expect(spanJson.is_segment).toBeUndefined();
      expect(spanJson.segment_id).toBeUndefined();
    });
  });
});

describe('startSpanManual', () => {
  beforeEach(() => {
    registerSpanErrorInstrumentation();

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    setAsyncContextStrategy(undefined);

    const options = getDefaultTestClientOptions({ tracesSampleRate: 1 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  it('returns a non recording span if tracing is disabled', () => {
    const options = getDefaultTestClientOptions({});
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const span = startSpanManual({ name: 'GET users/[id]' }, span => {
      return span;
    });

    expect(span).toBeDefined();
    expect(span).toBeInstanceOf(SentryNonRecordingSpan);
    expect(getDynamicSamplingContextFromSpan(span)).toEqual({
      environment: 'production',
      sample_rate: '0',
      sampled: 'false',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      transaction: 'GET users/[id]',
    });
  });

  it('creates & finishes span', async () => {
    startSpanManual({ name: 'GET users/[id]' }, (span, finish) => {
      expect(span).toBeDefined();
      expect(span).toBeInstanceOf(SentrySpan);
      expect(spanToJSON(span).timestamp).toBeUndefined();
      finish();
      expect(spanToJSON(span).timestamp).toBeDefined();
    });
  });

  it('forks the scope automatically', () => {
    const initialScope = getCurrentScope();

    startSpanManual({ name: 'GET users/[id]' }, (span, finish) => {
      expect(getCurrentScope()).not.toBe(initialScope);
      expect(getActiveSpan()).toBe(span);

      finish();

      // Is still the active span
      expect(getActiveSpan()).toBe(span);
    });

    expect(getCurrentScope()).toBe(initialScope);
    expect(getActiveSpan()).toBe(undefined);
  });

  describe('starts a span on the fork of a custom scope if passed', () => {
    it('with parent span', () => {
      const initialScope = getCurrentScope();

      const customScope = initialScope.clone();
      customScope.setTag('dogs', 'great');

      const parentSpan = new SentrySpan({ spanId: 'parent-span-id', sampled: true });
      _setSpanForScope(customScope, parentSpan);

      startSpanManual({ name: 'GET users/[id]', scope: customScope }, span => {
        // current scope is forked from the customScope
        expect(getCurrentScope()).not.toBe(initialScope);
        expect(getCurrentScope()).not.toBe(customScope);
        expect(spanToJSON(span).parent_span_id).toBe('parent-span-id');

        // span is active span
        expect(getActiveSpan()).toBe(span);

        span.end();

        // span is still the active span (weird but it is what it is)
        expect(getActiveSpan()).toBe(span);

        getCurrentScope().setTag('cats', 'great');
        customScope.setTag('bears', 'great');

        expect(getCurrentScope().getScopeData().tags).toEqual({ dogs: 'great', cats: 'great' });
        expect(customScope.getScopeData().tags).toEqual({ dogs: 'great', bears: 'great' });
      });

      expect(getCurrentScope()).toBe(initialScope);
      expect(getActiveSpan()).toBe(undefined);

      startSpanManual({ name: 'POST users/[id]', scope: customScope }, (span, finish) => {
        // current scope is forked from the customScope
        expect(getCurrentScope()).not.toBe(initialScope);
        expect(getCurrentScope()).not.toBe(customScope);
        expect(spanToJSON(span).parent_span_id).toBe('parent-span-id');

        // scope data modification from customScope in previous callback is persisted
        expect(getCurrentScope().getScopeData().tags).toEqual({ dogs: 'great', bears: 'great' });

        // span is active span
        expect(getActiveSpan()).toBe(span);

        // calling finish() or span.end() has the same effect
        finish();

        // using finish() resets the scope correctly
        expect(getActiveSpan()).toBe(span);
      });

      expect(getCurrentScope()).toBe(initialScope);
      expect(getActiveSpan()).toBe(undefined);
    });

    it('without parent span', () => {
      const initialScope = getCurrentScope();
      const manualScope = initialScope.clone();

      startSpanManual({ name: 'GET users/[id]', scope: manualScope }, span => {
        // current scope is forked from the customScope
        expect(getCurrentScope()).not.toBe(initialScope);
        expect(getCurrentScope()).not.toBe(manualScope);
        expect(getCurrentScope()).toEqual(manualScope);

        // span is active span and a root span
        expect(getActiveSpan()).toBe(span);
        expect(getRootSpan(span)).toBe(span);

        span.end();

        expect(getActiveSpan()).toBe(span);
      });

      startSpanManual({ name: 'POST users/[id]', scope: manualScope }, (span, finish) => {
        expect(getCurrentScope()).not.toBe(initialScope);
        expect(getCurrentScope()).not.toBe(manualScope);
        expect(getCurrentScope()).toEqual(manualScope);

        // second span is active span and its own root span
        expect(getActiveSpan()).toBe(span);
        expect(getRootSpan(span)).toBe(span);

        finish();

        // calling finish() or span.end() has the same effect
        expect(getActiveSpan()).toBe(span);
      });

      expect(getCurrentScope()).toBe(initialScope);
      expect(getActiveSpan()).toBe(undefined);
    });
  });

  it('allows to pass a parentSpan', () => {
    const parentSpan = new SentrySpan({ spanId: 'parent-span-id', sampled: true, name: 'parent-span' });

    startSpanManual({ name: 'GET users/[id]', parentSpan }, span => {
      expect(getActiveSpan()).toBe(span);
      expect(spanToJSON(span).parent_span_id).toBe('parent-span-id');

      span.end();
    });

    expect(getActiveSpan()).toBe(undefined);
  });

  it('allows to pass parentSpan=null', () => {
    startSpan({ name: 'GET users/[id]' }, () => {
      startSpanManual({ name: 'child', parentSpan: null }, span => {
        expect(spanToJSON(span).parent_span_id).toBe(undefined);
        span.end();
      });
    });
  });

  it('allows to force a transaction with forceTransaction=true', async () => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const transactionEvents: Event[] = [];

    client.addEventProcessor(event => {
      if (event.type === 'transaction') {
        transactionEvents.push(event);
      }
      return event;
    });

    startSpanManual({ name: 'outer transaction' }, span => {
      startSpanManual({ name: 'inner span' }, span => {
        startSpanManual({ name: 'inner transaction', forceTransaction: true }, span => {
          startSpanManual({ name: 'inner span 2' }, span => {
            // all good
            span.end();
          });
          span.end();
        });
        span.end();
      });
      span.end();
    });

    await client.flush();

    const normalizedTransactionEvents = transactionEvents.map(event => {
      return {
        ...event,
        spans: event.spans?.map(span => ({ name: span.description, id: span.span_id })),
        sdkProcessingMetadata: {
          dynamicSamplingContext: event.sdkProcessingMetadata?.dynamicSamplingContext,
        },
      };
    });

    expect(normalizedTransactionEvents).toHaveLength(2);

    const outerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'outer transaction');
    const innerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'inner transaction');

    const outerTraceId = outerTransaction?.contexts?.trace?.trace_id;
    // The inner transaction should be a child of the last span of the outer transaction
    const innerParentSpanId = outerTransaction?.spans?.[0]?.id;
    const innerSpanId = innerTransaction?.contexts?.trace?.span_id;

    expect(outerTraceId).toBeDefined();
    expect(innerParentSpanId).toBeDefined();
    expect(innerSpanId).toBeDefined();
    // inner span ID should _not_ be the parent span ID, but the id of the new span
    expect(innerSpanId).not.toEqual(innerParentSpanId);

    expect(outerTransaction?.contexts).toEqual({
      trace: {
        data: {
          'sentry.source': 'custom',
          'sentry.sample_rate': 1,
          'sentry.origin': 'manual',
        },
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        origin: 'manual',
      },
    });
    expect(outerTransaction?.spans).toEqual([{ name: 'inner span', id: expect.any(String) }]);
    expect(outerTransaction?.transaction).toEqual('outer transaction');
    expect(outerTransaction?.sdkProcessingMetadata).toEqual({
      dynamicSamplingContext: {
        environment: 'production',
        trace_id: outerTraceId,
        sample_rate: '1',
        transaction: 'outer transaction',
        sampled: 'true',
        sample_rand: expect.any(String),
      },
    });

    expect(innerTransaction?.contexts).toEqual({
      trace: {
        data: {
          'sentry.source': 'custom',
          'sentry.origin': 'manual',
        },
        parent_span_id: innerParentSpanId,
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: outerTraceId,
        origin: 'manual',
      },
    });
    expect(innerTransaction?.spans).toEqual([{ name: 'inner span 2', id: expect.any(String) }]);
    expect(innerTransaction?.transaction).toEqual('inner transaction');
    expect(innerTransaction?.sdkProcessingMetadata).toEqual({
      dynamicSamplingContext: {
        environment: 'production',
        trace_id: outerTraceId,
        sample_rate: '1',
        transaction: 'outer transaction',
        sampled: 'true',
        sample_rand: expect.any(String),
      },
    });
  });

  it('allows to pass a `startTime`', () => {
    const start = startSpanManual({ name: 'outer', startTime: [1234, 0] }, span => {
      span.end();
      return spanToJSON(span).start_timestamp;
    });

    expect(start).toEqual(1234);
  });

  it("picks up the trace id off the parent scope's propagation context", () => {
    expect.assertions(1);
    withScope(scope => {
      scope.setPropagationContext({
        traceId: '99999999999999999999999999999991',
        sampleRand: Math.random(),
        dsc: {},
        parentSpanId: '4242424242424242',
      });

      startSpanManual({ name: 'span' }, span => {
        expect(span.spanContext().traceId).toBe('99999999999999999999999999999991');
        span.end();
      });
    });
  });

  describe('onlyIfParent', () => {
    it('does not create a span if there is no parent', () => {
      const span = startSpanManual({ name: 'test span', onlyIfParent: true }, span => {
        return span;
      });
      expect(span).toBeDefined();
      expect(span).toBeInstanceOf(SentryNonRecordingSpan);
    });

    it('creates a span if there is a parent', () => {
      const span = startSpan({ name: 'parent span' }, () => {
        const span = startSpanManual({ name: 'test span', onlyIfParent: true }, span => {
          return span;
        });

        return span;
      });

      expect(span).toBeDefined();
      expect(span).toBeInstanceOf(SentrySpan);
    });
  });

  describe('parentSpanIsAlwaysRootSpan', () => {
    it('creates a span as child of root span if parentSpanIsAlwaysRootSpan=true', () => {
      const options = getDefaultTestClientOptions({
        tracesSampleRate: 1,
        parentSpanIsAlwaysRootSpan: true,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      startSpanManual({ name: 'parent span' }, span => {
        expect(spanToJSON(span).parent_span_id).toBe(undefined);
        startSpanManual({ name: 'child span' }, childSpan => {
          expect(spanToJSON(childSpan).parent_span_id).toBe(span.spanContext().spanId);
          startSpanManual({ name: 'grand child span' }, grandChildSpan => {
            expect(spanToJSON(grandChildSpan).parent_span_id).toBe(span.spanContext().spanId);
            grandChildSpan.end();
          });
          childSpan.end();
        });
        span.end();
      });
    });

    it('does not creates a span as child of root span if parentSpanIsAlwaysRootSpan=false', () => {
      const options = getDefaultTestClientOptions({
        tracesSampleRate: 1,
        parentSpanIsAlwaysRootSpan: false,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      startSpanManual({ name: 'parent span' }, span => {
        expect(spanToJSON(span).parent_span_id).toBe(undefined);
        startSpanManual({ name: 'child span' }, childSpan => {
          expect(spanToJSON(childSpan).parent_span_id).toBe(span.spanContext().spanId);
          startSpanManual({ name: 'grand child span' }, grandChildSpan => {
            expect(spanToJSON(grandChildSpan).parent_span_id).toBe(childSpan.spanContext().spanId);
            grandChildSpan.end();
          });
          childSpan.end();
        });
        span.end();
      });
    });
  });

  it('sets a child span reference on the parent span', () => {
    expect.assertions(1);
    startSpan({ name: 'outer' }, (outerSpan: any) => {
      startSpanManual({ name: 'inner' }, innerSpan => {
        const childSpans = Array.from(outerSpan._sentryChildSpans);
        expect(childSpans).toContain(innerSpan);
      });
    });
  });

  it('uses implementation from ACS, if it exists', () => {
    const staticSpan = new SentrySpan({ spanId: 'aha', sampled: true });

    const carrier = getMainCarrier();

    const customFn = jest.fn((_options: StartSpanOptions, callback: (span: Span) => string) => {
      callback(staticSpan);
      return 'aha';
    }) as unknown as typeof startSpanManual;

    const acs = {
      ...getAsyncContextStrategy(carrier),
      startSpanManual: customFn,
    };
    setAsyncContextStrategy(acs);

    const result = startSpanManual({ name: 'GET users/[id]' }, span => {
      expect(span).toEqual(staticSpan);
      return 'oho?';
    });

    expect(result).toBe('aha');
  });
});

describe('startInactiveSpan', () => {
  beforeEach(() => {
    registerSpanErrorInstrumentation();

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    setAsyncContextStrategy(undefined);

    const options = getDefaultTestClientOptions({ tracesSampleRate: 1 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  it('returns a non recording span if tracing is disabled', () => {
    const options = getDefaultTestClientOptions({});
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const span = startInactiveSpan({ name: 'GET users/[id]' });

    expect(span).toBeDefined();
    expect(span).toBeInstanceOf(SentryNonRecordingSpan);
    expect(getDynamicSamplingContextFromSpan(span)).toEqual({
      environment: 'production',
      sample_rate: '0',
      sampled: 'false',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      transaction: 'GET users/[id]',
    });
  });

  it('creates & finishes span', async () => {
    const span = startInactiveSpan({ name: 'GET users/[id]' });

    expect(span).toBeDefined();
    expect(span).toBeInstanceOf(SentrySpan);
    expect(spanToJSON(span).timestamp).toBeUndefined();

    span.end();

    expect(spanToJSON(span).timestamp).toBeDefined();
  });

  it('does not set span on scope', () => {
    const span = startInactiveSpan({ name: 'GET users/[id]' });

    expect(span).toBeDefined();
    expect(getActiveSpan()).toBeUndefined();

    span.end();

    expect(getActiveSpan()).toBeUndefined();
  });

  it('allows to pass a scope', () => {
    const initialScope = getCurrentScope();

    const manualScope = initialScope.clone();
    const parentSpan = new SentrySpan({ spanId: 'parent-span-id', sampled: true });
    _setSpanForScope(manualScope, parentSpan);

    const span = startInactiveSpan({ name: 'GET users/[id]', scope: manualScope });

    expect(span).toBeDefined();
    expect(spanToJSON(span).parent_span_id).toBe('parent-span-id');
    expect(getActiveSpan()).toBeUndefined();

    span.end();

    expect(getActiveSpan()).toBeUndefined();
  });

  it('allows to pass a parentSpan', () => {
    const parentSpan = new SentrySpan({ spanId: 'parent-span-id', sampled: true, name: 'parent-span' });

    const span = startInactiveSpan({ name: 'GET users/[id]', parentSpan });

    expect(spanToJSON(span).parent_span_id).toBe('parent-span-id');
    expect(getActiveSpan()).toBe(undefined);

    span.end();

    expect(getActiveSpan()).toBeUndefined();
  });

  it('allows to pass parentSpan=null', () => {
    startSpan({ name: 'outer' }, () => {
      const span = startInactiveSpan({ name: 'GET users/[id]', parentSpan: null });
      expect(spanToJSON(span).parent_span_id).toBe(undefined);
      span.end();
    });
  });

  it('allows to force a transaction with forceTransaction=true', async () => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    const transactionEvents: Event[] = [];

    client.addEventProcessor(event => {
      if (event.type === 'transaction') {
        transactionEvents.push(event);
      }
      return event;
    });

    startSpan({ name: 'outer transaction' }, () => {
      startSpan({ name: 'inner span' }, () => {
        const innerTransaction = startInactiveSpan({ name: 'inner transaction', forceTransaction: true });
        innerTransaction.end();
      });
    });

    await client.flush();

    const normalizedTransactionEvents = transactionEvents.map(event => {
      return {
        ...event,
        spans: event.spans?.map(span => ({ name: span.description, id: span.span_id })),
        sdkProcessingMetadata: {
          dynamicSamplingContext: event.sdkProcessingMetadata?.dynamicSamplingContext,
        },
      };
    });

    expect(normalizedTransactionEvents).toHaveLength(2);

    const outerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'outer transaction');
    const innerTransaction = normalizedTransactionEvents.find(event => event.transaction === 'inner transaction');

    const outerTraceId = outerTransaction?.contexts?.trace?.trace_id;
    // The inner transaction should be a child of the last span of the outer transaction
    const innerParentSpanId = outerTransaction?.spans?.[0]?.id;
    const innerSpanId = innerTransaction?.contexts?.trace?.span_id;

    expect(outerTraceId).toBeDefined();
    expect(innerParentSpanId).toBeDefined();
    expect(innerSpanId).toBeDefined();
    // inner span ID should _not_ be the parent span ID, but the id of the new span
    expect(innerSpanId).not.toEqual(innerParentSpanId);

    expect(outerTransaction?.contexts).toEqual({
      trace: {
        data: {
          'sentry.source': 'custom',
          'sentry.sample_rate': 1,
          'sentry.origin': 'manual',
        },
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        origin: 'manual',
      },
    });
    expect(outerTransaction?.spans).toEqual([{ name: 'inner span', id: expect.any(String) }]);
    expect(outerTransaction?.transaction).toEqual('outer transaction');
    expect(outerTransaction?.sdkProcessingMetadata).toEqual({
      dynamicSamplingContext: {
        environment: 'production',
        trace_id: outerTraceId,
        sample_rate: '1',
        transaction: 'outer transaction',
        sampled: 'true',
        sample_rand: expect.any(String),
      },
    });

    expect(innerTransaction?.contexts).toEqual({
      trace: {
        data: {
          'sentry.source': 'custom',
          'sentry.origin': 'manual',
        },
        parent_span_id: innerParentSpanId,
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: outerTraceId,
        origin: 'manual',
      },
    });
    expect(innerTransaction?.spans).toEqual([]);
    expect(innerTransaction?.transaction).toEqual('inner transaction');
    expect(innerTransaction?.sdkProcessingMetadata).toEqual({
      dynamicSamplingContext: {
        environment: 'production',
        trace_id: outerTraceId,
        sample_rate: '1',
        transaction: 'outer transaction',
        sampled: 'true',
        sample_rand: expect.any(String),
      },
    });
  });

  it('allows to pass a `startTime`', () => {
    const span = startInactiveSpan({ name: 'outer', startTime: [1234, 0] });
    expect(spanToJSON(span).start_timestamp).toEqual(1234);
  });

  it("picks up the trace id off the parent scope's propagation context", () => {
    expect.assertions(1);
    withScope(scope => {
      scope.setPropagationContext({
        traceId: '99999999999999999999999999999991',
        sampleRand: Math.random(),
        dsc: {},
        parentSpanId: '4242424242424242',
      });

      const span = startInactiveSpan({ name: 'span' });
      expect(span.spanContext().traceId).toBe('99999999999999999999999999999991');
      span.end();
    });
  });

  describe('onlyIfParent', () => {
    it('does not create a span if there is no parent', () => {
      const span = startInactiveSpan({ name: 'test span', onlyIfParent: true });

      expect(span).toBeDefined();
      expect(span).toBeInstanceOf(SentryNonRecordingSpan);
    });

    it('creates a span if there is a parent', () => {
      const span = startSpan({ name: 'parent span' }, () => {
        const span = startInactiveSpan({ name: 'test span', onlyIfParent: true });
        return span;
      });

      expect(span).toBeDefined();
      expect(span).toBeInstanceOf(SentrySpan);
    });
  });

  describe('parentSpanIsAlwaysRootSpan', () => {
    it('creates a span as child of root span if parentSpanIsAlwaysRootSpan=true', () => {
      const options = getDefaultTestClientOptions({
        tracesSampleRate: 1,
        parentSpanIsAlwaysRootSpan: true,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      const inactiveSpan = startInactiveSpan({ name: 'inactive span' });
      expect(spanToJSON(inactiveSpan).parent_span_id).toBe(undefined);

      startSpan({ name: 'parent span' }, span => {
        const inactiveSpan = startInactiveSpan({ name: 'inactive span' });
        expect(spanToJSON(inactiveSpan).parent_span_id).toBe(span.spanContext().spanId);

        startSpan({ name: 'child span' }, () => {
          const inactiveSpan = startInactiveSpan({ name: 'inactive span' });
          expect(spanToJSON(inactiveSpan).parent_span_id).toBe(span.spanContext().spanId);

          startSpan({ name: 'grand child span' }, () => {
            const inactiveSpan = startInactiveSpan({ name: 'inactive span' });
            expect(spanToJSON(inactiveSpan).parent_span_id).toBe(span.spanContext().spanId);
          });
        });
      });
    });

    it('does not creates a span as child of root span if parentSpanIsAlwaysRootSpan=false', () => {
      const options = getDefaultTestClientOptions({
        tracesSampleRate: 1,
        parentSpanIsAlwaysRootSpan: false,
      });
      client = new TestClient(options);
      setCurrentClient(client);
      client.init();

      const inactiveSpan = startInactiveSpan({ name: 'inactive span' });
      expect(spanToJSON(inactiveSpan).parent_span_id).toBe(undefined);

      startSpan({ name: 'parent span' }, span => {
        const inactiveSpan = startInactiveSpan({ name: 'inactive span' });
        expect(spanToJSON(inactiveSpan).parent_span_id).toBe(span.spanContext().spanId);

        startSpan({ name: 'child span' }, childSpan => {
          const inactiveSpan = startInactiveSpan({ name: 'inactive span' });
          expect(spanToJSON(inactiveSpan).parent_span_id).toBe(childSpan.spanContext().spanId);

          startSpan({ name: 'grand child span' }, grandChildSpan => {
            const inactiveSpan = startInactiveSpan({ name: 'inactive span' });
            expect(spanToJSON(inactiveSpan).parent_span_id).toBe(grandChildSpan.spanContext().spanId);
          });
        });
      });
    });
  });

  it('includes the scope at the time the span was started when finished', async () => {
    const beforeSendTransaction = jest.fn(event => event);

    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://username@domain/123',
        tracesSampleRate: 1,
        beforeSendTransaction,
      }),
    );
    setCurrentClient(client);
    client.init();

    let span: Span;

    const scope = getCurrentScope();
    scope.setTag('outer', 'foo');

    withScope(scope => {
      scope.setTag('scope', 1);
      span = startInactiveSpan({ name: 'my-span' });
      scope.setTag('scope_after_span', 2);
    });

    withScope(scope => {
      scope.setTag('scope', 2);
      span.end();
    });

    await client.flush();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(beforeSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.objectContaining({
          outer: 'foo',
          scope: 1,
          scope_after_span: 2,
        }),
      }),
      expect.anything(),
    );
  });

  it('sets a child span reference on the parent span', () => {
    expect.assertions(1);
    startSpan({ name: 'outer' }, (outerSpan: any) => {
      const innerSpan = startInactiveSpan({ name: 'inner' });
      const childSpans = Array.from(outerSpan._sentryChildSpans);
      expect(childSpans).toContain(innerSpan);
    });
  });

  it('uses implementation from ACS, if it exists', () => {
    const staticSpan = new SentrySpan({ spanId: 'aha', sampled: true });

    const carrier = getMainCarrier();

    const customFn = jest.fn((_options: StartSpanOptions) => {
      return staticSpan;
    }) as unknown as typeof startInactiveSpan;

    const acs = {
      ...getAsyncContextStrategy(carrier),
      startInactiveSpan: customFn,
    };
    setAsyncContextStrategy(acs);

    const result = startInactiveSpan({ name: 'GET users/[id]' });
    expect(result).toBe(staticSpan);
  });
});

describe('continueTrace', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    setAsyncContextStrategy(undefined);

    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  it('works without trace & baggage data', () => {
    const scope = continueTrace({ sentryTrace: undefined, baggage: undefined }, () => {
      return getCurrentScope();
    });

    expect(scope.getPropagationContext()).toEqual({
      sampled: undefined,
      traceId: expect.any(String),
      sampleRand: expect.any(Number),
    });

    expect(scope.getScopeData().sdkProcessingMetadata).toEqual({});
  });

  it('works with trace data', () => {
    const scope = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-0',
        baggage: undefined,
      },
      () => {
        return getCurrentScope();
      },
    );

    expect(scope.getPropagationContext()).toEqual({
      dsc: {}, // DSC should be an empty object (frozen), because there was an incoming trace
      sampled: false,
      parentSpanId: '1121201211212012',
      traceId: '12312012123120121231201212312012',
      sampleRand: expect.any(Number),
    });

    expect(scope.getScopeData().sdkProcessingMetadata).toEqual({});
  });

  it('works with trace & baggage data', () => {
    const scope = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
        baggage: 'sentry-version=1.0,sentry-environment=production',
      },
      () => {
        return getCurrentScope();
      },
    );

    expect(scope.getPropagationContext()).toEqual({
      dsc: {
        environment: 'production',
        version: '1.0',
        sample_rand: expect.any(String),
      },
      sampled: true,
      parentSpanId: '1121201211212012',
      traceId: '12312012123120121231201212312012',
      sampleRand: expect.any(Number),
    });

    expect(scope.getScopeData().sdkProcessingMetadata).toEqual({});
  });

  it('works with trace & 3rd party baggage data', () => {
    const scope = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
        baggage: 'sentry-version=1.0,sentry-environment=production,dogs=great,cats=boring',
      },
      () => {
        return getCurrentScope();
      },
    );

    expect(scope.getPropagationContext()).toEqual({
      dsc: {
        environment: 'production',
        version: '1.0',
        sample_rand: expect.any(String),
      },
      sampled: true,
      parentSpanId: '1121201211212012',
      traceId: '12312012123120121231201212312012',
      sampleRand: expect.any(Number),
    });

    expect(scope.getScopeData().sdkProcessingMetadata).toEqual({});
  });

  it('returns response of callback', () => {
    const result = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-0',
        baggage: undefined,
      },
      () => {
        return 'aha';
      },
    );

    expect(result).toEqual('aha');
  });
});

describe('getActiveSpan', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    setAsyncContextStrategy(undefined);

    const options = getDefaultTestClientOptions({ tracesSampleRate: 0.0 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  it('works without an active span on the scope', () => {
    const span = getActiveSpan();
    expect(span).toBeUndefined();
  });

  it('works with an active span on the scope', () => {
    const activeSpan = new SentrySpan({ spanId: 'aha', sampled: true });

    withActiveSpan(activeSpan, () => {
      const span = getActiveSpan();
      expect(span).toBe(activeSpan);
    });
  });

  it('uses implementation from ACS, if it exists', () => {
    const staticSpan = new SentrySpan({ spanId: 'aha', sampled: true });

    const carrier = getMainCarrier();

    const customFn = jest.fn(() => {
      return staticSpan;
    }) as typeof getActiveSpan;

    const acs = {
      ...getAsyncContextStrategy(carrier),
      getActiveSpan: customFn,
    };
    setAsyncContextStrategy(acs);

    const result = getActiveSpan();
    expect(result).toBe(staticSpan);
  });
});

describe('withActiveSpan()', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    setAsyncContextStrategy(undefined);

    const options = getDefaultTestClientOptions({ tracesSampleRate: 1 });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  it('should set the active span within the callback', () => {
    expect.assertions(2);
    const inactiveSpan = startInactiveSpan({ name: 'inactive-span' });

    expect(getActiveSpan()).not.toBe(inactiveSpan);

    withActiveSpan(inactiveSpan, () => {
      expect(getActiveSpan()).toBe(inactiveSpan);
    });
  });

  it('should create child spans when calling startSpan within the callback', () => {
    const inactiveSpan = startInactiveSpan({ name: 'inactive-span' });

    const parentSpanId = withActiveSpan(inactiveSpan, () => {
      return startSpan({ name: 'child-span' }, childSpan => {
        return spanToJSON(childSpan).parent_span_id;
      });
    });

    expect(parentSpanId).toBe(inactiveSpan.spanContext().spanId);
  });

  it('when `null` is passed, no span should be active within the callback', () => {
    expect.assertions(1);
    startSpan({ name: 'parent-span' }, () => {
      withActiveSpan(null, () => {
        expect(getActiveSpan()).toBeUndefined();
      });
    });
  });

  it('uses implementation from ACS, if it exists', () => {
    const staticSpan = new SentrySpan({ spanId: 'aha', sampled: true });
    const staticScope = new Scope();

    const carrier = getMainCarrier();

    const customFn = jest.fn((_span: Span | null, callback: (scope: Scope) => string) => {
      callback(staticScope);
      return 'aha';
    }) as typeof withActiveSpan;

    const acs = {
      ...getAsyncContextStrategy(carrier),
      withActiveSpan: customFn,
    };
    setAsyncContextStrategy(acs);

    const result = withActiveSpan(staticSpan, scope => {
      expect(scope).toBe(staticScope);
      return 'oho';
    });
    expect(result).toBe('aha');
  });
});

describe('span hooks', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('correctly emits span hooks', () => {
    const startedSpans: string[] = [];
    const endedSpans: string[] = [];

    client.on('spanStart', span => {
      startedSpans.push(spanToJSON(span).description || '');
    });

    client.on('spanEnd', span => {
      endedSpans.push(spanToJSON(span).description || '');
    });

    startSpan({ name: 'span1' }, () => {
      startSpan({ name: 'span2' }, () => {
        const span = startInactiveSpan({ name: 'span3' });

        startSpanManual({ name: 'span5' }, span => {
          startInactiveSpan({ name: 'span4' });
          span.end();
        });

        span.end();
      });
    });

    expect(startedSpans).toHaveLength(5);
    expect(endedSpans).toHaveLength(4);

    expect(startedSpans).toEqual(['span1', 'span2', 'span3', 'span5', 'span4']);
    expect(endedSpans).toEqual(['span5', 'span3', 'span2', 'span1']);
  });
});

describe('suppressTracing', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    setAsyncContextStrategy(undefined);

    const options = getDefaultTestClientOptions({ tracesSampleRate: 1 });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('works for a root span', () => {
    const span = suppressTracing(() => {
      return startInactiveSpan({ name: 'span' });
    });

    expect(span.isRecording()).toBe(false);
    expect(spanIsSampled(span)).toBe(false);
  });

  it('works for a child span', () => {
    startSpan({ name: 'outer' }, span => {
      expect(span.isRecording()).toBe(true);
      expect(spanIsSampled(span)).toBe(true);

      const child1 = startInactiveSpan({ name: 'inner1' });

      expect(child1.isRecording()).toBe(true);
      expect(spanIsSampled(child1)).toBe(true);

      const child2 = suppressTracing(() => {
        return startInactiveSpan({ name: 'span' });
      });

      expect(child2.isRecording()).toBe(false);
      expect(spanIsSampled(child2)).toBe(false);
    });
  });

  it('works for a child span with forceTransaction=true', () => {
    startSpan({ name: 'outer' }, span => {
      expect(span.isRecording()).toBe(true);
      expect(spanIsSampled(span)).toBe(true);

      const child = suppressTracing(() => {
        return startInactiveSpan({ name: 'span', forceTransaction: true });
      });

      expect(child.isRecording()).toBe(false);
      expect(spanIsSampled(child)).toBe(false);
    });
  });
});

describe('startNewTrace', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
  });

  it('creates a new propagation context on the current scope', () => {
    const oldCurrentScopeItraceId = getCurrentScope().getPropagationContext().traceId;

    startNewTrace(() => {
      const newCurrentScopeItraceId = getCurrentScope().getPropagationContext().traceId;

      expect(newCurrentScopeItraceId).toMatch(/^[a-f0-9]{32}$/);
      expect(newCurrentScopeItraceId).not.toEqual(oldCurrentScopeItraceId);
    });
  });

  it('keeps the propagation context on the isolation scope as-is', () => {
    const oldIsolationScopeTraceId = getIsolationScope().getPropagationContext().traceId;

    startNewTrace(() => {
      const newIsolationScopeTraceId = getIsolationScope().getPropagationContext().traceId;

      expect(newIsolationScopeTraceId).toMatch(/^[a-f0-9]{32}$/);
      expect(newIsolationScopeTraceId).toEqual(oldIsolationScopeTraceId);
    });
  });
});
