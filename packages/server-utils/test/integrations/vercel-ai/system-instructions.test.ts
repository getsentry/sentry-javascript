import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GEN_AI_SYSTEM_INSTRUCTIONS } from '@sentry/conventions/attributes';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { createSpanFromMessage } from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('Vercel AI system instructions', () => {
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

  it('records `gen_ai.system_instructions` when `instructions` is a string', () => {
    const endedSpans = setupClient();
    const span = createSpanFromMessage(
      {
        type: 'generateText',
        event: { instructions: 'Be brief.', recordInputs: true },
      } as Parameters<typeof createSpanFromMessage>[0],
      {} as Parameters<typeof createSpanFromMessage>[1],
    );
    span?.end();

    const data = spanToStaticSpanJSON(endedSpans[0]!).data;
    expect(data?.[GEN_AI_SYSTEM_INSTRUCTIONS]).toBe('[{"type":"text","content":"Be brief."}]');
  });

  // AI SDK v7's `instructions` option (and v4-v6's `system`) accepts a `SystemModelMessage` object, not
  // just a plain string -- for example to attach `providerOptions` like Anthropic prompt caching.
  it('records `gen_ai.system_instructions` when `instructions` is a message object', () => {
    const endedSpans = setupClient();
    const span = createSpanFromMessage(
      {
        type: 'generateText',
        event: {
          instructions: {
            role: 'system',
            content: 'Be brief.',
            providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
          },
          recordInputs: true,
        },
      } as Parameters<typeof createSpanFromMessage>[0],
      {} as Parameters<typeof createSpanFromMessage>[1],
    );
    span?.end();

    const data = spanToStaticSpanJSON(endedSpans[0]!).data;
    expect(data?.[GEN_AI_SYSTEM_INSTRUCTIONS]).toBe('[{"type":"text","content":"Be brief."}]');
  });
});
