import { describe, expect, it } from 'vitest';
import type { SpanJSON, StreamedSpanJSON } from '../../../../src/types/span';
import {
  spanJsonToSerializedStreamedSpan,
  spanJsonToStreamedSpanJson,
  streamedSpanJsonToSpanJson,
} from '../../../../src/tracing/spans/spanJsonToStreamedSpan';

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

  it('carries over links', () => {
    const span = makeSpanJSON({
      links: [{ trace_id: 'aabb', span_id: 'ccdd', sampled: true, attributes: { foo: 'bar' } }],
    });

    const result = spanJsonToSerializedStreamedSpan(span);

    expect(result.links).toEqual([
      { trace_id: 'aabb', span_id: 'ccdd', sampled: true, attributes: { foo: { type: 'string', value: 'bar' } } },
    ]);
  });

  it('preserves is_segment', () => {
    expect(spanJsonToStreamedSpanJson(makeSpanJSON({ is_segment: true })).is_segment).toBe(true);
    expect(spanJsonToStreamedSpanJson(makeSpanJSON({ is_segment: undefined })).is_segment).toBe(false);
  });

  it('copies op and origin into attributes so edits to the v1 fields are kept', () => {
    const result = spanJsonToStreamedSpanJson(
      makeSpanJSON({ op: 'http.other', origin: 'manual.http', data: { 'sentry.op': 'http.client' } }),
    );

    expect(result.attributes?.['sentry.op']).toBe('http.other');
    expect(result.attributes?.['sentry.origin']).toBe('manual.http');
  });
});

describe('streamedSpanJsonToSpanJson', () => {
  function makeStreamedSpanJSON(overrides: Partial<StreamedSpanJSON> = {}): StreamedSpanJSON {
    return {
      span_id: 'abc123def456789a',
      trace_id: '00112233445566778899aabbccddeeff',
      name: 'GET /users',
      start_timestamp: 1000,
      end_timestamp: 1005,
      status: 'ok',
      is_segment: false,
      attributes: { 'sentry.op': 'http.client', 'sentry.origin': 'auto.http', 'http.url': 'https://example.com' },
      ...overrides,
    };
  }

  it('maps StreamedSpanJSON fields to the v1 SpanJSON fields', () => {
    const result = streamedSpanJsonToSpanJson(makeStreamedSpanJSON({ parent_span_id: 'parent00deadbeef' }));

    expect(result).toEqual({
      span_id: 'abc123def456789a',
      trace_id: '00112233445566778899aabbccddeeff',
      parent_span_id: 'parent00deadbeef',
      description: 'GET /users',
      start_timestamp: 1000,
      timestamp: 1005,
      status: 'ok',
      is_segment: false,
      op: 'http.client',
      origin: 'auto.http',
      links: undefined,
      data: { 'sentry.op': 'http.client', 'sentry.origin': 'auto.http', 'http.url': 'https://example.com' },
    });
  });

  it('copies attributes rather than aliasing them', () => {
    const streamedSpan = makeStreamedSpanJSON();
    const result = streamedSpanJsonToSpanJson(streamedSpan);

    result.data['http.url'] = '[Filtered]';

    expect(streamedSpan.attributes?.['http.url']).toBe('https://example.com');
  });

  it('handles a span without attributes', () => {
    const result = streamedSpanJsonToSpanJson(makeStreamedSpanJSON({ attributes: undefined }));

    expect(result.data).toEqual({});
    expect(result.op).toBeUndefined();
    expect(result.origin).toBeUndefined();
  });

  it.each([
    ['a segment span', true],
    ['a child span', false],
  ])('round-trips %s unchanged', (_, is_segment) => {
    const streamedSpan = makeStreamedSpanJSON({
      is_segment,
      status: 'error',
      parent_span_id: 'parent00deadbeef',
      links: [{ trace_id: 'aabb', span_id: 'ccdd', sampled: true, attributes: { foo: 'bar' } }],
    });

    expect(spanJsonToStreamedSpanJson(streamedSpanJsonToSpanJson(streamedSpan))).toEqual(streamedSpan);
  });

  it('round-trips modifications made in the v1 format back into the streamed format', () => {
    const streamedSpan = makeStreamedSpanJSON();

    const spanJson = streamedSpanJsonToSpanJson(streamedSpan);
    spanJson.description = 'redacted';
    spanJson.data['http.url'] = '[Filtered]';
    spanJson.op = 'http.other';

    const result = spanJsonToStreamedSpanJson(spanJson);

    expect(result.name).toBe('redacted');
    expect(result.attributes?.['http.url']).toBe('[Filtered]');
    expect(result.attributes?.['sentry.op']).toBe('http.other');
  });
});
