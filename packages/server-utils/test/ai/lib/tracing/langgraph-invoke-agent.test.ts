import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  conversationIdIntegration,
  getCurrentScope,
  getMainCarrier,
  setCurrentClient,
  spanToStaticSpanJSON,
  startSpan,
} from '@sentry/core';
import type { Span } from '@sentry/core';
import { GEN_AI_CONVERSATION_ID } from '@sentry/conventions/attributes';
import {
  instrumentCompiledGraph,
  instrumentStateGraphCompile,
  isInsideManualLangGraphInstrumentation,
} from '../../../../src/ai/langgraph';
import { wrapToolsWithSpans } from '../../../../src/ai/langgraph/utils';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

function instrumentInvoke(
  invoke: (...args: unknown[]) => Promise<unknown>,
  compileOptions: Record<string, unknown> = {},
  sentryCallbackHandler?: unknown,
): (...args: unknown[]) => Promise<unknown> {
  const graph = { invoke };
  instrumentCompiledGraph(graph, compileOptions, {}, undefined, sentryCallbackHandler);
  return graph.invoke;
}

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
        integrations: [conversationIdIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    return endedSpans;
  }

  async function invokeGraph(compileOptions: Record<string, unknown>, config?: Record<string, unknown>): Promise<void> {
    const invoke = instrumentInvoke(async () => ({ messages: [] }), compileOptions);
    await invoke({}, config);
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

describe('LangGraph conversation id', () => {
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
        integrations: [conversationIdIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();

    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    return endedSpans;
  }

  async function invokeGraph(config: Record<string, unknown>): Promise<Span> {
    const endedSpans = setupClient();
    const invoke = instrumentInvoke(async () => ({ messages: [] }));
    await invoke({}, config);
    return endedSpans[0]!;
  }

  it('reads the same metadata keys as the LangChain spans', async () => {
    const span = await invokeGraph({ configurable: { sessionId: 'session-1' } });

    expect(spanToStaticSpanJSON(span).data[GEN_AI_CONVERSATION_ID]).toBe('session-1');
  });

  it('lets an id set on the scope win over configurable.thread_id', async () => {
    getCurrentScope().setConversationId('scope-id');
    const span = await invokeGraph({ configurable: { thread_id: 'thread-1' } });

    expect(spanToStaticSpanJSON(span).data[GEN_AI_CONVERSATION_ID]).toBe('scope-id');
  });

  it('copies the conversation id from configurable into the metadata the graph runs with', async () => {
    setupClient();
    let receivedConfig: Record<string, unknown> | undefined;
    const invoke = instrumentInvoke(
      async (_input: unknown, config: unknown) => {
        receivedConfig = config as Record<string, unknown>;
        return { messages: [] };
      },
      {},
      {},
    );

    await invoke({}, { configurable: { sessionId: 'session-1' }, metadata: { user: 'u' } });

    expect(receivedConfig?.metadata).toEqual({ sessionId: 'session-1', user: 'u', __sentry_langgraph__: true });
  });

  it('sets the conversation id on wrapped tool spans from the call metadata', async () => {
    const endedSpans = setupClient();
    const tool = { name: 'add', invoke: async () => '3' };
    wrapToolsWithSpans([tool], {});

    await startSpan({ name: 'root' }, () => tool.invoke({}, { metadata: { thread_id: 'thread-1' } }));

    const toolSpan = endedSpans.find(span => spanToStaticSpanJSON(span).description === 'execute_tool add')!;
    expect(spanToStaticSpanJSON(toolSpan).data[GEN_AI_CONVERSATION_ID]).toBe('thread-1');
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

  it('creates one agent span per run when manual and auto instrumentation both wrap the graph', async () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
    const startedSpans: Span[] = [];
    client.on('spanStart', span => startedSpans.push(span));
    const graph = {
      async invoke() {
        const stream = await this.stream();
        for await (const _chunk of stream) {
          // drain, as LangGraph's invoke does
        }
      },
      async stream(): Promise<AsyncIterable<unknown>> {
        return {
          async *[Symbol.asyncIterator]() {
            yield 'chunk';
          },
        };
      },
    };
    instrumentStateGraphCompile(
      instrumentStateGraphCompile(() => graph, {}),
      {},
    )();
    instrumentCompiledGraph(graph, {}, {}, undefined, undefined);

    await graph.invoke();
    for await (const _chunk of await graph.stream()) {
      // drain
    }

    expect(startedSpans).toHaveLength(2);
  });

  it('returns a stream it cannot patch to the caller instead of throwing', async () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();
    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    const frozenStream = Object.freeze({
      async *[Symbol.asyncIterator]() {
        yield 'chunk';
      },
    });
    const graph = { stream: async () => frozenStream };
    instrumentCompiledGraph(graph, {}, {}, undefined, undefined);

    await expect(graph.stream()).resolves.toBe(frozenStream);
    expect(endedSpans).toHaveLength(1);
  });

  it('leaves a graph compiled by manual instrumentation to the manual options', () => {
    let sawManualFlag = false;
    instrumentStateGraphCompile(() => {
      sawManualFlag = isInsideManualLangGraphInstrumentation();
      return {};
    }, {})();

    expect(sawManualFlag).toBe(true);
    expect(isInsideManualLangGraphInstrumentation()).toBe(false);
  });
});
