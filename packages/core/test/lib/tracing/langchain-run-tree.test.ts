import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMainCarrier } from '../../../src/carrier';
import { setCurrentClient } from '../../../src/sdk';
import { startSpan } from '../../../src/tracing/trace';
import { createLangChainCallbackHandler } from '../../../src/tracing/langchain';
import { spanToJSON } from '../../../src/utils/spanUtils';
import type { Span } from '../../../src/types/span';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

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

describe('LangChain callback handler run tree', () => {
  function byName(spans: Span[]): Record<string, ReturnType<typeof spanToJSON>> {
    return Object.fromEntries(spans.map(spanToJSON).map(json => [json.description!, json]));
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

  it('keeps run trees that interleave on one handler apart', () => {
    const endedSpans = setupClient();
    const handler = createLangChainCallbackHandler();

    handler.handleChainStart?.({}, {}, 'a', undefined, undefined, undefined, undefined, 'a');
    handler.handleChainStart?.({}, {}, 'b', undefined, undefined, undefined, undefined, 'b');
    handler.handleToolStart?.({}, '{}', 'b-tool', 'b', undefined, undefined, 'tool_b');
    handler.handleToolStart?.({}, '{}', 'a-tool', 'a', undefined, undefined, 'tool_a');
    handler.handleChatModelStart?.(chatModel, [[]], 'b-chat', 'b-tool');
    handler.handleLLMEnd?.({ generations: [] }, 'b-chat');
    handler.handleToolEnd?.('sunny', 'a-tool');
    handler.handleToolEnd?.('sunny', 'b-tool');
    handler.handleChainEnd?.({}, 'a');
    handler.handleChainEnd?.({}, 'b');

    expect(endedSpans).toHaveLength(5);
    const spans = byName(endedSpans);
    expect(spans['execute_tool tool_a']?.parent_span_id).toBe(spans['chain a']?.span_id);
    expect(spans['execute_tool tool_b']?.parent_span_id).toBe(spans['chain b']?.span_id);
  });

  it('keeps runs started without an active span in one trace', () => {
    const endedSpans = setupClient();
    const handler = createLangChainCallbackHandler();
    handler.handleChainStart?.({}, {}, 'outer', undefined, undefined, undefined, undefined, 'outer');
    handler.handleLLMStart?.(chatModel, ['hello'], 'llm', 'outer');
    handler.handleLLMEnd?.({ generations: [] }, 'llm');
    handler.handleChainEnd?.({}, 'outer');
    const spans = byName(endedSpans);
    expect(endedSpans).toHaveLength(2);
    expect(spans['chat unknown']?.parent_span_id).toBe(spans['chain outer']?.span_id);
    expect(new Set(endedSpans.map(span => span.spanContext().traceId)).size).toBe(1);
  });
});
