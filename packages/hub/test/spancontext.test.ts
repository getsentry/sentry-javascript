import { SpanContext, TRACEPARENT_REGEX } from '../src';

describe('SpanContext', () => {
  test('toTraceparent', () => {
    expect(new SpanContext().toTraceparent()).toMatch(TRACEPARENT_REGEX);
  });

  test('fromTraceparent', () => {
    const from = SpanContext.fromTraceparent('00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-00');
    expect(from!.parent!.traceId).toEqual('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(from!.parent!.spanId).toEqual('bbbbbbbbbbbbbbbb');
    expect(from!.traceId).toEqual('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(from!.spanId).not.toEqual('bbbbbbbbbbbbbbbb');
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
