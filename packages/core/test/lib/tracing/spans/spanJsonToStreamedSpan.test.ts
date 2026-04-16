import { describe, expect, it } from 'vitest';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_RELEASE,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME,
  SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID,
  SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME,
  SEMANTIC_ATTRIBUTE_USER_EMAIL,
  SEMANTIC_ATTRIBUTE_USER_ID,
  SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS,
  SEMANTIC_ATTRIBUTE_USER_USERNAME,
} from '../../../../src';
import type { Event } from '../../../../src/types-hoist/event';
import type { SpanJSON } from '../../../../src/types-hoist/span';
import { spanJsonToSerializedStreamedSpan } from '../../../../src/tracing/spans/spanJsonToStreamedSpan';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

function makeSpanJSON(overrides: Partial<SpanJSON> = {}): SpanJSON {
  return {
    span_id: 'abc123def456789a',
    trace_id: '00112233445566778899aabbccddeeff',
    start_timestamp: 1000,
    data: {},
    ...overrides,
  };
}

function makeTransactionEvent(overrides: Partial<Event> = {}): Event {
  return {
    type: 'transaction',
    transaction: 'GET /api/chat',
    release: '1.0.0',
    environment: 'production',
    contexts: {
      trace: {
        span_id: 'root0000deadbeef',
        trace_id: '00112233445566778899aabbccddeeff',
      },
    },
    ...overrides,
  };
}

function makeClient(options: Partial<Parameters<typeof getDefaultTestClientOptions>[0]> = {}): TestClient {
  return new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://dsn@ingest.f00.f00/1',
      ...options,
    }),
  );
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

    const result = spanJsonToSerializedStreamedSpan(span, makeTransactionEvent(), makeClient());

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
    const span = makeSpanJSON({ description: undefined });
    const result = spanJsonToSerializedStreamedSpan(span, makeTransactionEvent(), makeClient());
    expect(result.name).toBe('');
  });

  it('uses start_timestamp as end_timestamp when timestamp is undefined', () => {
    const span = makeSpanJSON({ timestamp: undefined });
    const result = spanJsonToSerializedStreamedSpan(span, makeTransactionEvent(), makeClient());
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
      const span = makeSpanJSON({ status: v1Status });
      const result = spanJsonToSerializedStreamedSpan(span, makeTransactionEvent(), makeClient());
      expect(result.status).toBe(expected);
    }
  });

  it('folds op and origin into attributes', () => {
    const span = makeSpanJSON({
      op: 'gen_ai.chat',
      origin: 'auto.ai.openai',
    });

    const result = spanJsonToSerializedStreamedSpan(span, makeTransactionEvent(), makeClient());

    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_OP]).toEqual({ type: 'string', value: 'gen_ai.chat' });
    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual({ type: 'string', value: 'auto.ai.openai' });
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

    const result = spanJsonToSerializedStreamedSpan(span, makeTransactionEvent(), makeClient());

    expect(result.attributes?.['gen_ai.system']).toEqual({ type: 'string', value: 'openai' });
    expect(result.attributes?.['gen_ai.request.model']).toEqual({ type: 'string', value: 'gpt-4' });
    expect(result.attributes?.['gen_ai.usage.input_tokens']).toEqual({ type: 'integer', value: 100 });
    expect(result.attributes?.['gen_ai.usage.output_tokens']).toEqual({ type: 'integer', value: 50 });
  });

  it('enriches with transaction event context', () => {
    const span = makeSpanJSON();
    const event = makeTransactionEvent({
      release: '2.0.0',
      environment: 'staging',
      transaction: 'POST /api/generate',
      contexts: { trace: { span_id: 'segment0deadbeef' } },
    });

    const result = spanJsonToSerializedStreamedSpan(span, event, makeClient());

    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]).toEqual({ type: 'string', value: '2.0.0' });
    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]).toEqual({ type: 'string', value: 'staging' });
    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_NAME]).toEqual({
      type: 'string',
      value: 'POST /api/generate',
    });
    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SEGMENT_ID]).toEqual({
      type: 'string',
      value: 'segment0deadbeef',
    });
  });

  it('enriches with SDK metadata', () => {
    const client = makeClient();
    client.getOptions()._metadata = { sdk: { name: 'sentry.javascript.node', version: '9.0.0' } };

    const span = makeSpanJSON();
    const result = spanJsonToSerializedStreamedSpan(span, makeTransactionEvent(), client);

    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SDK_NAME]).toEqual({
      type: 'string',
      value: 'sentry.javascript.node',
    });
    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_SDK_VERSION]).toEqual({ type: 'string', value: '9.0.0' });
  });

  it('adds user attributes when sendDefaultPii is true', () => {
    const client = makeClient({ sendDefaultPii: true });
    const event = makeTransactionEvent({
      user: { id: 'u123', email: 'a@b.com', ip_address: '1.2.3.4', username: 'alice' },
    });

    const span = makeSpanJSON();
    const result = spanJsonToSerializedStreamedSpan(span, event, client);

    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_USER_ID]).toEqual({ type: 'string', value: 'u123' });
    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_USER_EMAIL]).toEqual({ type: 'string', value: 'a@b.com' });
    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_USER_IP_ADDRESS]).toEqual({ type: 'string', value: '1.2.3.4' });
    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_USER_USERNAME]).toEqual({ type: 'string', value: 'alice' });
  });

  it('does not add user attributes when sendDefaultPii is false', () => {
    const client = makeClient({ sendDefaultPii: false });
    const event = makeTransactionEvent({
      user: { id: 'u123', email: 'a@b.com' },
    });

    const span = makeSpanJSON();
    const result = spanJsonToSerializedStreamedSpan(span, event, client);

    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_USER_ID]).toBeUndefined();
    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_USER_EMAIL]).toBeUndefined();
  });

  it('does not overwrite pre-existing span data attributes with enrichment', () => {
    const span = makeSpanJSON({
      data: {
        [SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]: 'span-level-release',
        [SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]: 'span-level-env',
      },
    });

    const event = makeTransactionEvent({
      release: 'event-level-release',
      environment: 'event-level-env',
    });

    const result = spanJsonToSerializedStreamedSpan(span, event, makeClient());

    // Span-level values should win
    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_RELEASE]).toEqual({
      type: 'string',
      value: 'span-level-release',
    });
    expect(result.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_ENVIRONMENT]).toEqual({
      type: 'string',
      value: 'span-level-env',
    });
  });

  it('carries over links', () => {
    const span = makeSpanJSON({
      links: [{ trace_id: 'aabb', span_id: 'ccdd', sampled: true, attributes: { foo: 'bar' } }],
    });

    const result = spanJsonToSerializedStreamedSpan(span, makeTransactionEvent(), makeClient());

    expect(result.links).toEqual([
      { trace_id: 'aabb', span_id: 'ccdd', sampled: true, attributes: { foo: { type: 'string', value: 'bar' } } },
    ]);
  });
});
