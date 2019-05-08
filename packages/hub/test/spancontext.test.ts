import { Span, TRACEPARENT_REGEXP } from '../src';

describe('Span', () => {
  test('toTraceparent', () => {
    expect(new Span().toTraceparent()).toMatch(TRACEPARENT_REGEXP);
  });

  test('fromTraceparent', () => {
    const from = Span.fromTraceparent('00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-00') as any;
    expect(from._parent._traceId).toEqual('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(from._parent._spanId).toEqual('bbbbbbbbbbbbbbbb');
    expect(from._traceId).toEqual('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(from._spanId).not.toEqual('bbbbbbbbbbbbbbbb');
  });

  test('fromTraceparent - invalid', () => {
    expect(Span.fromTraceparent('00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-x')).toBeUndefined();
  });

  test('toJSON', () => {
    expect(JSON.stringify(new Span('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'))).toEqual(
      `{"span_id":"bbbbbbbbbbbbbbbb","trace_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}`,
    );
  });
});
