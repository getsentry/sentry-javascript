import type { Span as SpanType } from '@sentry/types';
import {
  Hub,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  addTracingExtensions,
  getCurrentScope,
  makeMain,
  setCurrentClient,
  spanToJSON,
  withScope,
} from '../../../src';
import { Scope } from '../../../src/scope';
import {
  Span,
  continueTrace,
  getActiveSpan,
  startInactiveSpan,
  startSpan,
  startSpanManual,
} from '../../../src/tracing';
import { TestClient, getDefaultTestClientOptions } from '../../mocks/client';

beforeAll(() => {
  addTracingExtensions();
});

const enum Type {
  Sync = 'sync',
  Async = 'async',
}

let hub: Hub;
let client: TestClient;

describe('startSpan', () => {
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 0.0 });
    client = new TestClient(options);
    hub = new Hub(client);
    // eslint-disable-next-line deprecation/deprecation
    makeMain(hub);
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

    it('should return the same value as the callback if transactions are undefined', async () => {
      // @ts-expect-error we are force overriding the transaction return to be undefined
      // The `startTransaction` types are actually wrong - it can return undefined
      // if tracingExtensions are not enabled
      jest.spyOn(hub, 'startTransaction').mockReturnValue(undefined);
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
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan({ name: 'GET users/[id]' }, () => {
          return callback();
        });
      } catch (e) {
        //
      }
      expect(ref).toBeDefined();

      expect(ref.name).toEqual('GET users/[id]');
      expect(ref.status).toEqual(isError ? 'internal_error' : undefined);
    });

    it('allows traceparent information to be overriden', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan(
          {
            name: 'GET users/[id]',
            parentSampled: true,
            traceId: '12345678901234567890123456789012',
            parentSpanId: '1234567890123456',
          },
          () => {
            return callback();
          },
        );
      } catch (e) {
        //
      }
      expect(ref).toBeDefined();

      expect(ref.sampled).toEqual(true);
      expect(ref.traceId).toEqual('12345678901234567890123456789012');
      expect(ref.parentSpanId).toEqual('1234567890123456');
    });

    // TODO (v8): Remove this test in favour of the one below
    it('(deprecated op) allows for transaction to be mutated', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan({ name: 'GET users/[id]' }, span => {
          if (span) {
            // eslint-disable-next-line deprecation/deprecation
            span.op = 'http.server';
          }
          return callback();
        });
      } catch (e) {
        //
      }

      expect(spanToJSON(ref).op).toEqual('http.server');
    });

    it('allows for transaction to be mutated', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan({ name: 'GET users/[id]' }, span => {
          if (span) {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'http.server');
          }
          return callback();
        });
      } catch (e) {
        //
      }

      expect(ref.op).toEqual('http.server');
    });

    it('creates a span with correct description', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan({ name: 'GET users/[id]', parentSampled: true }, () => {
          return startSpan({ name: 'SELECT * from users' }, () => {
            return callback();
          });
        });
      } catch (e) {
        //
      }

      expect(ref.spanRecorder.spans).toHaveLength(2);
      expect(ref.spanRecorder.spans[1].description).toEqual('SELECT * from users');
      expect(ref.spanRecorder.spans[1].parentSpanId).toEqual(ref.spanId);
      expect(ref.spanRecorder.spans[1].status).toEqual(isError ? 'internal_error' : undefined);
    });

    // TODO (v8): Remove this test in favour of the one below
    it('(deprecated op) allows for span to be mutated', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan({ name: 'GET users/[id]', parentSampled: true }, () => {
          return startSpan({ name: 'SELECT * from users' }, childSpan => {
            if (childSpan) {
              // eslint-disable-next-line deprecation/deprecation
              childSpan.op = 'db.query';
            }
            return callback();
          });
        });
      } catch (e) {
        //
      }

      expect(ref.spanRecorder.spans).toHaveLength(2);
      expect(ref.spanRecorder.spans[1].op).toEqual('db.query');
    });

    it('allows for span to be mutated', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan({ name: 'GET users/[id]', parentSampled: true }, () => {
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

      expect(ref.spanRecorder.spans).toHaveLength(2);
      expect(spanToJSON(ref.spanRecorder.spans[1]).op).toEqual('db.query');
    });

    it.each([
      { origin: 'auto.http.browser' },
      { attributes: { 'sentry.origin': 'auto.http.browser' } },
      // attribute should take precedence over top level origin
      { origin: 'manual', attributes: { 'sentry.origin': 'auto.http.browser' } },
    ])('correctly sets the span origin', async () => {
      let ref: any = undefined;
      client.on('finishTransaction', transaction => {
        ref = transaction;
      });
      try {
        await startSpan({ name: 'GET users/[id]', origin: 'auto.http.browser' }, () => {
          return callback();
        });
      } catch (e) {
        //
      }

      const jsonSpan = spanToJSON(ref);
      expect(jsonSpan).toEqual({
        data: {
          'sentry.origin': 'auto.http.browser',
          'sentry.sample_rate': 0,
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

  it('creates & finishes span', async () => {
    let _span: Span | undefined;
    startSpan({ name: 'GET users/[id]' }, span => {
      expect(span).toBeDefined();
      expect(spanToJSON(span!).timestamp).toBeUndefined();
      _span = span as Span;
    });

    expect(_span).toBeDefined();
    expect(spanToJSON(_span!).timestamp).toBeDefined();
  });

  it('allows to pass a `startTime`', () => {
    const start = startSpan({ name: 'outer', startTime: [1234, 0] }, span => {
      return spanToJSON(span!).start_timestamp;
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

    const manualScope = new Scope();
    const parentSpan = new Span({ spanId: 'parent-span-id' });
    // eslint-disable-next-line deprecation/deprecation
    manualScope.setSpan(parentSpan);

    startSpan({ name: 'GET users/[id]', scope: manualScope }, span => {
      expect(getCurrentScope()).not.toBe(initialScope);
      expect(getCurrentScope()).toBe(manualScope);
      expect(getActiveSpan()).toBe(span);

      expect(spanToJSON(span!).parent_span_id).toBe('parent-span-id');
      // eslint-disable-next-line deprecation/deprecation
      expect(span?.parentSpanId).toBe('parent-span-id');
    });

    expect(getCurrentScope()).toBe(initialScope);
    expect(getActiveSpan()).toBe(undefined);
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
        expect(span?.spanContext().traceId).toBe('99999999999999999999999999999999');
      });
    });
  });

  describe('onlyIfParent', () => {
    it('does not create a span if there is no parent', () => {
      const span = startSpan({ name: 'test span', onlyIfParent: true }, span => {
        return span;
      });

      expect(span).toBeUndefined();
    });

    it('creates a span if there is a parent', () => {
      const span = startSpan({ name: 'parent span' }, () => {
        const span = startSpan({ name: 'test span', onlyIfParent: true }, span => {
          return span;
        });

        return span;
      });

      expect(span).toBeDefined();
    });
  });

  it('samples with a tracesSampler', () => {
    const tracesSampler = jest.fn(() => {
      return true;
    });

    const options = getDefaultTestClientOptions({ tracesSampler });
    client = new TestClient(options);
    setCurrentClient(client);

    startSpan(
      { name: 'outer', attributes: { test1: 'aa', test2: 'aa' }, data: { test1: 'bb', test3: 'bb' } },
      outerSpan => {
        expect(outerSpan).toBeDefined();
      },
    );

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
    const transactionEventPromise = new Promise(resolve => {
      setCurrentClient(
        new TestClient(
          getDefaultTestClientOptions({
            dsn: 'https://username@domain/123',
            tracesSampleRate: 1,
            beforeSendTransaction(event) {
              resolve(event);
              return event;
            },
          }),
        ),
      );
    });

    withScope(scope1 => {
      scope1.setTag('scope', 1);
      startSpanManual({ name: 'my-span' }, span => {
        withScope(scope2 => {
          scope2.setTag('scope', 2);
          span?.end();
        });
      });
    });

    expect(await transactionEventPromise).toMatchObject({
      tags: {
        scope: 1,
      },
    });
  });
});

describe('startSpanManual', () => {
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1 });
    client = new TestClient(options);
    hub = new Hub(client);
    // eslint-disable-next-line deprecation/deprecation
    makeMain(hub);
  });

  it('creates & finishes span', async () => {
    startSpanManual({ name: 'GET users/[id]' }, (span, finish) => {
      expect(span).toBeDefined();
      expect(spanToJSON(span!).timestamp).toBeUndefined();
      finish();
      expect(spanToJSON(span!).timestamp).toBeDefined();
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

    const manualScope = new Scope();
    const parentSpan = new Span({ spanId: 'parent-span-id' });
    // eslint-disable-next-line deprecation/deprecation
    manualScope.setSpan(parentSpan);

    startSpanManual({ name: 'GET users/[id]', scope: manualScope }, (span, finish) => {
      expect(getCurrentScope()).not.toBe(initialScope);
      expect(getCurrentScope()).toBe(manualScope);
      expect(getActiveSpan()).toBe(span);
      expect(spanToJSON(span!).parent_span_id).toBe('parent-span-id');
      // eslint-disable-next-line deprecation/deprecation
      expect(span?.parentSpanId).toBe('parent-span-id');

      finish();

      // Is still the active span
      expect(getActiveSpan()).toBe(span);
    });

    expect(getCurrentScope()).toBe(initialScope);
    expect(getActiveSpan()).toBe(undefined);
  });

  it('allows to pass a `startTime`', () => {
    const start = startSpanManual({ name: 'outer', startTime: [1234, 0] }, span => {
      span?.end();
      return spanToJSON(span!).start_timestamp;
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
        expect(span?.spanContext().traceId).toBe('99999999999999999999999999999991');
        span?.end();
      });
    });
  });

  describe('onlyIfParent', () => {
    it('does not create a span if there is no parent', () => {
      const span = startSpanManual({ name: 'test span', onlyIfParent: true }, span => {
        return span;
      });

      expect(span).toBeUndefined();
    });

    it('creates a span if there is a parent', () => {
      const span = startSpan({ name: 'parent span' }, () => {
        const span = startSpanManual({ name: 'test span', onlyIfParent: true }, span => {
          return span;
        });

        return span;
      });

      expect(span).toBeDefined();
    });
  });
});

describe('startInactiveSpan', () => {
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1 });
    client = new TestClient(options);
    hub = new Hub(client);
    // eslint-disable-next-line deprecation/deprecation
    makeMain(hub);
  });

  it('creates & finishes span', async () => {
    const span = startInactiveSpan({ name: 'GET users/[id]' });

    expect(span).toBeDefined();
    expect(spanToJSON(span!).timestamp).toBeUndefined();

    span?.end();

    expect(spanToJSON(span!).timestamp).toBeDefined();
  });

  it('does not set span on scope', () => {
    const span = startInactiveSpan({ name: 'GET users/[id]' });

    expect(span).toBeDefined();
    expect(getActiveSpan()).toBeUndefined();

    span?.end();

    expect(getActiveSpan()).toBeUndefined();
  });

  it('allows to pass a scope', () => {
    const manualScope = new Scope();
    const parentSpan = new Span({ spanId: 'parent-span-id' });
    // eslint-disable-next-line deprecation/deprecation
    manualScope.setSpan(parentSpan);

    const span = startInactiveSpan({ name: 'GET users/[id]', scope: manualScope });

    expect(span).toBeDefined();
    expect(spanToJSON(span!).parent_span_id).toBe('parent-span-id');
    // eslint-disable-next-line deprecation/deprecation
    expect(span?.parentSpanId).toBe('parent-span-id');
    expect(getActiveSpan()).toBeUndefined();

    span?.end();

    expect(getActiveSpan()).toBeUndefined();
  });

  it('allows to pass a `startTime`', () => {
    const span = startInactiveSpan({ name: 'outer', startTime: [1234, 0] });
    expect(spanToJSON(span!).start_timestamp).toEqual(1234);
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
      expect(span?.spanContext().traceId).toBe('99999999999999999999999999999991');
      span?.end();
    });
  });

  describe('onlyIfParent', () => {
    it('does not create a span if there is no parent', () => {
      const span = startInactiveSpan({ name: 'test span', onlyIfParent: true });

      expect(span).toBeUndefined();
    });

    it('creates a span if there is a parent', () => {
      const span = startSpan({ name: 'parent span' }, () => {
        const span = startInactiveSpan({ name: 'test span', onlyIfParent: true });

        return span;
      });

      expect(span).toBeDefined();
    });
  });

  it('includes the scope at the time the span was started when finished', async () => {
    const transactionEventPromise = new Promise(resolve => {
      setCurrentClient(
        new TestClient(
          getDefaultTestClientOptions({
            dsn: 'https://username@domain/123',
            tracesSampleRate: 1,
            beforeSendTransaction(event) {
              resolve(event);
              return event;
            },
          }),
        ),
      );
    });

    let span: SpanType | undefined;

    withScope(scope => {
      scope.setTag('scope', 1);
      span = startInactiveSpan({ name: 'my-span' });
    });

    withScope(scope => {
      scope.setTag('scope', 2);
      span?.end();
    });

    expect(await transactionEventPromise).toMatchObject({
      tags: {
        scope: 1,
      },
    });
  });
});

describe('continueTrace', () => {
  beforeEach(() => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 0.0 });
    client = new TestClient(options);
    hub = new Hub(client);
    // eslint-disable-next-line deprecation/deprecation
    makeMain(hub);
  });

  it('works without trace & baggage data', () => {
    const propagationContext = continueTrace({ sentryTrace: undefined, baggage: undefined }, () => {
      return getCurrentScope().getPropagationContext();
    });

    expect(propagationContext).toEqual({
      sampled: undefined,
      spanId: expect.any(String),
      traceId: expect.any(String),
    });
  });

  it('works with trace data', () => {
    const propagationContext = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-0',
        baggage: undefined,
      },
      () => {
        return getCurrentScope().getPropagationContext();
      },
    );

    expect(propagationContext).toEqual({
      dsc: {}, // DSC should be an empty object (frozen), because there was an incoming trace
      sampled: false,
      parentSpanId: '1121201211212012',
      spanId: expect.any(String),
      traceId: '12312012123120121231201212312012',
    });
  });

  it('works with trace & baggage data', () => {
    const propagationContext = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
        baggage: 'sentry-version=1.0,sentry-environment=production',
      },
      () => {
        return getCurrentScope().getPropagationContext();
      },
    );

    expect(propagationContext).toEqual({
      dsc: {
        environment: 'production',
        version: '1.0',
      },
      sampled: true,
      parentSpanId: '1121201211212012',
      spanId: expect.any(String),
      traceId: '12312012123120121231201212312012',
    });
  });

  it('works with trace & 3rd party baggage data', () => {
    const propagationContext = continueTrace(
      {
        sentryTrace: '12312012123120121231201212312012-1121201211212012-1',
        baggage: 'sentry-version=1.0,sentry-environment=production,dogs=great,cats=boring',
      },
      () => {
        return getCurrentScope().getPropagationContext();
      },
    );

    expect(propagationContext).toEqual({
      dsc: {
        environment: 'production',
        version: '1.0',
      },
      sampled: true,
      parentSpanId: '1121201211212012',
      spanId: expect.any(String),
      traceId: '12312012123120121231201212312012',
    });
  });
});
