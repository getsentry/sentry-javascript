import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { instrumentCompiledGraphInvoke, instrumentStateGraphCompile } from '../../../../src/ai/langgraph';
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

describe('LangGraph invoke stream suppression', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('instruments a recursive stream after suppressing the internal invoke stream', async () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
    const startedSpans: Span[] = [];
    client.on('spanStart', span => startedSpans.push(span));
    let nestedStream: Promise<AsyncIterable<unknown>> | undefined;
    const graph = {
      async invoke() {
        return this.stream('internal');
      },
      async stream(input: string): Promise<AsyncIterable<unknown>> {
        if (input === 'internal') {
          nestedStream = this.stream('recursive');
        }
        return {
          async *[Symbol.asyncIterator]() {
            yield input;
          },
        };
      },
    };
    instrumentStateGraphCompile(() => graph, {})();

    const invokedStream = await graph.invoke();
    const recursiveStream = await nestedStream!;
    const chunks = [];
    for await (const chunk of invokedStream) {
      chunks.push(chunk);
    }
    for await (const chunk of recursiveStream) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['internal', 'recursive']);
    expect(startedSpans).toHaveLength(2);
    expect(startedSpans.map(span => spanToStaticSpanJSON(span).description)).toEqual(['invoke_agent', 'invoke_agent']);
    expect(spanToStaticSpanJSON(startedSpans[1]!).parent_span_id).toBe(startedSpans[0]!.spanContext().spanId);
  });
});
