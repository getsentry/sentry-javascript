import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PIPELINE_NAME,
  SENTRY_OP,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_DECIDE } from '@sentry/conventions/op';
import {
  conversationIdIntegration,
  debug,
  getClient,
  getMainCarrier,
  setConversationId,
  setCurrentClient,
  spanToJSON,
  spanToStaticSpanJSON,
  startSpan,
} from '@sentry/core';
import type { ClientOptions, Span } from '@sentry/core';
import { createLangChainCallbackHandler } from '../../../../src/ai/langchain';
import { MAX_TRACKED_LANGCHAIN_RUNS } from '../../../../src/ai/langchain/constants';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

beforeEach(() => {
  getMainCarrier().__SENTRY__ = undefined;
});

afterEach(() => {
  getMainCarrier().__SENTRY__ = undefined;
});

function setupClient(traceLifecycle: 'static' | 'stream' = 'static', options: Partial<ClientOptions> = {}): Span[] {
  const client = new TestClient(
    getDefaultTestClientOptions({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      traceLifecycle,
      ...options,
    }),
  );
  setCurrentClient(client);
  client.init();

  const endedSpans: Span[] = [];
  client.on('spanEnd', span => endedSpans.push(span));
  return endedSpans;
}

describe('LangChain invoke_agent span names', () => {
  function runChain(runName?: string, chain: { name?: string } = {}): void {
    const handler = createLangChainCallbackHandler();
    handler.handleChainStart?.(
      chain,
      { topic: 'weather' },
      'run-1',
      undefined,
      undefined,
      undefined,
      undefined,
      runName,
    );
    handler.handleChainEnd?.({ ok: true }, 'run-1');
  }

  it('keeps `chain {chainName}` in static mode', () => {
    const endedSpans = setupClient('static');
    runChain('format_prompt');

    const span = spanToStaticSpanJSON(endedSpans[0]!);
    expect(span.description).toBe('chain format_prompt');
    expect(span.data?.[GEN_AI_OPERATION_NAME]).toBe('invoke_agent');
    expect(span.data?.[GEN_AI_PIPELINE_NAME]).toBe('format_prompt');
    expect(span.data?.['langchain.chain.name']).toBeUndefined();
  });

  it('sets gen_ai.pipeline.name from chain.name when runName is missing', () => {
    const endedSpans = setupClient('static');
    runChain(undefined, { name: 'RunnableSequence' });

    const span = spanToStaticSpanJSON(endedSpans[0]!);
    expect(span.description).toBe('chain RunnableSequence');
    expect(span.data?.[GEN_AI_PIPELINE_NAME]).toBe('RunnableSequence');
  });

  it('keeps `chain unknown_chain` when the chain name is missing in static mode', () => {
    const endedSpans = setupClient('static');
    runChain();

    const span = spanToStaticSpanJSON(endedSpans[0]!);
    expect(span.description).toBe('chain unknown_chain');
    expect(span.data?.[GEN_AI_PIPELINE_NAME]).toBeUndefined();
    expect(span.data?.['langchain.chain.name']).toBeUndefined();
  });

  it('leads with the operation and keeps the chain name when span streaming is enabled', () => {
    const endedSpans = setupClient('stream');
    runChain('format_prompt');

    const span = spanToStaticSpanJSON(endedSpans[0]!);
    expect(span.description).toBe('invoke_agent format_prompt');
    expect(span.data?.[GEN_AI_OPERATION_NAME]).toBe('invoke_agent');
    expect(span.data?.[GEN_AI_PIPELINE_NAME]).toBe('format_prompt');
    expect(span.data?.['langchain.chain.name']).toBeUndefined();
  });

  it('drops the `unknown_chain` sentinel when span streaming is enabled', () => {
    const endedSpans = setupClient('stream');
    runChain();

    const span = spanToStaticSpanJSON(endedSpans[0]!);
    expect(span.description).toBe('invoke_agent');
    expect(span.data?.[GEN_AI_PIPELINE_NAME]).toBeUndefined();
    expect(span.data?.['langchain.chain.name']).toBeUndefined();
  });

  it('records a TypeSafeClassifier run inside an agent, with its attributes set at span start', () => {
    const endedSpans = setupClient('stream');
    const startAttributes: Record<string, unknown>[] = [];
    getClient()!.on('spanStart', span => startAttributes.push(spanToStaticSpanJSON(span).data));

    const handler = createLangChainCallbackHandler();
    // LangChain passes the classifier serialized as `[...lc_namespace, lc_name()]`.
    const classifier = { name: undefined, id: ['langchain', 'classifiers', 'typesafe', 'TypeSafeClassifier'] };

    handler.handleChainStart?.(classifier, { input: 'My payouts have been failing.' }, 'run-1', undefined, undefined, {
      __sentry_langgraph__: true,
      lc_agent_name: 'support_agent',
    });
    handler.handleChainEnd?.({ model: 'jev-1.13', answers: {}, usage: {} }, 'run-1');

    expect(startAttributes).toEqual([
      expect.objectContaining({
        [SENTRY_OP]: GEN_AI_DECIDE,
        [SENTRY_ORIGIN]: 'auto.ai.langchain',
        [GEN_AI_AGENT_NAME]: 'support_agent',
      }),
    ]);
    expect(endedSpans.map(span => spanToStaticSpanJSON(span).description)).toEqual(['decide jev-latest']);
  });
});

describe('LangChain callback handler run tree', () => {
  function byName(spans: Span[]): Record<string, ReturnType<typeof spanToJSON>> {
    return Object.fromEntries(spans.map(spanToJSON).map(json => [json.name, json]));
  }

  function conversationIds(spans: Span[]): Record<string, unknown> {
    return Object.fromEntries(spans.map(spanToJSON).map(json => [json.name, json.attributes[GEN_AI_CONVERSATION_ID]]));
  }

  const chatModel = {
    lc: 1,
    type: 'constructor',
    id: ['langchain', 'chat_models', 'openai', 'ChatOpenAI'],
    kwargs: {},
  };

  it('nests each run under the span of its parent run', () => {
    const endedSpans = setupClient();
    const handler = createLangChainCallbackHandler();

    startSpan({ name: 'caller' }, () => {
      handler.handleChainStart?.({}, {}, 'outer', undefined, undefined, undefined, undefined, 'outer');
      handler.handleToolStart?.({}, '{}', 'tool', 'outer', undefined, undefined, 'lookup_weather');
      handler.handleChatModelStart?.(chatModel, [[]], 'chat', 'tool');
      handler.handleLLMEnd?.({ generations: [] }, 'chat');
      handler.handleToolEnd?.('sunny', 'tool');
      handler.handleChainEnd?.({}, 'outer');
    });

    const spans = byName(endedSpans);
    expect(spans['chain outer']?.parent_span_id).toBe(spans['caller']?.span_id);
    expect(spans['execute_tool lookup_weather']?.parent_span_id).toBe(spans['chain outer']?.span_id);
    expect(spans['chat unknown']?.parent_span_id).toBe(spans['execute_tool lookup_weather']?.span_id);
  });

  it('keeps the active span as parent when the parent run has no span', () => {
    const endedSpans = setupClient();
    const handler = createLangChainCallbackHandler();

    // A LangGraph agent inside a traced chain: its own runs are skipped, and its agent span is active.
    handler.handleChainStart?.({}, {}, 'outer', undefined, undefined, undefined, undefined, 'outer');
    startSpan({ name: 'invoke_agent graph' }, () => {
      handler.handleChainStart?.({}, {}, 'graph-step', 'outer', undefined, { __sentry_langgraph__: true });
      handler.handleChatModelStart?.(chatModel, [[]], 'chat', 'graph-step');
      handler.handleLLMEnd?.({ generations: [] }, 'chat');
      handler.handleChainEnd?.({}, 'graph-step');
    });
    handler.handleChainEnd?.({}, 'outer');

    const spans = byName(endedSpans);
    expect(spans['chat unknown']?.parent_span_id).toBe(spans['invoke_agent graph']?.span_id);
  });

  it('keeps a span opened inside a run as the parent of runs started under it', () => {
    const endedSpans = setupClient();
    const handler = createLangChainCallbackHandler();

    startSpan({ name: 'caller' }, () => {
      handler.handleChainStart?.({}, {}, 'outer', undefined, undefined, undefined, undefined, 'outer');
      startSpan({ name: 'fetch-context' }, () => {
        handler.handleChainStart?.({}, {}, 'inner', 'outer', undefined, undefined, undefined, 'inner');
        handler.handleChatModelStart?.(chatModel, [[]], 'chat', 'inner');
        handler.handleLLMEnd?.({ generations: [] }, 'chat');
        handler.handleChainEnd?.({}, 'inner');
      });
      handler.handleChainEnd?.({}, 'outer');
    });

    const spans = byName(endedSpans);
    expect(spans['chain inner']?.parent_span_id).toBe(spans['fetch-context']?.span_id);
    expect(spans['chat unknown']?.parent_span_id).toBe(spans['chain inner']?.span_id);
  });

  it('starts a run under the nearest ancestor run span that is not ignored', () => {
    const endedSpans = setupClient('stream', { ignoreSpans: [{ name: 'invoke_agent inner' }] });
    const handler = createLangChainCallbackHandler();

    startSpan({ name: 'caller' }, () => {
      handler.handleChainStart?.({}, {}, 'outer', undefined, undefined, undefined, undefined, 'outer');
      handler.handleChainStart?.({}, {}, 'inner', 'outer', undefined, undefined, undefined, 'inner');
      handler.handleToolStart?.({}, '{}', 'tool', 'inner', undefined, undefined, 'lookup_weather');
      handler.handleToolEnd?.('sunny', 'tool');
      handler.handleChainEnd?.({}, 'inner');
      handler.handleChainEnd?.({}, 'outer');
    });

    const spans = byName(endedSpans);
    expect(spans['invoke_agent inner']).toBeUndefined();
    expect(spans['execute_tool lookup_weather']?.parent_span_id).toBe(spans['invoke_agent outer']?.span_id);
  });

  it('drops the runs under an ignored root run span, like core', () => {
    const endedSpans = setupClient('stream', { ignoreSpans: [{ name: 'invoke_agent outer' }] });
    const handler = createLangChainCallbackHandler();

    handler.handleChainStart?.({}, {}, 'outer', undefined, undefined, undefined, undefined, 'outer');
    handler.handleToolStart?.({}, '{}', 'tool', 'outer', undefined, undefined, 'lookup_weather');
    handler.handleToolEnd?.('sunny', 'tool');
    handler.handleChainEnd?.({}, 'outer');

    expect(endedSpans.map(span => spanToJSON(span).name)).toEqual([]);
  });

  it('passes the conversation id down to child runs without one', () => {
    const endedSpans = setupClient();
    const handler = createLangChainCallbackHandler();

    handler.handleChainStart?.({}, {}, 'outer', undefined, undefined, { thread_id: 'thread-1' }, undefined, 'outer');
    handler.handleToolStart?.({}, '{}', 'tool', 'outer', undefined, undefined, 'lookup_weather');
    handler.handleToolEnd?.('sunny', 'tool');
    handler.handleChainEnd?.({}, 'outer');

    expect(conversationIds(endedSpans)).toEqual({
      'chain outer': 'thread-1',
      'execute_tool lookup_weather': 'thread-1',
    });
  });

  it('backfills the conversation id onto open ancestors without one', () => {
    const endedSpans = setupClient();
    const handler = createLangChainCallbackHandler();

    handler.handleChainStart?.({}, {}, 'outer', undefined, undefined, undefined, undefined, 'outer');
    handler.handleToolStart?.({}, '{}', 'tool', 'outer', undefined, undefined, 'lookup_weather');
    handler.handleChatModelStart?.(chatModel, [[]], 'chat', 'tool', undefined, undefined, { thread_id: 'thread-1' });
    handler.handleLLMEnd?.({ generations: [] }, 'chat');
    handler.handleToolEnd?.('sunny', 'tool');
    handler.handleChainEnd?.({}, 'outer');

    expect(conversationIds(endedSpans)).toEqual({
      'chat unknown': 'thread-1',
      'execute_tool lookup_weather': 'thread-1',
      'chain outer': 'thread-1',
    });
  });

  it('does not backfill past an ancestor that has its own conversation id', () => {
    const endedSpans = setupClient();
    const handler = createLangChainCallbackHandler();

    handler.handleChainStart?.({}, {}, 'outer', undefined, undefined, { sessionId: 'session-1' }, undefined, 'outer');
    handler.handleChatModelStart?.(chatModel, [[]], 'chat', 'outer', undefined, undefined, { thread_id: 'thread-1' });
    handler.handleLLMEnd?.({ generations: [] }, 'chat');
    handler.handleChainEnd?.({}, 'outer');

    expect(conversationIds(endedSpans)).toEqual({
      'chat unknown': 'thread-1',
      'chain outer': 'session-1',
    });
  });

  it('keeps run trees that interleave on one handler apart', () => {
    const endedSpans = setupClient();
    const handler = createLangChainCallbackHandler();

    handler.handleChainStart?.({}, {}, 'a', undefined, undefined, { thread_id: 'thread-a' }, undefined, 'a');
    handler.handleChainStart?.({}, {}, 'b', undefined, undefined, undefined, undefined, 'b');
    handler.handleToolStart?.({}, '{}', 'b-tool', 'b', undefined, undefined, 'tool_b');
    handler.handleToolStart?.({}, '{}', 'a-tool', 'a', undefined, undefined, 'tool_a');
    handler.handleChatModelStart?.(chatModel, [[]], 'b-chat', 'b-tool', undefined, undefined, {
      thread_id: 'thread-b',
    });
    handler.handleLLMEnd?.({ generations: [] }, 'b-chat');
    handler.handleToolEnd?.('sunny', 'a-tool');
    handler.handleToolEnd?.('sunny', 'b-tool');
    handler.handleChainEnd?.({}, 'a');
    handler.handleChainEnd?.({}, 'b');

    const spans = byName(endedSpans);
    expect(spans['execute_tool tool_a']?.parent_span_id).toBe(spans['chain a']?.span_id);
    expect(spans['execute_tool tool_b']?.parent_span_id).toBe(spans['chain b']?.span_id);
    expect(conversationIds(endedSpans)).toEqual({
      'chain a': 'thread-a',
      'execute_tool tool_a': 'thread-a',
      'chain b': 'thread-b',
      'execute_tool tool_b': 'thread-b',
      'chat unknown': 'thread-b',
    });
  });

  it('ends the oldest run once too many runs are open, and warns once', () => {
    const endedSpans = setupClient();
    const warn = vi.spyOn(debug, 'warn').mockImplementation(() => undefined);
    const handler = createLangChainCallbackHandler();

    handler.handleChainStart?.({}, {}, 'abandoned', undefined, undefined, undefined, undefined, 'abandoned');
    for (let i = 0; i <= MAX_TRACKED_LANGCHAIN_RUNS; i++) {
      handler.handleChainStart?.({}, {}, `run-${i}`, undefined, undefined, undefined, undefined, `run-${i}`);
    }
    expect(endedSpans.map(span => spanToJSON(span).name)).toEqual(['chain abandoned', 'chain run-0']);
    expect(warn).toHaveBeenCalledTimes(1);

    handler.handleChainEnd?.({}, 'abandoned');
    expect(endedSpans).toHaveLength(2);
    warn.mockRestore();
  });

  it('keeps every ancestor of a busy run open', () => {
    const endedSpans = setupClient();
    const handler = createLangChainCallbackHandler();

    handler.handleChainStart?.({}, {}, 'outer', undefined, undefined, undefined, undefined, 'outer');
    handler.handleChainStart?.({}, {}, 'inner', 'outer', undefined, undefined, undefined, 'inner');
    for (let i = 0; i < MAX_TRACKED_LANGCHAIN_RUNS; i++) {
      handler.handleChatModelStart?.(chatModel, [[]], `chat-${i}`, 'inner');
    }
    handler.handleChainEnd?.({}, 'inner');
    handler.handleChainEnd?.({}, 'outer');

    const chainNames = endedSpans.map(span => spanToJSON(span).name).filter(name => name.startsWith('chain'));
    expect(chainNames).toEqual(['chain inner', 'chain outer']);
  });

  it('lets an id from Sentry.setConversationId() win over one from a child run', () => {
    const endedSpans = setupClient();
    getClient()!.addIntegration(conversationIdIntegration());
    const handler = createLangChainCallbackHandler();

    setConversationId('from-scope');
    handler.handleChainStart?.({}, {}, 'outer', undefined, undefined, undefined, undefined, 'outer');
    handler.handleChatModelStart?.(chatModel, [[]], 'chat', 'outer', undefined, undefined, { thread_id: 'thread-1' });
    handler.handleLLMEnd?.({ generations: [] }, 'chat');
    handler.handleChainEnd?.({}, 'outer');
    setConversationId(null);

    expect(conversationIds(endedSpans)).toEqual({
      'chain outer': 'from-scope',
      'chat unknown': 'from-scope',
    });
  });
});
