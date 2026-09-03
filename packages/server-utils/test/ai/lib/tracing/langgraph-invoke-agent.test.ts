import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { instrumentCompiledGraphInvoke } from '../../../../src/ai/langgraph';
import type { CompiledGraph } from '../../../../src/ai/langgraph/types';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('LangGraph invoke_agent span names', () => {
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

  async function invokeGraph(compileOptions: Record<string, unknown>): Promise<void> {
    const invoke = instrumentCompiledGraphInvoke(
      async () => ({ messages: [] }),
      {} as CompiledGraph,
      compileOptions,
      {},
    );
    await invoke({});
  }

  it('names the span `{operation} {agent}` when an agent name is present', async () => {
    const endedSpans = setupClient('stream');
    await invokeGraph({ name: 'weather_assistant' });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('invoke_agent weather_assistant');
  });

  it('uses the operation name when the agent name is missing and span streaming is enabled', async () => {
    const endedSpans = setupClient('stream');
    await invokeGraph({});

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('invoke_agent');
  });
});
