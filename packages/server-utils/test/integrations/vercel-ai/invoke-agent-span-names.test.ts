import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GEN_AI_FUNCTION_ID } from '@sentry/conventions/attributes';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { createSpanFromMessage } from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('Vercel AI invoke_agent span names', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function setupClient(traceLifecycle: 'static' | 'stream'): Span[] {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        traceLifecycle,
      }),
    );
    setCurrentClient(client);
    client.init();

    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    return endedSpans;
  }

  function startInvokeAgentSpan(functionId?: string): void {
    const span = createSpanFromMessage(
      {
        type: 'generateText',
        event: functionId ? { functionId } : {},
      } as Parameters<typeof createSpanFromMessage>[0],
      {} as Parameters<typeof createSpanFromMessage>[1],
    );
    span?.end();
  }

  // `functionId` is a developer-supplied label, so it is bounded and stays in the name in both
  // lifecycles, the same way a tool name does on `gen_ai.execute_tool` spans.
  it.each(['static', 'stream'] as const)('keeps `invoke_agent {functionId}` in %s mode', traceLifecycle => {
    const endedSpans = setupClient(traceLifecycle);
    startInvokeAgentSpan('weather_agent');

    const span = spanToStaticSpanJSON(endedSpans[0]!);
    expect(span.description).toBe('invoke_agent weather_agent');
    expect(span.data?.[GEN_AI_FUNCTION_ID]).toBe('weather_agent');
  });

  it.each(['static', 'stream'] as const)('uses `invoke_agent` without a functionId in %s mode', traceLifecycle => {
    const endedSpans = setupClient(traceLifecycle);
    startInvokeAgentSpan();

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('invoke_agent');
  });
});
