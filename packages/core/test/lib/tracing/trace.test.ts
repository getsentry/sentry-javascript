import type { Event, Span, StartSpanOptions } from '@sentry/types';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  Scope,
  addTracingExtensions,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getMainCarrier,
  setAsyncContextStrategy,
  setCurrentClient,
  spanToJSON,
  withScope,
} from '../../../src';
import { getAsyncContextStrategy } from '../../../src/hub';
import {
  SentrySpan,
  continueTrace,
  startInactiveSpan,
  startSpan,
  startSpanManual,
  withActiveSpan,
} from '../../../src/tracing';
import { SentryNonRecordingSpan } from '../../../src/tracing/sentryNonRecordingSpan';
import { getActiveSpan, getRootSpan, getSpanDescendants } from '../../../src/utils/spanUtils';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

beforeAll(() => {
  addTracingExtensions();
});

const enum Type {
  Sync = 'sync',
  Async = 'async',
}

let client: TestClient;

describe('startSpan', () => {
  beforeEach(() => {
    addTracingExtensions();

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
      expect(spanToJSON(spans[1]).description).toEqual('SELECT * from users');
      expect(spanToJSON(spans[1]).parent_span_id).toEqual(_span!.spanContext().spanId);
      expect(spanToJSON(spans[1]).status).toEqual(isError ? 'internal_error' : undefined);
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
            if (childSpan) {
              childSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'db.query');
            }
            return callback();
          });
        });
      } catch (e) {
        //
      }

      expect(_span).toBeDefined();
      const spans = getSpanDescendants(_span!);

      expect(spans).toHaveLength(2);
      expect(spanToJSON(spans[1]).op).toEqual('db.query');
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
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        status: isError ? 'internal_error' : undefined,
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
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

  it('allows to pass a scope', () => {
    const initialScope = getCurrentScope();

    const manualScope = initialScope.clone();
    const parentSpan = new SentrySpan({ spanId: 'parent-span-id' });
    // eslint-disable-next-line deprecation/deprecation
    manualScope.setSpan(parentSpan);

    startSpan({ name: 'GET users/[id]', scope: manualScope }, span => {
      expect(getCurrentScope()).not.toBe(initialScope);
      expect(getCurrentScope()).toBe(manualScope);
      expect(getActiveSpan()).toBe(span);
      expect(spanToJSON(span).parent_span_id).toBe('parent-span-id');
    });

    expect(getCurrentScope()).toBe(initialScope);
    expect(getActiveSpan()).toBe(undefined);
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
    const innerParentSpanId = outerTransaction?.spans?.[0].id;
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
        span_id: expect.any(String),
        trace_id: expect.any(String),
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
      },
    });

    expect(innerTransaction?.contexts).toEqual({
      trace: {
        data: {
          'sentry.source': 'custom',
          'sentry.origin': 'manual',
        },
        parent_span_id: innerParentSpanId,
        span_id: expect.any(String),
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
      },
    });
  });

  it("picks up the trace id off the parent scope's propagation context", () => {
    expect.assertions(1);
    withScope(scope => {
      scope.setPropagationContext({
        traceId: '99999999999999999999999999999999',
        spanId: '1212121212121212',
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
      transactionContext: expect.objectContaining({ name: 'outer', parentSampled: undefined }),
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
    const staticSpan = new SentrySpan({ spanId: 'aha' });

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
});

describe('startSpanManual', () => {
  beforeEach(() => {
    addTracingExtensions();

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

  it('allows to pass a scope', () => {
    const initialScope = getCurrentScope();

    const manualScope = initialScope.clone();
    const parentSpan = new SentrySpan({ spanId: 'parent-span-id' });
    // eslint-disable-next-line deprecation/deprecation
    manualScope.setSpan(parentSpan);

    startSpanManual({ name: 'GET users/[id]', scope: manualScope }, (span, finish) => {
      expect(getCurrentScope()).not.toBe(initialScope);
      expect(getCurrentScope()).toBe(manualScope);
      expect(getActiveSpan()).toBe(span);
      expect(spanToJSON(span).parent_span_id).toBe('parent-span-id');

      finish();

      // Is still the active span
      expect(getActiveSpan()).toBe(span);
    });

    expect(getCurrentScope()).toBe(initialScope);
    expect(getActiveSpan()).toBe(undefined);
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
    const innerParentSpanId = outerTransaction?.spans?.[0].id;
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
        span_id: expect.any(String),
        trace_id: expect.any(String),
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
      },
    });

    expect(innerTransaction?.contexts).toEqual({
      trace: {
        data: {
          'sentry.source': 'custom',
          'sentry.origin': 'manual',
        },
        parent_span_id: innerParentSpanId,
        span_id: expect.any(String),
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
        spanId: '1212121212121212',
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
    const staticSpan = new SentrySpan({ spanId: 'aha' });

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
    addTracingExtensions();

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
    const parentSpan = new SentrySpan({ spanId: 'parent-span-id' });
    // eslint-disable-next-line deprecation/deprecation
    manualScope.setSpan(parentSpan);

    const span = startInactiveSpan({ name: 'GET users/[id]', scope: manualScope });

    expect(span).toBeDefined();
    expect(spanToJSON(span).parent_span_id).toBe('parent-span-id');
    expect(getActiveSpan()).toBeUndefined();

    span.end();

    expect(getActiveSpan()).toBeUndefined();
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
        innerTransaction?.end();
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
    const innerParentSpanId = outerTransaction?.spans?.[0].id;
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
        span_id: expect.any(String),
        trace_id: expect.any(String),
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
      },
    });

    expect(innerTransaction?.contexts).toEqual({
      trace: {
        data: {
          'sentry.source': 'custom',
          'sentry.origin': 'manual',
        },
        parent_span_id: innerParentSpanId,
        span_id: expect.any(String),
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
        spanId: '1212121212121212',
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
    const staticSpan = new SentrySpan({ spanId: 'aha' });

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
    addTracingExtensions();

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
      spanId: expect.any(String),
      traceId: expect.any(String),
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
      spanId: expect.any(String),
      traceId: '12312012123120121231201212312012',
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
      },
      sampled: true,
      parentSpanId: '1121201211212012',
      spanId: expect.any(String),
      traceId: '12312012123120121231201212312012',
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
      },
      sampled: true,
      parentSpanId: '1121201211212012',
      spanId: expect.any(String),
      traceId: '12312012123120121231201212312012',
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
    addTracingExtensions();

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
    const activeSpan = new SentrySpan({ spanId: 'aha' });
    // eslint-disable-next-line deprecation/deprecation
    getCurrentScope().setSpan(activeSpan);

    const span = getActiveSpan();
    expect(span).toBe(activeSpan);
  });

  it('uses implementation from ACS, if it exists', () => {
    const staticSpan = new SentrySpan({ spanId: 'aha' });

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
  beforeAll(() => {
    addTracingExtensions();
  });

  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    setAsyncContextStrategy(undefined);

    const options = getDefaultTestClientOptions({ enableTracing: true });
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
    const staticSpan = new SentrySpan({ spanId: 'aha' });
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
    addTracingExtensions();

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
          span?.end();
        });

        span?.end();
      });
    });

    expect(startedSpans).toHaveLength(5);
    expect(endedSpans).toHaveLength(4);

    expect(startedSpans).toEqual(['span1', 'span2', 'span3', 'span5', 'span4']);
    expect(endedSpans).toEqual(['span5', 'span3', 'span2', 'span1']);
  });
});
