import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { createSpanFromMessage, enrichSpanOnEnd } from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

type Message = Parameters<typeof createSpanFromMessage>[0];

describe('Vercel AI evaluate spans', () => {
  let endedSpans: Span[];

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
      }),
    );
    setCurrentClient(client);
    client.init();
    endedSpans = [];
    client.on('spanEnd', span => endedSpans.push(span));
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  // `ai` 7.0.128 renamed the channel event from `experimental_evaluate` to `experimental_decide`.
  it.each(['experimental_evaluate', 'experimental_decide'] as const)('creates an evaluate span for `%s`', type => {
    const message = {
      type,
      event: {
        provider: 'gateway',
        modelId: 'typesafe-ai/jev',
        state: 'I want a refund',
        questions: { wantsRefund: { type: 'boolean', instructions: 'Is a refund requested?' } },
        recordInputs: true,
        recordOutputs: true,
      },
      result: { answers: { wantsRefund: { type: 'boolean', probability: 0.99 } } },
    } as unknown as Message;

    const span = createSpanFromMessage(message, {} as Parameters<typeof createSpanFromMessage>[1])!;
    expect(span).toBeDefined();
    enrichSpanOnEnd(span, message, {} as Parameters<typeof enrichSpanOnEnd>[2]);
    span.end();

    const json = spanToStaticSpanJSON(endedSpans[0]!);
    expect(json.description).toBe('evaluate typesafe-ai/jev');
    expect(json.op).toBe('gen_ai.evaluate');
    expect(JSON.parse(json.data?.['gen_ai.output.messages'] as string)).toEqual([
      { type: 'evaluation', answers: { wantsRefund: { type: 'boolean', probability: 0.99 } } },
    ]);
  });
});
