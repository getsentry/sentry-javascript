/* eslint-disable deprecation/deprecation */
import { BrowserClient } from '@sentry/browser';
import {
  Hub,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SentrySpan,
  getClient,
  getCurrentHub,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
} from '@sentry/core';
import type { BaseTransportOptions, ClientOptions } from '@sentry/types';

import { TRACEPARENT_REGEXP, Transaction } from '../src';
import { getDefaultBrowserClientOptions } from './testutils';

describe('SentrySpan', () => {
  beforeEach(() => {
    getGlobalScope().clear();
    getIsolationScope().clear();
    getCurrentScope().clear();

    const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
    const client = new BrowserClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('new SentrySpan', () => {
    test('simple', () => {
      const span = new SentrySpan({ sampled: true });
      const span2 = span.startChild();
      expect((span2 as any).parentSpanId).toBe((span as any).spanId);
      expect((span2 as any).traceId).toBe((span as any).traceId);
      expect((span2 as any).sampled).toBe((span as any).sampled);
    });

    test('sets instrumenter to `sentry` if not specified in constructor', () => {
      const span = new SentrySpan({});

      expect(span.instrumenter).toBe('sentry');
    });

    test('allows to set instrumenter in constructor', () => {
      const span = new SentrySpan({ instrumenter: 'otel' });

      expect(span.instrumenter).toBe('otel');
    });
  });

  describe('new Transaction', () => {
    test('simple', () => {
      const transaction = new Transaction({ name: 'test', sampled: true });
      const span2 = transaction.startChild();
      expect((span2 as any).parentSpanId).toBe((transaction as any).spanId);
      expect((span2 as any).traceId).toBe((transaction as any).traceId);
      expect((span2 as any).sampled).toBe((transaction as any).sampled);
    });

    test('gets currentHub', () => {
      const transaction = new Transaction({ name: 'test' });
      expect((transaction as any)._hub).toBeInstanceOf(Hub);
    });

    test('inherit span list', () => {
      const transaction = new Transaction({ name: 'test', sampled: true });
      const span2 = transaction.startChild();
      const span3 = span2.startChild();
      span3.end();
      expect(transaction.spanRecorder).toBe((span2 as SentrySpan).spanRecorder);
      expect(transaction.spanRecorder).toBe((span3 as SentrySpan).spanRecorder);
    });
  });

  describe('setters', () => {
    test('setTag', () => {
      const span = new SentrySpan({});
      expect(span.tags.foo).toBeUndefined();
      span.setTag('foo', 'bar');
      expect(span.tags.foo).toBe('bar');
      span.setTag('foo', 'baz');
      expect(span.tags.foo).toBe('baz');
    });

    test('setData', () => {
      const span = new SentrySpan({});
      expect(span.data.foo).toBeUndefined();
      span.setData('foo', null);
      expect(span.data.foo).toBe(null);
      span.setData('foo', 2);
      expect(span.data.foo).toBe(2);
      span.setData('foo', true);
      expect(span.data.foo).toBe(true);
    });

    test('setName', () => {
      const span = new SentrySpan({});
      expect(spanToJSON(span).description).toBeUndefined();
      span.updateName('foo');
      expect(spanToJSON(span).description).toBe('foo');
    });
  });

  describe('status', () => {
    test('setStatus', () => {
      const span = new SentrySpan({});
      span.setStatus('permission_denied');
      expect((span.getTraceContext() as any).status).toBe('permission_denied');
    });

    // TODO (v8): Remove
    test('setHttpStatus', () => {
      const span = new SentrySpan({});
      span.setHttpStatus(404);
      expect((span.getTraceContext() as any).status).toBe('not_found');
      expect(span.tags['http.status_code']).toBe('404');
      expect(span.data['http.response.status_code']).toBe(404);
    });
  });

  describe('toTraceparent', () => {
    test('simple', () => {
      expect(new SentrySpan().toTraceparent()).toMatch(TRACEPARENT_REGEXP);
    });
    test('with sample', () => {
      expect(new SentrySpan({ sampled: true }).toTraceparent()).toMatch(TRACEPARENT_REGEXP);
    });
  });

  describe('toJSON', () => {
    test('simple', () => {
      const span = JSON.parse(
        JSON.stringify(new SentrySpan({ traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: 'bbbbbbbbbbbbbbbb' })),
      );
      expect(span).toHaveProperty('span_id', 'bbbbbbbbbbbbbbbb');
      expect(span).toHaveProperty('trace_id', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    });

    test('with parent', () => {
      const spanA = new SentrySpan({ traceId: 'a', spanId: 'b' }) as any;
      const spanB = new SentrySpan({ traceId: 'c', spanId: 'd', sampled: false, parentSpanId: spanA.spanId });
      const serialized = JSON.parse(JSON.stringify(spanB));
      expect(serialized).toHaveProperty('parent_span_id', 'b');
      expect(serialized).toHaveProperty('span_id', 'd');
      expect(serialized).toHaveProperty('trace_id', 'c');
    });

    test('should drop all `undefined` values', () => {
      const spanA = new SentrySpan({ traceId: 'a', spanId: 'b' }) as any;
      const spanB = new SentrySpan({
        parentSpanId: spanA.spanId,
        spanId: 'd',
        traceId: 'c',
      });
      const serialized = spanB.toJSON();
      expect(serialized).toStrictEqual({
        start_timestamp: expect.any(Number),
        parent_span_id: 'b',
        span_id: 'd',
        trace_id: 'c',
        origin: 'manual',
        data: {
          'sentry.origin': 'manual',
        },
      });
    });
  });

  describe('finish', () => {
    test('simple', () => {
      const span = new SentrySpan({});
      expect(spanToJSON(span).timestamp).toBeUndefined();
      span.end();
      expect(spanToJSON(span).timestamp).toBeGreaterThan(1);
    });

    describe('hub.startTransaction', () => {
      let hub: Hub;

      beforeEach(() => {
        hub = getCurrentHub() as Hub;
      });

      test('finish a transaction', () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test' });
        transaction.end();
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(0);
        expect(spy.mock.calls[0][0].timestamp).toBeTruthy();
        expect(spy.mock.calls[0][0].start_timestamp).toBeTruthy();
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
      });

      test('finish a transaction + child span', () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test' });
        const childSpan = transaction.startChild();
        childSpan.end();
        transaction.end();
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(1);
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
      });

      // See https://github.com/getsentry/sentry-javascript/issues/3254
      test('finish a transaction + child span + sampled:true', () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test', op: 'parent', sampled: true });
        const childSpan = transaction.startChild({ op: 'child' });
        childSpan.end();
        transaction.end();
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(1);
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
      });

      test("finish a child span shouldn't trigger captureEvent", () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test' });
        const childSpan = transaction.startChild();
        childSpan.end();
        expect(spy).not.toHaveBeenCalled();
      });

      test("finish a span with another one on the scope shouldn't override contexts.trace", () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test' });
        const childSpanOne = transaction.startChild();
        childSpanOne.end();

        hub.getScope().setSpan(childSpanOne);

        const spanTwo = transaction.startChild();
        spanTwo.end();
        transaction.end();

        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(2);
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
      });

      test('no span recorder created if transaction.sampled is false', () => {
        const options = getDefaultBrowserClientOptions({
          tracesSampleRate: 1,
        });
        const _hub = new Hub(new BrowserClient(options));
        const spy = jest.spyOn(_hub as any, 'captureEvent') as any;
        const transaction = _hub.startTransaction({ name: 'test', sampled: false });
        for (let i = 0; i < 10; i++) {
          const child = transaction.startChild();
          child.end();
        }
        transaction.end();
        expect((transaction as any).spanRecorder).toBeUndefined();
        expect(spy).not.toHaveBeenCalled();
      });

      test('tree structure of spans should be correct when mixing it with span on scope', () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;

        const transaction = hub.startTransaction({ name: 'test' });
        const childSpanOne = transaction.startChild();

        const childSpanTwo = childSpanOne.startChild();
        childSpanTwo.end();

        childSpanOne.end();

        hub.getScope().setSpan(transaction);

        const spanTwo = transaction.startChild({});
        spanTwo.end();
        transaction.end();

        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(3);
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
        expect(childSpanOne.toJSON().parent_span_id).toEqual(transaction.toJSON().span_id);
        expect(childSpanTwo.toJSON().parent_span_id).toEqual(childSpanOne.toJSON().span_id);
        expect(spanTwo.toJSON().parent_span_id).toEqual(transaction.toJSON().span_id);
      });
    });
  });

  describe('end', () => {
    test('simple', () => {
      const span = new SentrySpan({});
      expect(spanToJSON(span).timestamp).toBeUndefined();
      span.end();
      expect(spanToJSON(span).timestamp).toBeGreaterThan(1);
    });

    test('with endTime in seconds', () => {
      const span = new SentrySpan({});
      expect(spanToJSON(span).timestamp).toBeUndefined();
      const endTime = Date.now() / 1000;
      span.end(endTime);
      expect(spanToJSON(span).timestamp).toBe(endTime);
    });

    test('with endTime in milliseconds', () => {
      const span = new SentrySpan({});
      expect(spanToJSON(span).timestamp).toBeUndefined();
      const endTime = Date.now();
      span.end(endTime);
      expect(spanToJSON(span).timestamp).toBe(endTime / 1000);
    });

    describe('hub.startTransaction', () => {
      let hub: Hub;

      beforeEach(() => {
        hub = getCurrentHub() as Hub;
      });

      test('finish a transaction', () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test' });
        transaction.end();
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(0);
        expect(spy.mock.calls[0][0].timestamp).toBeTruthy();
        expect(spy.mock.calls[0][0].start_timestamp).toBeTruthy();
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
      });

      test('finish a transaction + child span', () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test' });
        const childSpan = transaction.startChild();
        childSpan.end();
        transaction.end();
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(1);
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
      });

      // See https://github.com/getsentry/sentry-javascript/issues/3254
      test('finish a transaction + child span + sampled:true', () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test', op: 'parent', sampled: true });
        const childSpan = transaction.startChild({ op: 'child' });
        childSpan.end();
        transaction.end();
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(1);
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
      });

      test("finish a child span shouldn't trigger captureEvent", () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test' });
        const childSpan = transaction.startChild();
        childSpan.end();
        expect(spy).not.toHaveBeenCalled();
      });

      test("finish a span with another one on the scope shouldn't override contexts.trace", () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test' });
        const childSpanOne = transaction.startChild();
        childSpanOne.end();

        hub.getScope().setSpan(childSpanOne);

        const spanTwo = transaction.startChild();
        spanTwo.end();
        transaction.end();

        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(2);
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
      });

      test('no span recorder created if transaction.sampled is false', () => {
        const options = getDefaultBrowserClientOptions({
          tracesSampleRate: 1,
        });
        const _hub = new Hub(new BrowserClient(options));
        const spy = jest.spyOn(_hub as any, 'captureEvent') as any;
        const transaction = _hub.startTransaction({ name: 'test', sampled: false });
        for (let i = 0; i < 10; i++) {
          const child = transaction.startChild();
          child.end();
        }
        transaction.end();
        expect((transaction as any).spanRecorder).toBeUndefined();
        expect(spy).not.toHaveBeenCalled();
      });

      test('tree structure of spans should be correct when mixing it with span on scope', () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;

        const transaction = hub.startTransaction({ name: 'test' });
        const childSpanOne = transaction.startChild();

        const childSpanTwo = childSpanOne.startChild();
        childSpanTwo.end();

        childSpanOne.end();

        hub.getScope().setSpan(transaction);

        const spanTwo = transaction.startChild({});
        spanTwo.end();
        transaction.end();

        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(3);
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
        expect(childSpanOne.toJSON().parent_span_id).toEqual(transaction.toJSON().span_id);
        expect(childSpanTwo.toJSON().parent_span_id).toEqual(childSpanOne.toJSON().span_id);
        expect(spanTwo.toJSON().parent_span_id).toEqual(transaction.toJSON().span_id);
      });
    });
  });

  describe('getTraceContext', () => {
    test('should have status attribute undefined if no status tag is available', () => {
      const span = new SentrySpan({});
      const context = span.getTraceContext();
      expect((context as any).status).toBeUndefined();
    });

    test('should have success status extracted from tags', () => {
      const span = new SentrySpan({});
      span.setStatus('ok');
      const context = span.getTraceContext();
      expect((context as any).status).toBe('ok');
    });

    test('should have failure status extracted from tags', () => {
      const span = new SentrySpan({});
      span.setStatus('resource_exhausted');
      const context = span.getTraceContext();
      expect((context as any).status).toBe('resource_exhausted');
    });

    test('should drop all `undefined` values', () => {
      const spanB = new SentrySpan({ spanId: 'd', traceId: 'c' });
      const context = spanB.getTraceContext();
      expect(context).toStrictEqual({
        span_id: 'd',
        trace_id: 'c',
        data: {
          'sentry.origin': 'manual',
        },
        origin: 'manual',
      });
    });
  });

  describe('toContext and updateWithContext', () => {
    test('toContext should return correct context', () => {
      const originalContext = {
        traceId: 'a',
        spanId: 'b',
        sampled: false,
        name: 'test',
        op: 'op',
      };
      const span = new SentrySpan(originalContext);

      const newContext = span.toContext();

      expect(newContext).toStrictEqual({
        ...originalContext,
        spanId: expect.any(String),
        startTimestamp: expect.any(Number),
        tags: {},
        traceId: expect.any(String),
        data: {
          'sentry.op': 'op',
          'sentry.origin': 'manual',
        },
      });
    });

    test('updateWithContext should completely change span properties', () => {
      const originalContext = {
        traceId: 'a',
        spanId: 'b',
        sampled: false,
        name: 'test',
        op: 'op',
        tags: {
          tag0: 'hello',
        },
      };
      const span = new SentrySpan(originalContext);

      span.updateWithContext({
        traceId: 'c',
        spanId: 'd',
        sampled: true,
      });

      expect(span.spanContext().traceId).toBe('c');
      expect(span.spanContext().spanId).toBe('d');
      expect(span.sampled).toBe(true);
      expect(spanToJSON(span).description).toBe(undefined);
      expect(spanToJSON(span).op).toBe(undefined);
      expect(span.tags).toStrictEqual({});
    });

    test('using toContext and updateWithContext together should update only changed properties', () => {
      const originalContext = {
        traceId: 'a',
        spanId: 'b',
        sampled: false,
        name: 'test',
        op: 'op',
        tags: { tag0: 'hello' },
        data: { data0: 'foo' },
      };
      const span = new SentrySpan(originalContext);

      const newContext = {
        ...span.toContext(),
        name: 'new',
        endTimestamp: 1,
        op: 'new-op',
        sampled: true,
        tags: {
          tag1: 'bye',
        },
        data: {
          ...span.toContext().data,
        },
      };

      if (newContext.data) newContext.data.data1 = 'bar';

      span.updateWithContext(newContext);

      expect(span.spanContext().traceId).toBe('a');
      expect(span.spanContext().spanId).toBe('b');
      expect(spanToJSON(span).description).toBe('new');
      expect(spanToJSON(span).timestamp).toBe(1);
      expect(spanToJSON(span).op).toBe('new-op');
      expect(span.sampled).toBe(true);
      expect(span.tags).toStrictEqual({ tag1: 'bye' });
      expect(span.data).toStrictEqual({
        data0: 'foo',
        data1: 'bar',
        'sentry.op': 'op',
        'sentry.origin': 'manual',
      });
    });
  });

  describe('getDynamicSamplingContext', () => {
    beforeEach(() => {
      getClient()!.getOptions = () => {
        return {
          release: '1.0.1',
          environment: 'production',
        } as ClientOptions<BaseTransportOptions>;
      };
    });

    test('should return DSC that was provided during transaction creation, if it was provided', () => {
      const transaction = new Transaction(
        {
          name: 'tx',
          metadata: { dynamicSamplingContext: { environment: 'myEnv' } },
        },
        getCurrentHub(),
      );

      const dynamicSamplingContext = transaction.getDynamicSamplingContext();

      expect(dynamicSamplingContext).toStrictEqual({ environment: 'myEnv' });
    });

    test('should return new DSC, if no DSC was provided during transaction creation', () => {
      const transaction = new Transaction({
        name: 'tx',
        metadata: {
          sampleRate: 0.56,
        },
        sampled: true,
      });

      const getOptionsSpy = jest.spyOn(getClient()!, 'getOptions');

      const dynamicSamplingContext = transaction.getDynamicSamplingContext();

      expect(getOptionsSpy).toHaveBeenCalledTimes(1);
      expect(dynamicSamplingContext).toStrictEqual({
        release: '1.0.1',
        environment: 'production',
        sampled: 'true',
        sample_rate: '0.56',
        trace_id: expect.any(String),
        transaction: 'tx',
      });
    });

    describe('Including transaction name in DSC', () => {
      test('is not included if transaction source is url', () => {
        const transaction = new Transaction(
          {
            name: 'tx',
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
            },
          },
          getCurrentHub(),
        );

        const dsc = transaction.getDynamicSamplingContext()!;
        expect(dsc.transaction).toBeUndefined();
      });

      test.each([
        ['is included if transaction source is paremeterized route/url', 'route'],
        ['is included if transaction source is a custom name', 'custom'],
      ] as const)('%s', (_, source) => {
        const transaction = new Transaction(
          {
            name: 'tx',
            attributes: {
              ...(source && { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source }),
            },
          },
          getCurrentHub(),
        );

        const dsc = transaction.getDynamicSamplingContext()!;

        expect(dsc.transaction).toEqual('tx');
      });
    });
  });

  describe('Transaction source', () => {
    test('is included when transaction metadata is set', () => {
      const hub = getCurrentHub();

      const spy = jest.spyOn(hub as any, 'captureEvent') as any;
      const transaction = hub.startTransaction({ name: 'test', sampled: true });
      transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'url');
      expect(spy).toHaveBeenCalledTimes(0);

      transaction.end();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          transaction_info: {
            source: 'url',
          },
        }),
      );
    });
  });
});
