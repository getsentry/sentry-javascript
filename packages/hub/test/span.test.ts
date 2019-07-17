import { Span, TRACEPARENT_REGEXP } from '../src';

describe('Span', () => {
  test('toTraceparent', () => {
    expect(new Span().toTraceparent()).toMatch(TRACEPARENT_REGEXP);
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
  });

  test('fromTraceparent - invalid', () => {
    expect(Span.fromTraceparent('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-x')).toBeUndefined();
  });

  test('toJSON', () => {
    const span = JSON.parse(
      JSON.stringify(new Span({ traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: 'bbbbbbbbbbbbbbbb' })),
    );
    expect(span).toHaveProperty('span_id', 'bbbbbbbbbbbbbbbb');
    expect(span).toHaveProperty('trace_id', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  test('toJSON with parent', () => {
    const spanA = new Span({ traceId: 'a', spanId: 'b' }) as any;
    const spanB = new Span({ traceId: 'c', spanId: 'd', sampled: false, parentSpanId: spanA._spanId });
    const serialized = JSON.parse(JSON.stringify(spanB));
    expect(serialized).toHaveProperty('parent_span_id', 'b');
    expect(serialized).toHaveProperty('span_id', 'd');
    expect(serialized).toHaveProperty('trace_id', 'c');
  });
});
