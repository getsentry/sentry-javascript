import { BrowserClient } from '@sentry/browser';
import { setupBrowserTransport } from '@sentry/browser/src/transports';
import { getDefaultBrowserClientOptions } from '@sentry/browser/test/unit/helper/browser-client-options';
import { Hub, makeMain, Scope } from '@sentry/hub';

import { Span, Transaction } from '../src';
import { TRACEPARENT_REGEXP } from '../src/utils';

describe('Span', () => {
  let hub: Hub;

  beforeEach(() => {
    const myScope = new Scope();
    const options = getDefaultBrowserClientOptions({ tracesSampleRate: 1 });
    hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport), myScope);
    makeMain(hub);
  });

  describe('new Span', () => {
    test('simple', () => {
      const span = new Span({ sampled: true });
      const span2 = span.startChild();
      expect((span2 as any).parentSpanId).toBe((span as any).spanId);
      expect((span2 as any).traceId).toBe((span as any).traceId);
      expect((span2 as any).sampled).toBe((span as any).sampled);
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
      span3.finish();
      expect(transaction.spanRecorder).toBe(span2.spanRecorder);
      expect(transaction.spanRecorder).toBe(span3.spanRecorder);
    });
  });

  describe('setters', () => {
    test('setTag', () => {
      const span = new Span({});
      expect(span.tags.foo).toBeUndefined();
      span.setTag('foo', 'bar');
      expect(span.tags.foo).toBe('bar');
      span.setTag('foo', 'baz');
      expect(span.tags.foo).toBe('baz');
    });

    test('setData', () => {
      const span = new Span({});
      expect(span.data.foo).toBeUndefined();
      span.setData('foo', null);
      expect(span.data.foo).toBe(null);
      span.setData('foo', 2);
      expect(span.data.foo).toBe(2);
      span.setData('foo', true);
      expect(span.data.foo).toBe(true);
    });
  });

  describe('status', () => {
    test('setStatus', () => {
      const span = new Span({});
      span.setStatus('permission_denied');
      expect((span.getTraceContext() as any).status).toBe('permission_denied');
    });

    test('setHttpStatus', () => {
      const span = new Span({});
      span.setHttpStatus(404);
      expect((span.getTraceContext() as any).status).toBe('not_found');
      expect(span.tags['http.status_code']).toBe('404');
    });

    test('isSuccess', () => {
      const span = new Span({});
      expect(span.isSuccess()).toBe(false);
      span.setHttpStatus(200);
      expect(span.isSuccess()).toBe(true);
      span.setStatus('permission_denied');
      expect(span.isSuccess()).toBe(false);
      span.setHttpStatus(0);
      expect(span.isSuccess()).toBe(false);
      span.setHttpStatus(-1);
      expect(span.isSuccess()).toBe(false);
      span.setHttpStatus(99);
      expect(span.isSuccess()).toBe(false);
      span.setHttpStatus(100);
      expect(span.isSuccess()).toBe(true);
    });
  });

  describe('toTraceparent', () => {
    test('simple', () => {
      expect(new Span().toTraceparent()).toMatch(TRACEPARENT_REGEXP);
    });
    test('with sample', () => {
      expect(new Span({ sampled: true }).toTraceparent()).toMatch(TRACEPARENT_REGEXP);
    });
  });

  describe('toJSON', () => {
    test('simple', () => {
      const span = JSON.parse(
        JSON.stringify(new Span({ traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: 'bbbbbbbbbbbbbbbb' })),
      );
      expect(span).toHaveProperty('span_id', 'bbbbbbbbbbbbbbbb');
      expect(span).toHaveProperty('trace_id', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    });

    test('with parent', () => {
      const spanA = new Span({ traceId: 'a', spanId: 'b' }) as any;
      const spanB = new Span({ traceId: 'c', spanId: 'd', sampled: false, parentSpanId: spanA.spanId });
      const serialized = JSON.parse(JSON.stringify(spanB));
      expect(serialized).toHaveProperty('parent_span_id', 'b');
      expect(serialized).toHaveProperty('span_id', 'd');
      expect(serialized).toHaveProperty('trace_id', 'c');
    });

    test('should drop all `undefined` values', () => {
      const spanA = new Span({ traceId: 'a', spanId: 'b' }) as any;
      const spanB = new Span({
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
      });
    });
  });

  describe('finish', () => {
    test('simple', () => {
      const span = new Span({});
      expect(span.endTimestamp).toBeUndefined();
      span.finish();
      expect(span.endTimestamp).toBeGreaterThan(1);
    });

    describe('hub.startTransaction', () => {
      test('finish a transaction', () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test' });
        transaction.finish();
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
        childSpan.finish();
        transaction.finish();
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(1);
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
      });

      // See https://github.com/getsentry/sentry-javascript/issues/3254
      test('finish a transaction + child span + sampled:true', () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test', op: 'parent', sampled: true });
        const childSpan = transaction.startChild({ op: 'child' });
        childSpan.finish();
        transaction.finish();
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(1);
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
      });

      test("finish a child span shouldn't trigger captureEvent", () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test' });
        const childSpan = transaction.startChild();
        childSpan.finish();
        expect(spy).not.toHaveBeenCalled();
      });

      test("finish a span with another one on the scope shouldn't override contexts.trace", () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;
        const transaction = hub.startTransaction({ name: 'test' });
        const childSpanOne = transaction.startChild();
        childSpanOne.finish();

        hub.configureScope(scope => {
          scope.setSpan(childSpanOne);
        });

        const spanTwo = transaction.startChild();
        spanTwo.finish();
        transaction.finish();

        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0].spans).toHaveLength(2);
        expect(spy.mock.calls[0][0].contexts.trace).toEqual(transaction.getTraceContext());
      });

      test('maxSpans correctly limits number of spans', () => {
        const options = getDefaultBrowserClientOptions({
          _experiments: { maxSpans: 3 },
          tracesSampleRate: 1,
        });
        const _hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        const spy = jest.spyOn(_hub as any, 'captureEvent') as any;
        const transaction = _hub.startTransaction({ name: 'test' });
        for (let i = 0; i < 10; i++) {
          const child = transaction.startChild();
          child.finish();
        }
        transaction.finish();
        expect(spy.mock.calls[0][0].spans).toHaveLength(3);
      });

      test('no span recorder created if transaction.sampled is false', () => {
        const options = getDefaultBrowserClientOptions({
          tracesSampleRate: 1,
        });
        const _hub = new Hub(new BrowserClient(options, setupBrowserTransport(options).transport));
        const spy = jest.spyOn(_hub as any, 'captureEvent') as any;
        const transaction = _hub.startTransaction({ name: 'test', sampled: false });
        for (let i = 0; i < 10; i++) {
          const child = transaction.startChild();
          child.finish();
        }
        transaction.finish();
        expect((transaction as any).spanRecorder).toBeUndefined();
        expect(spy).not.toHaveBeenCalled();
      });

      test('tree structure of spans should be correct when mixing it with span on scope', () => {
        const spy = jest.spyOn(hub as any, 'captureEvent') as any;

        const transaction = hub.startTransaction({ name: 'test' });
        const childSpanOne = transaction.startChild();

        const childSpanTwo = childSpanOne.startChild();
        childSpanTwo.finish();

        childSpanOne.finish();

        hub.configureScope(scope => {
          scope.setSpan(transaction);
        });

        const spanTwo = transaction.startChild({});
        spanTwo.finish();
        transaction.finish();

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
      const span = new Span({});
      const context = span.getTraceContext();
      expect((context as any).status).toBeUndefined();
    });

    test('should have success status extracted from tags', () => {
      const span = new Span({});
      span.setStatus('ok');
      const context = span.getTraceContext();
      expect((context as any).status).toBe('ok');
    });

    test('should have failure status extracted from tags', () => {
      const span = new Span({});
      span.setStatus('resource_exhausted');
      const context = span.getTraceContext();
      expect((context as any).status).toBe('resource_exhausted');
    });

    test('should drop all `undefined` values', () => {
      const spanB = new Span({ spanId: 'd', traceId: 'c' });
      const context = spanB.getTraceContext();
      expect(context).toStrictEqual({
        span_id: 'd',
        trace_id: 'c',
      });
    });
  });

  describe('toContext and updateWithContext', () => {
    test('toContext should return correct context', () => {
      const originalContext = { traceId: 'a', spanId: 'b', sampled: false, description: 'test', op: 'op' };
      const span = new Span(originalContext);

      const newContext = span.toContext();

      expect(newContext).toStrictEqual({
        ...originalContext,
        data: {},
        spanId: expect.any(String),
        startTimestamp: expect.any(Number),
        tags: {},
        traceId: expect.any(String),
      });
    });

    test('updateWithContext should completely change span properties', () => {
      const originalContext = {
        traceId: 'a',
        spanId: 'b',
        sampled: false,
        description: 'test',
        op: 'op',
        tags: {
          tag0: 'hello',
        },
      };
      const span = new Span(originalContext);

      span.updateWithContext({
        traceId: 'c',
        spanId: 'd',
        sampled: true,
      });

      expect(span.traceId).toBe('c');
      expect(span.spanId).toBe('d');
      expect(span.sampled).toBe(true);
      expect(span.description).toBe(undefined);
      expect(span.op).toBe(undefined);
      expect(span.tags).toStrictEqual({});
    });

    test('using toContext and updateWithContext together should update only changed properties', () => {
      const originalContext = {
        traceId: 'a',
        spanId: 'b',
        sampled: false,
        description: 'test',
        op: 'op',
        tags: { tag0: 'hello' },
        data: { data0: 'foo' },
      };
      const span = new Span(originalContext);

      const newContext = {
        ...span.toContext(),
        description: 'new',
        endTimestamp: 1,
        op: 'new-op',
        sampled: true,
        tags: {
          tag1: 'bye',
        },
      };

      if (newContext.data) newContext.data.data1 = 'bar';

      span.updateWithContext(newContext);

      expect(span.traceId).toBe('a');
      expect(span.spanId).toBe('b');
      expect(span.description).toBe('new');
      expect(span.endTimestamp).toBe(1);
      expect(span.op).toBe('new-op');
      expect(span.sampled).toBe(true);
      expect(span.tags).toStrictEqual({ tag1: 'bye' });
      expect(span.data).toStrictEqual({ data0: 'foo', data1: 'bar' });
    });
  });
});
