import { Span, TRACEPARENT_REGEXP } from '../src';

describe('Span', () => {
  test('toTraceparent', () => {
    expect(new Span().toTraceparent()).toMatch(TRACEPARENT_REGEXP);
  });

  describe('fromTraceparent', () => {
    test('no sample', () => {
      const from = Span.fromTraceparent('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb') as any;
      expect(from._parent._traceId).toEqual('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      expect(from._parent._spanId).toEqual('bbbbbbbbbbbbbbbb');
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
  });

  test('fromTraceparent - invalid', () => {
    expect(Span.fromTraceparent('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-x')).toBeUndefined();
  });

  test('toJSON', () => {
    expect(JSON.stringify(new Span('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'))).toEqual(
      `{"span_id":"bbbbbbbbbbbbbbbb","trace_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}`,
    );
  });

  test('toJSON with parent', () => {
    const spanA = new Span('a', 'b');
    const spanB = new Span('c', 'd', false, spanA);
    expect(JSON.stringify(spanB)).toEqual(
      `{"parent":{"span_id":"b","trace_id":"a"},"sampled":false,"span_id":"d","trace_id":"c"}`,
    );
  });
});
