import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GEN_AI_COST_TOTAL_TOKENS } from '@sentry/conventions/attributes';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { createSpanFromMessage, enrichSpanOnEnd } from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('Vercel AI Gateway cost', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function runSpan(type: string, cost: unknown): Record<string, unknown> {
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));

    const message = {
      type,
      event: {},
      result: { providerMetadata: { gateway: { cost } } },
    } as Parameters<typeof createSpanFromMessage>[0];
    const span = createSpanFromMessage(message, {} as Parameters<typeof createSpanFromMessage>[1]);
    enrichSpanOnEnd(span!, message, {} as Parameters<typeof enrichSpanOnEnd>[2]);
    span?.end();
    return spanToStaticSpanJSON(endedSpans[0]!).data ?? {};
  }

  it.each(['languageModelCall', 'embed', 'rerank', 'experimental_decide'])(
    'records the gateway cost on `%s` spans',
    type => {
      expect(runSpan(type, '0.0000074')[GEN_AI_COST_TOTAL_TOKENS]).toBe(0.0000074);
    },
  );

  it.each(['generateText', 'streamText', 'embedMany'])('leaves the partial gateway cost off `%s` spans', type => {
    expect(runSpan(type, '0.0000074')).not.toHaveProperty(GEN_AI_COST_TOTAL_TOKENS);
  });

  it('accepts a numeric cost and ignores one that is not a number', () => {
    expect(runSpan('languageModelCall', 0.5)[GEN_AI_COST_TOTAL_TOKENS]).toBe(0.5);
    expect(runSpan('languageModelCall', 'n/a')).not.toHaveProperty(GEN_AI_COST_TOTAL_TOKENS);
  });
});
