import { describe, expect, it } from 'vitest';
import { addVercelAiProcessors } from '../../../src/tracing/vercel-ai';
import type { SpanJSON } from '../../../src/types/span';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

function processSpan(data: SpanJSON['data']): SpanJSON {
  const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
  const client = new TestClient(options);
  client.init();
  addVercelAiProcessors(client);

  const mockSpan: SpanJSON = {
    description: 'test',
    span_id: 'test-span-id',
    trace_id: 'test-trace-id',
    start_timestamp: 1000,
    timestamp: 2000,
    origin: 'auto.vercelai.otel',
    data,
  };

  const event = {
    type: 'transaction' as const,
    spans: [mockSpan],
  };

  const eventProcessor = client['_eventProcessors'].find(processor => processor.id === 'VercelAiEventProcessor');
  expect(eventProcessor).toBeDefined();

  return eventProcessor!(event, {})!.spans![0]!;
}

describe('vercel-ai cached tokens', () => {
  it('adds cached input tokens to the input tokens for AI SDK <=5 (cache-exclusive input tokens)', () => {
    const span = processSpan({
      'ai.usage.promptTokens': 100,
      'ai.usage.cachedInputTokens': 50,
    });

    expect(span.data?.['gen_ai.usage.input_tokens']).toBe(150);
    expect(span.data?.['gen_ai.usage.input_tokens.cached']).toBe(50);
    expect(span.data?.['gen_ai.usage.total_tokens']).toBe(150);
  });

  it('does not double-count cached input tokens for AI SDK v6 (cache-inclusive input tokens)', () => {
    // AI SDK v6 reports `ai.usage.inputTokens` as a cache-inclusive total
    // (noCache + cacheRead + cacheWrite) and emits the breakdown under
    // `ai.usage.inputTokenDetails.*`. The cached tokens must not be added again.
    const span = processSpan({
      'ai.operationId': 'ai.streamText.doStream',
      'ai.usage.inputTokens': 9500, // 1000 noCache + 8000 cacheRead + 500 cacheWrite
      'ai.usage.outputTokens': 300,
      'ai.usage.cachedInputTokens': 8000,
      'ai.usage.inputTokenDetails.noCacheTokens': 1000,
      'ai.usage.inputTokenDetails.cacheReadTokens': 8000,
      'ai.usage.inputTokenDetails.cacheWriteTokens': 500,
    });

    expect(span.data?.['gen_ai.usage.input_tokens']).toBe(9500);
    expect(span.data?.['gen_ai.usage.input_tokens.cached']).toBe(8000);
    expect(span.data?.['gen_ai.usage.output_tokens']).toBe(300);
    expect(span.data?.['gen_ai.usage.total_tokens']).toBe(9800);
  });
});
