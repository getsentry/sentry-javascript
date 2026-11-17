import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getCurrentScope,
  getMainCarrier,
  setAsyncContextStrategy,
  setCurrentClient,
  spanToJSON,
  withScope,
} from '@sentry/core';
import type { Span } from '@sentry/core';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
} from '@sentry/conventions/attributes';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../../../src/async-context';
import { instrumentCreateReactAgent, instrumentStateGraph } from '../../../../src/ai/langgraph';
import type { LangChainCallbackHandler } from '../../../../src/ai/langchain/types';
import type { CompiledGraph, LangGraphCallInfo, LangGraphOptions } from '../../../../src/ai/langgraph/types';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

type Config = { callbacks: LangChainCallbackHandler[]; metadata: Record<string, unknown> };

const QUESTION = { role: 'user', content: 'Capital of France?' };
const ANSWER = { role: 'assistant', content: 'Paris.' };
const CHAT_MODEL = { id: ['langchain', 'chat_models', 'ChatOpenAI'] };
const CHAT_MESSAGES = [[{ content: 'Capital of France?', _getType: () => 'human' }]];
const CHAT_OUTPUT = { generations: [[{ text: 'Paris.', message: { content: 'Paris.', _getType: () => 'ai' } }]] };

// Runs one chat model call through the callbacks LangGraph hands its child runs, like a graph node would.
function runChatModel(config: Config, runId: string): void {
  for (const handler of config.callbacks) {
    handler.handleChatModelStart?.(CHAT_MODEL, CHAT_MESSAGES, runId, undefined, undefined, undefined, config.metadata);
    handler.handleLLMEnd?.(CHAT_OUTPUT, runId);
  }
}

describe('LangGraph per-call recording options', () => {
  let endedSpans: Span[];

  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    setAsyncLocalStorageAsyncContextStrategy();
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
    endedSpans = [];
    client.on('spanEnd', span => endedSpans.push(span));
  });

  function recorded(span: Span): { name: string; inputs: boolean; outputs: boolean } {
    const { name, attributes } = spanToJSON(span);
    return {
      name,
      inputs: GEN_AI_INPUT_MESSAGES in attributes || GEN_AI_TOOL_CALL_ARGUMENTS in attributes,
      outputs:
        GEN_AI_RESPONSE_TEXT in attributes ||
        GEN_AI_OUTPUT_MESSAGES in attributes ||
        GEN_AI_TOOL_CALL_RESULT in attributes,
    };
  }

  function compileGraph(options: LangGraphOptions): CompiledGraph {
    const stateGraph = instrumentStateGraph(
      {
        compile: (): CompiledGraph => ({
          invoke: async (input: unknown, config: unknown) => {
            runChatModel(config as Config, 'chat-run');
            return { messages: [...(input as { messages: unknown[] }).messages, ANSWER] };
          },
        }),
      },
      options,
    );
    return stateGraph.compile({ name: 'agent' });
  }

  it('passes the invoke arguments to the functions', async () => {
    const calls: LangGraphCallInfo[] = [];
    const record = (call: LangGraphCallInfo): boolean => {
      calls.push(call);
      return true;
    };
    const graph = compileGraph({ recordInputs: record, recordOutputs: record });

    const input = { messages: [QUESTION] };
    const config = { configurable: { thread_id: 'thread-1' } };
    await graph.invoke!(input, config);

    const call = { operation: 'invoke_agent', input, config };
    expect(calls).toEqual([call, call]);
    expect(calls[0]!.config).toBe(config);
  });

  it('decides for each invoke call of the same graph, for the whole run', async () => {
    const record = (call: LangGraphCallInfo): boolean => call.config?.configurable === 'public';
    const graph = compileGraph({ recordInputs: record, recordOutputs: record });

    await graph.invoke!({ messages: [QUESTION] }, { configurable: 'public' });
    await graph.invoke!({ messages: [QUESTION] }, { configurable: 'private' });

    expect(endedSpans.map(recorded)).toEqual([
      { name: 'chat unknown', inputs: true, outputs: true },
      { name: 'invoke_agent agent', inputs: true, outputs: true },
      { name: 'chat unknown', inputs: false, outputs: false },
      { name: 'invoke_agent agent', inputs: false, outputs: false },
    ]);
  });

  it("runs the functions in the caller's async context", async () => {
    const record = (): boolean => getCurrentScope().getScopeData().tags.privacy === 'public';
    const graph = compileGraph({ recordInputs: record, recordOutputs: record });

    await withScope(async scope => {
      scope.setTag('privacy', 'public');
      await graph.invoke!({ messages: [QUESTION] });
    });
    await withScope(async scope => {
      scope.setTag('privacy', 'private');
      await graph.invoke!({ messages: [QUESTION] });
    });

    expect(endedSpans.filter(span => spanToJSON(span).name === 'invoke_agent agent').map(recorded)).toEqual([
      { name: 'invoke_agent agent', inputs: true, outputs: true },
      { name: 'invoke_agent agent', inputs: false, outputs: false },
    ]);
  });

  it('decides inputs and outputs separately', async () => {
    const graph = compileGraph({ recordInputs: () => false, recordOutputs: () => true });

    await graph.invoke!({ messages: [QUESTION] });

    expect(endedSpans.map(recorded).at(-1)).toEqual({ name: 'invoke_agent agent', inputs: false, outputs: true });
  });

  it('applies the decision of the invoke call to the tools of createReactAgent', async () => {
    const tool = { name: 'search', invoke: async () => 'Paris' };
    const createReactAgent = instrumentCreateReactAgent(
      (): CompiledGraph => ({
        invoke: async (_input: unknown, config: unknown) =>
          tool.invoke({ args: { q: 'paris' } }, { metadata: (config as Config).metadata }),
      }),
      { recordInputs: call => call.config?.configurable === 'public', recordOutputs: () => true },
    );
    const agent = createReactAgent({ name: 'agent', tools: [tool] });

    await agent.invoke!({ messages: [QUESTION] }, { configurable: 'public' });
    await agent.invoke!({ messages: [QUESTION] }, { configurable: 'private' });

    expect(endedSpans.filter(span => spanToJSON(span).name === 'execute_tool search').map(recorded)).toEqual([
      { name: 'execute_tool search', inputs: true, outputs: true },
      { name: 'execute_tool search', inputs: false, outputs: true },
    ]);
  });

  it('records the outputs of a stream as decided when it started', async () => {
    let recordOutputs = true;
    let outputCalls = 0;
    let listener: LangChainCallbackHandler | undefined;
    const stateGraph = instrumentStateGraph(
      {
        compile: (): CompiledGraph => ({
          stream: async (_input: unknown, config: unknown) => {
            listener = (config as Config).callbacks.find(handler => handler.name === 'SentryLangGraphStreamListener');
            listener?.handleChainStart?.({}, {}, 'root');
            return {};
          },
        }),
      },
      {
        recordOutputs: () => {
          outputCalls++;
          return recordOutputs;
        },
      },
    );
    const graph = stateGraph.compile({ name: 'agent' });

    await graph.stream!({ messages: [QUESTION] });
    recordOutputs = false;
    listener?.handleChainEnd?.({ messages: [QUESTION, ANSWER] }, 'root');

    expect(outputCalls).toBe(1);
    expect(endedSpans.map(recorded)).toEqual([{ name: 'invoke_agent agent', inputs: true, outputs: true }]);
  });
});
