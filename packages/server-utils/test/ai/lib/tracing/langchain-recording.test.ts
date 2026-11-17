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
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
} from '@sentry/conventions/attributes';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../../../src/async-context';
import { createLangChainCallbackHandler, instrumentLangChainEmbeddings } from '../../../../src/ai/langchain';
import type { LangChainCallInfo, LangChainOptions } from '../../../../src/ai/langchain/types';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

const CHAT_MODEL = { id: ['langchain', 'chat_models', 'ChatOpenAI'], kwargs: { model: 'gpt-4o' } };
const MESSAGES = [[{ content: 'Capital of France?', _getType: () => 'human' }]];
const OUTPUT = { generations: [[{ text: 'Paris.', message: { content: 'Paris.', _getType: () => 'ai' } }]] };

describe('LangChain per-call recording options', () => {
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

  function recorded(span: Span): { inputs: boolean; outputs: boolean } {
    const { attributes } = spanToJSON(span);
    return {
      inputs: GEN_AI_INPUT_MESSAGES in attributes || GEN_AI_TOOL_CALL_ARGUMENTS in attributes,
      outputs:
        GEN_AI_RESPONSE_TEXT in attributes ||
        GEN_AI_OUTPUT_MESSAGES in attributes ||
        GEN_AI_TOOL_CALL_RESULT in attributes,
    };
  }

  function chat(options: LangChainOptions, runId: string, metadata?: Record<string, unknown>): void {
    const handler = createLangChainCallbackHandler(options);
    handler.handleChatModelStart?.(CHAT_MODEL, MESSAGES, runId, undefined, { tools: [] }, undefined, metadata);
    handler.handleLLMEnd?.(OUTPUT, runId);
  }

  it('passes the chat callback arguments to the functions', () => {
    const calls: LangChainCallInfo[] = [];
    const record = (call: LangChainCallInfo): boolean => {
      calls.push(call);
      return true;
    };

    chat({ recordInputs: record, recordOutputs: record }, 'run-1', { tenant: 'acme' });

    const call = {
      operation: 'chat',
      serialized: CHAT_MODEL,
      messages: MESSAGES,
      runId: 'run-1',
      parentRunId: undefined,
      extraParams: { tools: [] },
      tags: undefined,
      metadata: { tenant: 'acme' },
    };
    expect(calls).toEqual([call, call]);
  });

  it('decides for each run of the same handler', () => {
    const record = (call: LangChainCallInfo): boolean => 'metadata' in call && call.metadata?.privacy === 'public';
    const handler = createLangChainCallbackHandler({ recordInputs: record, recordOutputs: record });

    handler.handleChatModelStart?.(CHAT_MODEL, MESSAGES, 'public', undefined, undefined, undefined, {
      privacy: 'public',
    });
    handler.handleChatModelStart?.(CHAT_MODEL, MESSAGES, 'private', undefined, undefined, undefined, {
      privacy: 'private',
    });
    handler.handleLLMEnd?.(OUTPUT, 'public');
    handler.handleLLMEnd?.(OUTPUT, 'private');

    expect(endedSpans.map(recorded)).toEqual([
      { inputs: true, outputs: true },
      { inputs: false, outputs: false },
    ]);
  });

  it("runs the functions in the async context of the start callback's caller", async () => {
    const record = (): boolean => getCurrentScope().getScopeData().tags.privacy === 'public';
    const options = { recordInputs: record, recordOutputs: record };

    await withScope(async scope => {
      scope.setTag('privacy', 'public');
      chat(options, 'run-1');
    });
    await withScope(async scope => {
      scope.setTag('privacy', 'private');
      chat(options, 'run-2');
    });

    expect(endedSpans.map(recorded)).toEqual([
      { inputs: true, outputs: true },
      { inputs: false, outputs: false },
    ]);
  });

  it('decides inputs and outputs separately', () => {
    chat({ recordInputs: () => false, recordOutputs: () => true }, 'run-1');

    expect(endedSpans.map(recorded)).toEqual([{ inputs: false, outputs: true }]);
  });

  it('records outputs in the end callback as decided at start', () => {
    let recordOutputs = true;
    let outputCalls = 0;
    const handler = createLangChainCallbackHandler({
      recordOutputs: () => {
        outputCalls++;
        return recordOutputs;
      },
    });

    handler.handleToolStart?.({ name: 'search' }, '{"q":"paris"}', 'tool-run');
    recordOutputs = false;
    handler.handleToolEnd?.('Paris', 'tool-run');

    expect(outputCalls).toBe(1);
    expect(endedSpans.map(recorded)).toEqual([{ inputs: true, outputs: true }]);
  });

  it('follows the decision of the LangGraph run the callback belongs to', () => {
    let called = false;
    const record = (): boolean => {
      called = true;
      return true;
    };

    chat({ recordInputs: record, recordOutputs: record }, 'run-1', {
      __sentry_langgraph__: { recordInputs: false, recordOutputs: true },
    });

    expect(called).toBe(false);
    expect(endedSpans.map(recorded)).toEqual([{ inputs: false, outputs: true }]);
  });

  it('passes the embed call argument to the functions of instrumentLangChainEmbeddings', async () => {
    const calls: LangChainCallInfo[] = [];
    const embeddings = instrumentLangChainEmbeddings(
      { model: 'text-embedding-3-small', embedQuery: async () => [0.1], embedDocuments: async () => [[0.1]] },
      {
        recordInputs: call => {
          calls.push(call);
          return call.operation === 'embeddings' && call.input === 'public';
        },
      },
    );

    await embeddings.embedQuery('public');
    await embeddings.embedDocuments(['private']);

    expect(calls).toEqual([
      { operation: 'embeddings', input: 'public' },
      { operation: 'embeddings', input: ['private'] },
    ]);
    expect(endedSpans.map(span => GEN_AI_EMBEDDINGS_INPUT in spanToJSON(span).attributes)).toEqual([true, false]);
  });
});
