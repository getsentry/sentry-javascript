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

  it('reads v7 model-call reasoning for any provider', () => {
    const data = runSpan('languageModelCall', {
      usage: { inputTokens: { total: 14 }, outputTokens: { total: 90, text: 30, reasoning: 60 } },
      providerMetadata: { xai: {} },
    });

    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(90);
    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(60);
  });

  // `@ai-sdk/openai` 2.x reports reasoning only in the usage, not in `providerMetadata`.
  it('reads v5 OpenAI model-call reasoning from the usage', () => {
    const data = runSpan('languageModelCall', {
      usage: { inputTokens: 14, outputTokens: 350, reasoningTokens: 200, totalTokens: 364 },
      providerMetadata: { openai: {} },
    });

    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(350);
    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(200);
  });

  it('ignores v5 reasoning from a provider whose output it may not be part of', () => {
    const data = runSpan('languageModelCall', {
      usage: { inputTokens: 14, outputTokens: 350, reasoningTokens: 200, totalTokens: 564 },
      providerMetadata: { xai: {} },
    });

    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(350);
    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBeUndefined();
  });

  it('records zero reasoning', () => {
    const data = runSpan('languageModelCall', {
      usage: { inputTokens: { total: 14 }, outputTokens: { total: 12, text: 12, reasoning: 0 } },
    });

    expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(0);
  });

  describe('invoke_agent spans', () => {
    function googleStep(candidates: number, thoughts: number, usage: Record<string, unknown>) {
      return {
        usage,
        providerMetadata: {
          google: {
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: candidates,
              thoughtsTokenCount: thoughts,
              totalTokenCount: 10 + candidates + thoughts,
            },
          },
        },
      };
    }

    // `providerMetadata` describes the last step alone, so each step is read on its own.
    it('sums each step rather than reading the last step (v6+)', () => {
      const steps = [
        googleStep(20, 80, { outputTokens: 100, outputTokenDetails: { reasoningTokens: 80 } }),
        googleStep(20, 100, { outputTokens: 120, outputTokenDetails: { reasoningTokens: 100 } }),
      ];
      const data = runSpan('generateText', {
        usage: steps[1]!.usage,
        totalUsage: { inputTokens: 20, outputTokens: 220, totalTokens: 240 },
        providerMetadata: steps[1]!.providerMetadata,
        steps,
      });

      expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(220);
      expect(data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(240);
      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(180);
    });

    // `@ai-sdk/google` 2.x reports candidate-only `outputTokens` next to a separate `reasoningTokens`.
    it('adds reasoning into the output of v5 Google steps', () => {
      const steps = [
        googleStep(20, 80, { outputTokens: 20, reasoningTokens: 80 }),
        googleStep(20, 100, { outputTokens: 20, reasoningTokens: 100 }),
      ];
      const data = runSpan('generateText', {
        totalUsage: { inputTokens: 20, outputTokens: 40, reasoningTokens: 180, totalTokens: 240 },
        providerMetadata: steps[1]!.providerMetadata,
        steps,
      });

      expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(220);
      expect(data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(240);
      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(180);
    });

    it('reads each step by its own provider', () => {
      const openaiStep = {
        usage: { outputTokens: 50, reasoningTokens: 30 },
        providerMetadata: { openai: {} },
      };
      const data = runSpan('generateText', {
        totalUsage: { inputTokens: 20, outputTokens: 70, reasoningTokens: 110 },
        providerMetadata: openaiStep.providerMetadata,
        steps: [googleStep(20, 80, { outputTokens: 20, reasoningTokens: 80 }), openaiStep],
      });

      expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(150);
      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(110);
    });

    // v4 reports no reasoning in the usage, only in each step's `providerMetadata`.
    it('sums v4 OpenAI reasoning from each step', () => {
      const data = runSpan('generateText', {
        usage: { promptTokens: 20, completionTokens: 300, totalTokens: 320 },
        providerMetadata: { openai: { reasoningTokens: 40 } },
        steps: [
          { usage: { promptTokens: 10, completionTokens: 200 }, providerMetadata: { openai: { reasoningTokens: 60 } } },
          { usage: { promptTokens: 10, completionTokens: 100 }, providerMetadata: { openai: { reasoningTokens: 40 } } },
        ],
      });

      expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(300);
      expect(data[GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(100);
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
  });
});
