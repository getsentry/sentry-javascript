import { SpanContext, TRACEPARENT_REGEX } from '../src';

describe('SpanContext', () => {
  test('toTraceparent', () => {
    expect(new SpanContext().toTraceparent()).toMatch(TRACEPARENT_REGEX);
  });

  test('fromTraceparent', () => {
    const from = SpanContext.fromTraceparent('00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-00') as any;
    expect(from._parent._traceId).toEqual('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(from._parent._spanId).toEqual('bbbbbbbbbbbbbbbb');
    expect(from._traceId).toEqual('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(from._spanId).not.toEqual('bbbbbbbbbbbbbbbb');
  });

  test('fromTraceparent - invalid', () => {
    expect(SpanContext.fromTraceparent('00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-x')).toBeUndefined();
  });

  test('toJSON', () => {
    expect(JSON.stringify(new SpanContext('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'))).toEqual(
      `{"span_id":"bbbbbbbbbbbbbbbb","trace_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}`,
    );
  });
});
