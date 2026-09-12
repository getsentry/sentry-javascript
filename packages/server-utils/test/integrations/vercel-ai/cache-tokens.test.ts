import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import {
  createSpanFromMessage,
  enrichSpanOnEnd,
  streamedResultToChannelResult,
} from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('Vercel AI SDK cache tokens', () => {
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

  function runSpan(
    type: string,
    result: Record<string, unknown>,
    existingAttributes: Record<string, number> = {},
  ): Record<string, unknown> {
    const endedSpans = setupClient();
    const message = { type, event: {}, result } as Parameters<typeof createSpanFromMessage>[0];
    const span = createSpanFromMessage(message, {} as Parameters<typeof createSpanFromMessage>[1]);
    span!.setAttributes(existingAttributes);
    enrichSpanOnEnd(span!, message, {} as Parameters<typeof enrichSpanOnEnd>[2]);
    span?.end();
    return spanToStaticSpanJSON(endedSpans[0]!).data ?? {};
  }

  it('reads v5 `cachedInputTokens` when providerMetadata has no provider key', () => {
    const data = runSpan('languageModelCall', {
      usage: {
        inputTokens: 120,
        outputTokens: 10,
        totalTokens: 130,
        cachedInputTokens: 100,
      },
      providerMetadata: { gateway: { routing: {} } },
    });

    expect(data[GEN_AI_USAGE_INPUT_TOKENS]).toBe(120);
    expect(data[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]).toBe(100);
    expect(data[GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]).toBeUndefined();
  });

  it('reads v6 `inputTokenDetails` cache read and write counts', () => {
    const data = runSpan('languageModelCall', {
      usage: {
        inputTokens: 120,
        inputTokenDetails: {
          noCacheTokens: 20,
          cacheReadTokens: 80,
          cacheWriteTokens: 20,
        },
        outputTokens: 10,
        totalTokens: 130,
      },
    });

    expect(data[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]).toBe(80);
    expect(data[GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]).toBe(20);
  });

  it('prefers `inputTokenDetails` over the deprecated `cachedInputTokens`', () => {
    const data = runSpan('languageModelCall', {
      usage: {
        inputTokens: 120,
        inputTokenDetails: { cacheReadTokens: 80 },
        cachedInputTokens: 5,
        outputTokens: 10,
      },
    });

    expect(data[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]).toBe(80);
  });

  it('reads v7 `inputTokens` / `outputTokens` objects', () => {
    const data = runSpan('languageModelCall', {
      usage: {
        inputTokens: { total: 120, noCache: 20, cacheRead: 80, cacheWrite: 20 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
    });

    expect(data[GEN_AI_USAGE_INPUT_TOKENS]).toBe(120);
    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(10);
    expect(data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(130);
    expect(data[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]).toBe(80);
    expect(data[GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]).toBe(20);
  });

  it('sets nothing when the usage object carries no cache counts', () => {
    const data = runSpan('languageModelCall', {
      usage: { inputTokens: 120, outputTokens: 10, totalTokens: 130 },
    });

    expect(data[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]).toBeUndefined();
    expect(data[GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]).toBeUndefined();
  });

  it('leaves an existing count in place when the SDK usage does not report it', () => {
    const data = runSpan(
      'languageModelCall',
      { usage: { inputTokens: 120, cachedInputTokens: 80, outputTokens: 10 } },
      { [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 20 },
    );

    expect(data[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]).toBe(80);
    expect(data[GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]).toBe(20);
  });

  it('keeps providerMetadata-derived counts over the SDK usage counts', () => {
    const data = runSpan('languageModelCall', {
      usage: {
        inputTokens: 120,
        inputTokenDetails: { cacheReadTokens: 80, cacheWriteTokens: 20 },
        cachedInputTokens: 80,
        outputTokens: 10,
      },
      providerMetadata: {
        anthropic: { cacheReadInputTokens: 81, cacheCreationInputTokens: 21 },
      },
    });

    expect(data[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]).toBe(81);
    expect(data[GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]).toBe(21);
  });

  it('keeps the aggregated SDK counts on a root operation over last-step providerMetadata', () => {
    const data = runSpan('generateText', {
      usage: {
        inputTokens: 9500,
        inputTokenDetails: { cacheReadTokens: 8000, cacheWriteTokens: 500 },
        outputTokens: 40,
      },
      providerMetadata: {
        anthropic: { cacheReadInputTokens: 3000, cacheCreationInputTokens: 0 },
      },
    });

    expect(data[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]).toBe(8000);
    expect(data[GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]).toBe(500);
  });

  it('reads the counts from a streamed model call result', () => {
    const data = runSpan(
      'languageModelCall',
      streamedResultToChannelResult({
        text: 'hi',
        toolCalls: [],
        usage: {
          inputTokens: { total: 120, cacheRead: 80, cacheWrite: 20 },
          outputTokens: { total: 10 },
        },
      }),
    );

    expect(data[GEN_AI_USAGE_INPUT_TOKENS]).toBe(120);
    expect(data[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]).toBe(80);
    expect(data[GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]).toBe(20);
  });
});
