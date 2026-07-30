import { describe, expect, it } from 'vitest';
import type { SpanJSON } from '../../../../src/types/span';
import { spanJsonToSerializedStreamedSpan } from '../../../../src/tracing/spans/spanJsonToStreamedSpan';

function makeSpanJSON(overrides: Partial<SpanJSON> = {}): SpanJSON {
  return {
    span_id: 'abc123def456789a',
    trace_id: '00112233445566778899aabbccddeeff',
    start_timestamp: 1000,
    data: {},
    ...overrides,
  };
}

describe('spanJsonToSerializedStreamedSpan', () => {
  it('maps basic SpanJSON fields to StreamedSpan fields', () => {
    const span = makeSpanJSON({
      description: 'chat gpt-4',
      timestamp: 1005,
      status: 'ok',
      op: 'gen_ai.chat',
      origin: 'auto.ai.openai',
      parent_span_id: 'parent00deadbeef',
    });

    const result = spanJsonToSerializedStreamedSpan(span);

    expect(result.name).toBe('chat gpt-4');
    expect(result.start_timestamp).toBe(1000);
    expect(result.end_timestamp).toBe(1005);
    expect(result.status).toBe('ok');
    expect(result.is_segment).toBe(false);
    expect(result.span_id).toBe('abc123def456789a');
    expect(result.trace_id).toBe('00112233445566778899aabbccddeeff');
    expect(result.parent_span_id).toBe('parent00deadbeef');
  });

  it('uses empty string for name when description is undefined', () => {
    const result = spanJsonToSerializedStreamedSpan(makeSpanJSON({ description: undefined }));
    expect(result.name).toBe('');
  });

  it('uses start_timestamp as end_timestamp when timestamp is undefined', () => {
    const result = spanJsonToSerializedStreamedSpan(makeSpanJSON({ timestamp: undefined }));
    expect(result.end_timestamp).toBe(1000);
  });

  it('maps v1 status strings to v2 ok/error', () => {
    const cases: Array<[string | undefined, 'ok' | 'error']> = [
      [undefined, 'ok'],
      ['ok', 'ok'],
      ['cancelled', 'ok'],
      ['internal_error', 'error'],
      ['not_found', 'error'],
      ['unknown_error', 'error'],
    ];

    for (const [v1Status, expected] of cases) {
      const result = spanJsonToSerializedStreamedSpan(makeSpanJSON({ status: v1Status }));
      expect(result.status).toBe(expected);
    }
  });

  it('preserves existing span data attributes', () => {
    const span = makeSpanJSON({
      data: {
        'gen_ai.system': 'openai',
        'gen_ai.request.model': 'gpt-4',
        'gen_ai.usage.input_tokens': 100,
        'gen_ai.usage.output_tokens': 50,
      },
    });

    const result = spanJsonToSerializedStreamedSpan(span);

    expect(result.attributes['gen_ai.system']).toEqual({ type: 'string', value: 'openai' });
    expect(result.attributes['gen_ai.request.model']).toEqual({ type: 'string', value: 'gpt-4' });
    expect(result.attributes['gen_ai.usage.input_tokens']).toEqual({ type: 'integer', value: 100 });
    expect(result.attributes['gen_ai.usage.output_tokens']).toEqual({ type: 'integer', value: 50 });
  });

  it('maps top-level op/origin into sentry.op/sentry.origin attributes', () => {
    const span = makeSpanJSON({ op: 'ui.interaction.click', origin: 'auto.http.browser.inp', data: {} });

    const result = spanJsonToSerializedStreamedSpan(span);

    expect(result.attributes['sentry.op']).toEqual({ type: 'string', value: 'ui.interaction.click' });
    expect(result.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.browser.inp' });
  });

  it('lets a mutated top-level op/origin win over the original data attribute', () => {
    // A `beforeSendSpan` callback mutates the top-level field while the data attribute stays stale.
    const span = makeSpanJSON({
      op: 'changed.op',
      origin: 'changed.origin',
      data: { 'sentry.op': 'stale.op', 'sentry.origin': 'stale.origin' },
    });

    const result = spanJsonToSerializedStreamedSpan(span);

    expect(result.attributes['sentry.op']).toEqual({ type: 'string', value: 'changed.op' });
    expect(result.attributes['sentry.origin']).toEqual({ type: 'string', value: 'changed.origin' });
  });

  it('keeps the data attribute when there is no top-level op/origin', () => {
    const span = makeSpanJSON({ op: undefined, origin: undefined, data: { 'sentry.op': 'from.data' } });

    const result = spanJsonToSerializedStreamedSpan(span);

    expect(result.attributes['sentry.op']).toEqual({ type: 'string', value: 'from.data' });
    expect(result.attributes['sentry.origin']).toBeUndefined();
  });

  it('maps mutated top-level profile_id/exclusive_time back into attributes', () => {
    const span = makeSpanJSON({
      profile_id: 'new-profile',
      exclusive_time: 42,
      data: { 'sentry.profile_id': 'stale-profile', 'sentry.exclusive_time': 1 },
    });

    const result = spanJsonToSerializedStreamedSpan(span);

    expect(result.attributes['sentry.profile_id']).toEqual({ type: 'string', value: 'new-profile' });
    expect(result.attributes['sentry.exclusive_time']).toEqual({ type: 'integer', value: 42 });
  });

  it('carries over links', () => {
    const span = makeSpanJSON({
      links: [{ trace_id: 'aabb', span_id: 'ccdd', sampled: true, attributes: { foo: 'bar' } }],
    });

    const result = spanJsonToSerializedStreamedSpan(span);

    expect(result.links).toEqual([
      { trace_id: 'aabb', span_id: 'ccdd', sampled: true, attributes: { foo: { type: 'string', value: 'bar' } } },
    ]);
  });
});
