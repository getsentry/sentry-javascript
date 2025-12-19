import { describe, expect, it } from 'vitest';
import { addVercelAiProcessors } from '../../../src/tracing/vercel-ai';
import type { SpanJSON } from '../../../src/types-hoist/span';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('vercel-ai cached tokens', () => {
  it('should add cached input tokens to total input tokens', () => {
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
      data: {
        'ai.usage.promptTokens': 100,
        'ai.usage.cachedInputTokens': 50,
      },
    };

    const event = {
      type: 'transaction' as const,
      spans: [mockSpan],
    };

    const eventProcessor = client['_eventProcessors'].find(processor => processor.id === 'VercelAiEventProcessor');
    expect(eventProcessor).toBeDefined();

    const processedEvent = eventProcessor!(event, {});

    expect(processedEvent?.spans?.[0]?.data?.['gen_ai.usage.input_tokens']).toBe(150);
    expect(processedEvent?.spans?.[0]?.data?.['gen_ai.usage.input_tokens.cached']).toBe(50);
  });
});
