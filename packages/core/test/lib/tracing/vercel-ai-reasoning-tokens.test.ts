import { describe, expect, it } from 'vitest';
import { addVercelAiProcessors } from '../../../src/tracing/vercel-ai';
import type { SpanJSON } from '../../../src/types/span';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

/**
 * Real usage from a Gemini reasoning model: the candidate output is one token and the model spent
 * the rest of its budget on hidden reasoning ("thoughts"). The AI SDK reports the candidate count
 * as `outputTokens` and exposes the reasoning count only through
 * `providerMetadata.google.usageMetadata`, so a span built from `ai.usage.*` alone undercounts
 * output by 100 and undercounts the total by the same.
 */
const GEMINI_REASONING_METADATA = {
  google: {
    groundingMetadata: null,
    safetyRatings: null,
    usageMetadata: {
      promptTokenCount: 14,
      candidatesTokenCount: 1,
      thoughtsTokenCount: 100,
      totalTokenCount: 115,
    },
  },
};

function processSpans(spans: SpanJSON[]): SpanJSON[] {
  const options = getDefaultTestClientOptions({ tracesSampleRate: 1.0 });
  const client = new TestClient(options);
  client.init();
  addVercelAiProcessors(client);

  const eventProcessor = client['_eventProcessors'].find(processor => processor.id === 'VercelAiEventProcessor');
  expect(eventProcessor).toBeDefined();

  return eventProcessor!({ type: 'transaction' as const, spans }, {})!.spans!;
}

function span(description: string, data: SpanJSON['data'], spanId = 'span-1', parentSpanId?: string): SpanJSON {
  return {
    description,
    span_id: spanId,
    parent_span_id: parentSpanId,
    trace_id: 'test-trace-id',
    start_timestamp: 1000,
    timestamp: 2000,
    origin: 'auto.vercelai.otel',
    data,
  };
}

describe('vercel-ai Gemini reasoning tokens', () => {
  it('adds reasoning tokens into output and total on a model span', () => {
    const [processed] = processSpans([
      span('ai.generateText.doGenerate', {
        'ai.usage.promptTokens': 14,
        'ai.usage.completionTokens': 1,
        'ai.response.providerMetadata': JSON.stringify(GEMINI_REASONING_METADATA),
      }),
    ]);

    expect(processed?.data?.['gen_ai.usage.input_tokens']).toBe(14);
    // Output covers the 100 reasoning tokens, not just the single candidate token.
    expect(processed?.data?.['gen_ai.usage.output_tokens']).toBe(101);
    expect(processed?.data?.['gen_ai.usage.reasoning.output_tokens']).toBe(100);
    // The real Gemini total, not input plus candidate-only output, which would be 15.
    expect(processed?.data?.['gen_ai.usage.total_tokens']).toBe(115);
  });

  it('reads the v6 vertex key the same way', () => {
    const [processed] = processSpans([
      span('ai.generateText.doGenerate', {
        'ai.usage.completionTokens': 1,
        'ai.response.providerMetadata': JSON.stringify({ vertex: GEMINI_REASONING_METADATA.google }),
      }),
    ]);

    expect(processed?.data?.['gen_ai.usage.output_tokens']).toBe(101);
    expect(processed?.data?.['gen_ai.usage.reasoning.output_tokens']).toBe(100);
  });

  it('leaves output and total alone when candidatesTokenCount is absent', () => {
    // `candidatesTokenCount` is optional in the Gemini response. Without it there is no candidate
    // count to add reasoning to, so rewriting the total on its own would leave a span whose
    // thoughts-inclusive total does not match its candidate-only output.
    const [processed] = processSpans([
      span('ai.generateText.doGenerate', {
        'ai.usage.completionTokens': 1,
        'ai.response.providerMetadata': JSON.stringify({
          google: { usageMetadata: { promptTokenCount: 14, thoughtsTokenCount: 100, totalTokenCount: 115 } },
        }),
      }),
    ]);

    expect(processed?.data?.['gen_ai.usage.output_tokens']).toBe(1);
    expect(processed?.data?.['gen_ai.usage.total_tokens']).toBeUndefined();
    // The reasoning count is still reported: nothing else on the span carries it.
    expect(processed?.data?.['gen_ai.usage.reasoning.output_tokens']).toBe(100);
  });

  it('does not overwrite an invoke_agent parent aggregate from the last step', () => {
    // The parent carries the summed usage of both steps; providerMetadata describes step two only.
    // Writing output or total from it would report step two's figures against the summed input.
    const [parent] = processSpans([
      span('ai.generateText', {
        'operation.name': 'ai.generateText',
        'ai.usage.promptTokens': 900,
        'ai.usage.completionTokens': 350,
        'ai.response.providerMetadata': JSON.stringify(GEMINI_REASONING_METADATA),
      }),
    ]);

    expect(parent?.data?.['gen_ai.operation.name']).toBe('invoke_agent');
    expect(parent?.data?.['gen_ai.usage.input_tokens']).toBe(900);
    expect(parent?.data?.['gen_ai.usage.output_tokens']).toBe(350);
    expect(parent?.data?.['gen_ai.usage.total_tokens']).not.toBe(115);
    // The reasoning count is not an aggregate, so it survives and is the only place it appears.
    expect(parent?.data?.['gen_ai.usage.reasoning.output_tokens']).toBe(100);
  });

  it('keeps a multi-step call consistent: the parent sums, each step reports its own reasoning', () => {
    const stepOne = {
      google: {
        usageMetadata: {
          promptTokenCount: 400,
          candidatesTokenCount: 20,
          thoughtsTokenCount: 80,
          totalTokenCount: 500,
        },
      },
    };
    const processed = processSpans([
      span(
        'ai.generateText',
        {
          'operation.name': 'ai.generateText',
          'ai.usage.promptTokens': 900,
          'ai.usage.completionTokens': 350,
          'ai.response.providerMetadata': JSON.stringify(GEMINI_REASONING_METADATA),
        },
        'parent',
      ),
      span(
        'ai.generateText.doGenerate',
        {
          'ai.usage.promptTokens': 400,
          'ai.usage.completionTokens': 20,
          'ai.response.providerMetadata': JSON.stringify(stepOne),
        },
        'step-1',
        'parent',
      ),
      span(
        'ai.generateText.doGenerate',
        {
          'ai.usage.promptTokens': 500,
          'ai.usage.completionTokens': 1,
          'ai.response.providerMetadata': JSON.stringify(GEMINI_REASONING_METADATA),
        },
        'step-2',
        'parent',
      ),
    ]);

    const [parent, first, second] = processed;

    // Each step gets its own reasoning-inclusive figures.
    expect(first?.data?.['gen_ai.usage.output_tokens']).toBe(100);
    expect(first?.data?.['gen_ai.usage.reasoning.output_tokens']).toBe(80);
    expect(second?.data?.['gen_ai.usage.output_tokens']).toBe(101);
    expect(second?.data?.['gen_ai.usage.reasoning.output_tokens']).toBe(100);

    // The parent keeps an aggregate whose parts add up, rather than step two's 101 and 115.
    expect(parent?.data?.['gen_ai.usage.input_tokens']).toBe(900);
    expect(parent?.data?.['gen_ai.usage.output_tokens']).not.toBe(101);
    expect(parent?.data?.['gen_ai.usage.total_tokens']).not.toBe(115);
  });
});
