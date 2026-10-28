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
import { instrumentCompiledGraphInvoke } from '../../../../src/ai/langgraph';
import type { CompiledGraph } from '../../../../src/ai/langgraph/types';
import { wrapToolsWithSpans } from '../../../../src/ai/langgraph/utils';
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
    const invoke = instrumentCompiledGraphInvoke(
      async () => ({ messages: [] }),
      {} as CompiledGraph,
      compileOptions,
      {},
    );
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
    const invoke = instrumentCompiledGraphInvoke(async () => ({ messages: [] }), {} as CompiledGraph, {}, {});
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
    const invoke = instrumentCompiledGraphInvoke(
      async (_input: unknown, config: unknown) => {
        receivedConfig = config as Record<string, unknown>;
        return { messages: [] };
      },
      {} as CompiledGraph,
      {},
      {},
      undefined,
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
