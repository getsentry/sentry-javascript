import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { createSpanFromMessage } from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('Vercel AI telemetry metadata', () => {
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

  it('records metadata values as strings and skips null and undefined', () => {
    const endedSpans = setupClient();
    const span = createSpanFromMessage(
      {
        type: 'generateText',
        event: {
          telemetryMetadata: {
            requestId: 'req_1',
            attempt: 2,
            cached: false,
            tags: ['a', 'b'],
            empty: null,
            missing: undefined,
          },
        },
      } as Parameters<typeof createSpanFromMessage>[0],
      {} as Parameters<typeof createSpanFromMessage>[1],
    );
    span?.end();

    const data = spanToStaticSpanJSON(endedSpans[0]!).data;
    expect(data).toMatchObject({
      'vercel.ai.telemetry.metadata.requestId': 'req_1',
      'vercel.ai.telemetry.metadata.attempt': '2',
      'vercel.ai.telemetry.metadata.cached': 'false',
      'vercel.ai.telemetry.metadata.tags': 'a,b',
    });
    expect(data).not.toHaveProperty('vercel.ai.telemetry.metadata.empty');
    expect(data).not.toHaveProperty('vercel.ai.telemetry.metadata.missing');
  });
});
