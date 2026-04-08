import { describe, expect, it } from 'vitest';
import { addVercelAiProcessors } from '../../../src/tracing/vercel-ai';
import type { SpanJSON } from '../../../src/types-hoist/span';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('vercel-ai parent span token attributes', () => {
  it('should map ai.usage.inputTokens to gen_ai.usage.input_tokens', () => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
    const client = new TestClient(options);
    client.init();
    addVercelAiProcessors(client);

    const mockSpan: SpanJSON = {
      description: 'ai.streamText',
      span_id: 'test-span-id',
      trace_id: 'test-trace-id',
      start_timestamp: 1000,
      timestamp: 2000,
      origin: 'auto.vercelai.otel',
      data: {
        'ai.usage.inputTokens': 100,
        'ai.usage.outputTokens': 50,
      },
    };

    const event = {
      type: 'transaction' as const,
      spans: [mockSpan],
    };

    const eventProcessor = client['_eventProcessors'].find(processor => processor.id === 'VercelAiEventProcessor');
    expect(eventProcessor).toBeDefined();

    const processedEvent = eventProcessor!(event, {});

    expect(processedEvent?.spans?.[0]?.data?.['gen_ai.usage.input_tokens']).toBe(100);
    expect(processedEvent?.spans?.[0]?.data?.['gen_ai.usage.output_tokens']).toBe(50);
    // Original attributes should be renamed to vercel.ai.* namespace
    expect(processedEvent?.spans?.[0]?.data?.['ai.usage.inputTokens']).toBeUndefined();
    expect(processedEvent?.spans?.[0]?.data?.['ai.usage.outputTokens']).toBeUndefined();
  });

  it('should map ai.response.avgOutputTokensPerSecond to ai.response.avgCompletionTokensPerSecond', () => {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
    const client = new TestClient(options);
    client.init();
    addVercelAiProcessors(client);

    const mockSpan: SpanJSON = {
      description: 'ai.streamText.doStream',
      span_id: 'test-span-id',
      trace_id: 'test-trace-id',
      start_timestamp: 1000,
      timestamp: 2000,
      origin: 'auto.vercelai.otel',
      data: {
        'ai.response.avgOutputTokensPerSecond': 25.5,
      },
    };

    const event = {
      type: 'transaction' as const,
      spans: [mockSpan],
    };

    const eventProcessor = client['_eventProcessors'].find(processor => processor.id === 'VercelAiEventProcessor');
    expect(eventProcessor).toBeDefined();

    const processedEvent = eventProcessor!(event, {});

    // Should be renamed to match the expected attribute name
    expect(processedEvent?.spans?.[0]?.data?.['vercel.ai.response.avgCompletionTokensPerSecond']).toBe(25.5);
    expect(processedEvent?.spans?.[0]?.data?.['ai.response.avgOutputTokensPerSecond']).toBeUndefined();
  });
});
