import { Hub, Scope, Span, TRACEPARENT_REGEXP } from '../src';

describe('Span', () => {
  let hub: Hub;

  beforeEach(() => {
    const clientFn: any = jest.fn();
    const myScope = new Scope();
    hub = new Hub(clientFn, myScope);
  });

  describe('newSpan', () => {
    test('simple', () => {
      const span = new Span({ sampled: true });
      const span2 = span.child();
      expect((span2 as any)._parentSpanId).toBe((span as any)._spanId);
      expect((span2 as any)._traceId).toBe((span as any)._traceId);
      expect((span2 as any).sampled).toBe((span as any).sampled);
    });

    test('gets currentHub', () => {
      const span = new Span({});
      const span2 = span.child();
      expect((span as any)._hub).toBeInstanceOf(Hub);
      expect((span2 as any)._hub).toBeInstanceOf(Hub);
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
    test('setSuccess', () => {
      const span = new Span({});
      span.setSuccess();
      expect(span.tags.status).toBe('success');
    });

    test('setFailure', () => {
      const span = new Span({});
      span.setFailure();
      expect(span.tags.status).toBe('failure');
    });

    test('isSuccess', () => {
      const span = new Span({});
      expect(span.isSuccess()).toBe(true);
      span.setFailure();
      expect(span.isSuccess()).toBe(false);
      span.setSuccess();
      expect(span.isSuccess()).toBe(true);
    });
  });

  describe('newSpan', () => {
    test('simple', () => {
      const span = new Span({ sampled: true });
      const span2 = span.child();
      expect((span2 as any)._parentSpanId).toBe((span as any)._spanId);
      expect((span2 as any)._traceId).toBe((span as any)._traceId);
      expect((span2 as any).sampled).toBe((span as any).sampled);
    });

    test('gets currentHub', () => {
      const span = new Span({});
      const span2 = span.child();
      expect((span as any)._hub).toBeInstanceOf(Hub);
      expect((span2 as any)._hub).toBeInstanceOf(Hub);
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

  describe('fromTraceparent', () => {
    test('no sample', () => {
      const from = Span.fromTraceparent('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb') as any;

      expect(from._parentSpanId).toEqual('bbbbbbbbbbbbbbbb');
      expect(from._traceId).toEqual('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      expect(from._spanId).not.toEqual('bbbbbbbbbbbbbbbb');
      expect(from.sampled).toBeUndefined();
    });
    test('sample true', () => {
      const from = Span.fromTraceparent('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-1') as any;
      expect(from.sampled).toBeTruthy();
    });

    test('sample false', () => {
      const from = Span.fromTraceparent('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-0') as any;
      expect(from.sampled).toBeFalsy();
    });

    test('just sample rate', () => {
      const from = Span.fromTraceparent('0') as any;
      expect(from._traceId).toHaveLength(32);
      expect(from._spanId).toHaveLength(16);
      expect(from.sampled).toBeFalsy();

      const from2 = Span.fromTraceparent('1') as any;
      expect(from2._traceId).toHaveLength(32);
      expect(from2._spanId).toHaveLength(16);
      expect(from2.sampled).toBeTruthy();
    });

    test('invalid', () => {
      expect(Span.fromTraceparent('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-x')).toBeUndefined();
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
      const spanB = new Span({ traceId: 'c', spanId: 'd', sampled: false, parentSpanId: spanA._spanId });
      const serialized = JSON.parse(JSON.stringify(spanB));
      expect(serialized).toHaveProperty('parent_span_id', 'b');
      expect(serialized).toHaveProperty('span_id', 'd');
      expect(serialized).toHaveProperty('trace_id', 'c');
    });
  });

  describe('finish', () => {
    test('simple', () => {
      const span = new Span({});
      expect(span.timestamp).toBeUndefined();
      span.finish();
      expect(span.timestamp).toBeGreaterThan(1);
    });

    test('finish a scope span without transaction', () => {
      const spy = jest.spyOn(hub as any, 'captureEvent');
      const span = new Span({}, hub);
      span.finish();
      expect(spy).not.toHaveBeenCalled();
    });

    test('finish a scope span with transaction', () => {
      const spy = jest.spyOn(hub as any, 'captureEvent') as any;
      const span = new Span({ transaction: 'test' }, hub);
      span.finish();
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0].spans).toBeUndefined();
    });

    test('finish a scope span with transaction + child span', () => {
      const spy = jest.spyOn(hub as any, 'captureEvent') as any;
      const parentSpan = new Span({ transaction: 'test' }, hub);
      const childSpan = parentSpan.child();
      childSpan.finish();
      parentSpan.finish();
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0].spans).toHaveLength(1);
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
      span.setSuccess();
      const context = span.getTraceContext();
      expect((context as any).status).toBe('success');
    });

    test('should have failure status extracted from tags', () => {
      const span = new Span({});
      span.setFailure();
      const context = span.getTraceContext();
      expect((context as any).status).toBe('failure');
    });
  });
});
