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

  it('counts an absent candidatesTokenCount as zero', () => {
    // Gemini omits `candidatesTokenCount` when the response is truncated during thinking, which
    // means no candidate tokens were produced. Treating it as zero keeps the reasoning tokens in
    // the output rather than dropping the whole recompute and reporting the candidate-only count.
    const [processed] = processSpans([
      span('ai.generateText.doGenerate', {
        'ai.usage.completionTokens': 1,
        'ai.response.providerMetadata': JSON.stringify({
          google: { usageMetadata: { promptTokenCount: 14, thoughtsTokenCount: 100, totalTokenCount: 115 } },
        }),
      }),
    ]);

    expect(processed?.data?.['gen_ai.usage.output_tokens']).toBe(100);
    expect(processed?.data?.['gen_ai.usage.total_tokens']).toBe(115);
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
    expect(parent?.data?.['gen_ai.usage.total_tokens']).toBe(1250);
    // Reasoning is a subset of an output this span never recomputes, so it is left off entirely
    // rather than reporting the last step's count against the summed output.
    expect(parent?.data?.['gen_ai.usage.reasoning.output_tokens']).toBeUndefined();
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
    expect(parent?.data?.['gen_ai.usage.output_tokens']).toBe(350);
    expect(parent?.data?.['gen_ai.usage.total_tokens']).toBe(1250);
    // The last step's 100 would stand in for the call's real 180, and nothing sums it, so it is
    // left off rather than reported.
    expect(parent?.data?.['gen_ai.usage.reasoning.output_tokens']).toBeUndefined();
  });

  it('holds on the streamed path, which has no accumulation pass to repair the parent', () => {
    // The event processor sees the whole transaction and re-derives an `invoke_agent` parent from
    // its children; `processSpan` sees one span at a time and ships whatever it produced. This is
    // the path the gate actually protects.
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1.0 }));
    client.init();
    addVercelAiProcessors(client);

    const streamed = (attrs: Record<string, unknown>): Record<string, unknown> => {
      const span = { span_id: 's', trace_id: 't', attributes: { 'sentry.origin': 'auto.vercelai.otel', ...attrs } };
      client.emit('processSpan', span as never);
      return span.attributes;
    };

    const parent = streamed({
      'operation.name': 'ai.generateText',
      'ai.usage.inputTokens': 14,
      'ai.usage.outputTokens': 1,
      'ai.response.providerMetadata': JSON.stringify(GEMINI_REASONING_METADATA),
    });
    const child = streamed({
      'operation.name': 'ai.generateText.doGenerate',
      'ai.usage.promptTokens': 14,
      'ai.usage.completionTokens': 1,
      'ai.response.providerMetadata': JSON.stringify(GEMINI_REASONING_METADATA),
    });

    expect(child['gen_ai.usage.output_tokens']).toBe(101);
    expect(child['gen_ai.usage.total_tokens']).toBe(115);
    expect(child['gen_ai.usage.reasoning.output_tokens']).toBe(100);

    // No reasoning count larger than the output it is meant to be a subset of.
    expect(parent['gen_ai.usage.output_tokens']).toBe(1);
    expect(parent['gen_ai.usage.reasoning.output_tokens']).toBeUndefined();
  });
});
