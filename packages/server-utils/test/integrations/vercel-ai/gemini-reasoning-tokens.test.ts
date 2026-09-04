import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { createSpanFromMessage, enrichSpanOnEnd } from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

/**
 * Real usage from a Gemini reasoning model: one candidate token, the rest of the budget spent on
 * hidden reasoning. `@ai-sdk/google` maps `outputTokens` from `candidatesTokenCount` alone, so the
 * reasoning count reaches us only through `providerMetadata`.
 */
const REASONING_METADATA = {
  google: {
    usageMetadata: { promptTokenCount: 14, candidatesTokenCount: 1, thoughtsTokenCount: 100, totalTokenCount: 115 },
  },
};

describe('Vercel AI Gemini reasoning tokens', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function setupClient(): Span[] {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
      }),
    );
    setCurrentClient(client);
    client.init();

    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    return endedSpans;
  }

  function runSpan(type: string, result: Record<string, unknown>): Record<string, unknown> {
    const endedSpans = setupClient();
    const message = { type, event: {}, result } as Parameters<typeof createSpanFromMessage>[0];
    const span = createSpanFromMessage(message, {} as Parameters<typeof createSpanFromMessage>[1]);
    enrichSpanOnEnd(span!, message, {} as Parameters<typeof enrichSpanOnEnd>[2]);
    span?.end();
    return spanToStaticSpanJSON(endedSpans[0]!).data ?? {};
  }

  it('adds reasoning tokens into output and total on a model-call span', () => {
    const data = runSpan('languageModelCall', {
      usage: { inputTokens: 14, outputTokens: 1, totalTokens: 115 },
      providerMetadata: REASONING_METADATA,
    });

    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(101);
    expect(data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(115);
    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(100);
  });

  it('reads the v6 vertex key the same way', () => {
    const data = runSpan('languageModelCall', {
      usage: { inputTokens: 14, outputTokens: 1, totalTokens: 115 },
      providerMetadata: { vertex: REASONING_METADATA.google },
    });

    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(101);
    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(100);
  });

  // Gemini omits `candidatesTokenCount` when the response is truncated during thinking, which means
  // no candidate tokens were produced. Dropping the recompute there would report zero output for a
  // call that spent its whole budget reasoning.
  it('counts an absent candidatesTokenCount as zero', () => {
    const data = runSpan('languageModelCall', {
      usage: { inputTokens: 14, outputTokens: 0, totalTokens: 514 },
      providerMetadata: {
        google: { usageMetadata: { promptTokenCount: 14, thoughtsTokenCount: 500, totalTokenCount: 514 } },
      },
    });

    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(500);
    expect(data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(514);
    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(500);
  });

  it('leaves a non-reasoning response alone', () => {
    const data = runSpan('languageModelCall', {
      usage: { inputTokens: 14, outputTokens: 12, totalTokens: 26 },
      providerMetadata: {
        google: { usageMetadata: { promptTokenCount: 14, candidatesTokenCount: 12, totalTokenCount: 26 } },
      },
    });

    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(12);
    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBeUndefined();
  });

  // A top-level operation's span reports usage summed across every step, while `providerMetadata`
  // describes the last step alone. Reasoning is gated with output and total: it is a subset of an
  // output this span never recomputes, and nothing sums it across steps.
  it('does not write last-step usage onto an invoke_agent span', () => {
    const data = runSpan('generateText', {
      usage: { inputTokens: 900, outputTokens: 350, totalTokens: 1250 },
      providerMetadata: REASONING_METADATA,
    });

    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(350);
    expect(data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(1250);
    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBeUndefined();
  });

  // OpenAI reports reasoning against an `outputTokens` that already includes it, so there is no
  // recomputed output to suppress and the subset relationship still holds on the aggregate span.
  it('keeps OpenAI reasoning tokens on an invoke_agent span', () => {
    const data = runSpan('generateText', {
      usage: { inputTokens: 900, outputTokens: 350, totalTokens: 1250 },
      providerMetadata: { openai: { reasoningTokens: 120 } },
    });

    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(350);
    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(120);
  });
});
