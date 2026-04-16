import { describe, expect, it } from 'vitest';
import type { Event } from '../../../../src/types-hoist/event';
import type { SpanJSON } from '../../../../src/types-hoist/span';
import { extractGenAiSpansFromEvent } from '../../../../src/tracing/spans/extractGenAiSpans';
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

function makeTransactionEvent(spans: SpanJSON[]): Event {
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
    spans,
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

describe('extractGenAiSpansFromEvent', () => {
  it('extracts gen_ai spans and removes them from the event', () => {
    const genAiSpan = makeSpanJSON({
      span_id: 'genai001',
      op: 'gen_ai.chat',
      description: 'chat gpt-4',
      timestamp: 1005,
    });
    const httpSpan = makeSpanJSON({
      span_id: 'http001',
      op: 'http.client',
      description: 'GET /api',
      timestamp: 1002,
    });

    const event = makeTransactionEvent([genAiSpan, httpSpan]);
    const client = makeClient();

    const result = extractGenAiSpansFromEvent(event, client);

    // gen_ai spans should be in the container item
    expect(result).toBeDefined();
    const [headers, payload] = result!;
    expect(headers.type).toBe('span');
    expect(headers.item_count).toBe(1);
    expect(headers.content_type).toBe('application/vnd.sentry.items.span.v2+json');
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]!.span_id).toBe('genai001');
    expect(payload.items[0]!.name).toBe('chat gpt-4');

    // gen_ai spans should be removed from the event
    expect(event.spans).toHaveLength(1);
    expect(event.spans![0]!.span_id).toBe('http001');
  });

  it('extracts multiple gen_ai spans', () => {
    const chatSpan = makeSpanJSON({ span_id: 'chat001', op: 'gen_ai.chat', description: 'chat' });
    const embeddingsSpan = makeSpanJSON({ span_id: 'embed001', op: 'gen_ai.embeddings', description: 'embed' });
    const agentSpan = makeSpanJSON({ span_id: 'agent001', op: 'gen_ai.invoke_agent', description: 'agent' });
    const dbSpan = makeSpanJSON({ span_id: 'db001', op: 'db.query', description: 'SELECT *' });

    const event = makeTransactionEvent([chatSpan, embeddingsSpan, dbSpan, agentSpan]);
    const client = makeClient();

    const result = extractGenAiSpansFromEvent(event, client);

    expect(result).toBeDefined();
    expect(result![0].item_count).toBe(3);
    expect(result![1].items).toHaveLength(3);
    expect(result![1].items.map(s => s.span_id)).toEqual(['chat001', 'embed001', 'agent001']);

    // Only the db span should remain
    expect(event.spans).toHaveLength(1);
    expect(event.spans![0]!.span_id).toBe('db001');
  });

  it('returns undefined when there are no gen_ai spans', () => {
    const httpSpan = makeSpanJSON({ op: 'http.client' });
    const dbSpan = makeSpanJSON({ op: 'db.query' });

    const event = makeTransactionEvent([httpSpan, dbSpan]);
    const client = makeClient();

    const result = extractGenAiSpansFromEvent(event, client);

    expect(result).toBeUndefined();
    expect(event.spans).toHaveLength(2);
  });

  it('returns undefined when event has no spans', () => {
    const event = makeTransactionEvent([]);
    const client = makeClient();

    expect(extractGenAiSpansFromEvent(event, client)).toBeUndefined();
  });

  it('returns undefined when event is not a transaction', () => {
    const event: Event = { type: undefined, spans: [makeSpanJSON({ op: 'gen_ai.chat' })] };
    const client = makeClient();

    expect(extractGenAiSpansFromEvent(event, client)).toBeUndefined();
  });

  it('returns undefined when span streaming is enabled', () => {
    const event = makeTransactionEvent([makeSpanJSON({ op: 'gen_ai.chat' })]);
    const client = makeClient({ traceLifecycle: 'stream' });

    expect(extractGenAiSpansFromEvent(event, client)).toBeUndefined();
    // Spans should not be modified
    expect(event.spans).toHaveLength(1);
  });

  it('preserves parent_span_id pointing to v1 spans', () => {
    const genAiSpan = makeSpanJSON({
      span_id: 'genai001',
      parent_span_id: 'http001',
      op: 'gen_ai.chat',
    });
    const httpSpan = makeSpanJSON({
      span_id: 'http001',
      op: 'http.client',
    });

    const event = makeTransactionEvent([httpSpan, genAiSpan]);
    const client = makeClient();

    const result = extractGenAiSpansFromEvent(event, client);

    // The v2 span should still reference the v1 parent
    expect(result![1].items[0]!.parent_span_id).toBe('http001');
    // The v1 parent should remain in the transaction
    expect(event.spans).toHaveLength(1);
    expect(event.spans![0]!.span_id).toBe('http001');
  });
});
