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
    enrichSpanOnEnd(span!, message);
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
  // describes the last step alone.
  it('does not write last-step usage onto an invoke_agent span', () => {
    const data = runSpan('generateText', {
      usage: { inputTokens: 900, outputTokens: 350, totalTokens: 1250 },
      providerMetadata: REASONING_METADATA,
    });

    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(350);
    expect(data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(1250);
    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBeUndefined();
  });

  it('does not write last-step OpenAI reasoning onto an invoke_agent span', () => {
    const data = runSpan('generateText', {
      usage: { inputTokens: 900, outputTokens: 350, totalTokens: 1250 },
      providerMetadata: { openai: { reasoningTokens: 120 } },
    });

    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(350);
    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBeUndefined();
  });

  describe('reasoning from the SDK usage', () => {
    it('reads v7 model-call reasoning for any provider', () => {
      const data = runSpan('languageModelCall', {
        usage: { inputTokens: { total: 14 }, outputTokens: { total: 90, text: 30, reasoning: 60 } },
        providerMetadata: { xai: {} },
      });

      expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(90);
      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(60);
    });

    it('writes the summed reasoning onto an invoke_agent span (v6+)', () => {
      const data = runSpan('generateText', {
        usage: {
          inputTokens: 20,
          outputTokens: 220,
          outputTokenDetails: { textTokens: 40, reasoningTokens: 180 },
          totalTokens: 240,
        },
        providerMetadata: REASONING_METADATA,
      });

      expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(220);
      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(180);
    });

    // v5/v6 `generateText` results expose the last step's usage as `usage` and the sum as `totalUsage`.
    it('reads totalUsage over the last step usage', () => {
      const data = runSpan('generateText', {
        usage: { inputTokens: 10, outputTokens: 120, outputTokenDetails: { reasoningTokens: 100 } },
        totalUsage: { inputTokens: 20, outputTokens: 220, outputTokenDetails: { reasoningTokens: 180 } },
      });

      expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(220);
      expect(data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(240);
      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(180);
    });

    it('prefers the summed reasoning over last-step OpenAI metadata (v6+)', () => {
      const data = runSpan('generateText', {
        usage: { inputTokens: 900, outputTokens: 350, outputTokenDetails: { reasoningTokens: 200 } },
        providerMetadata: { openai: { reasoningTokens: 120 } },
      });

      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(200);
    });

    it('does not record zero reasoning', () => {
      const data = runSpan('languageModelCall', {
        usage: { inputTokens: { total: 14 }, outputTokens: { total: 12, text: 12, reasoning: 0 } },
      });

      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBeUndefined();
    });

    // `@ai-sdk/google` 2.x reports candidate-only `outputTokens` next to a separate `reasoningTokens`.
    it('adds v5 Google reasoning into the invoke_agent output', () => {
      const data = runSpan('generateText', {
        usage: { inputTokens: 900, outputTokens: 21, reasoningTokens: 180, totalTokens: 1101 },
        providerMetadata: REASONING_METADATA,
      });

      expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(201);
      expect(data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(1101);
      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(180);
    });

    it('keeps v5 OpenAI output, which already includes reasoning', () => {
      const data = runSpan('generateText', {
        usage: { inputTokens: 900, outputTokens: 350, reasoningTokens: 200, totalTokens: 1250 },
        providerMetadata: { openai: { reasoningTokens: 120 } },
      });

      expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(350);
      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(200);
    });

    it('ignores v5 reasoning from a provider whose output it may not be part of', () => {
      const data = runSpan('generateText', {
        usage: { inputTokens: 900, outputTokens: 350, reasoningTokens: 200, totalTokens: 1250 },
        providerMetadata: { xai: {} },
      });

      expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(350);
      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBeUndefined();
    });
  });
});
