import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { createLangChainCallbackHandler } from '../../../../src/ai/langchain';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('LangChain chat span names', () => {
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

  function runChatModel(model?: string): void {
    const handler = createLangChainCallbackHandler();
    handler.handleChatModelStart?.(
      { id: ['langchain', 'chat_models', 'ChatOpenAI'] },
      [[{ content: 'Hello', _getType: () => 'human' }]],
      'run-1',
      undefined,
      undefined,
      (model === undefined ? {} : { invocation_params: { model } }) as unknown as string[],
    );
    handler.handleLLMEnd?.({ generations: [] }, 'run-1');
  }

  it('names the span `{operation} {model}` when a model is present', () => {
    const endedSpans = setupClient('stream');
    runChatModel('gpt-4');

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('chat gpt-4');
  });

  it('uses the operation name when the model is missing and span streaming is enabled', () => {
    const endedSpans = setupClient('stream');
    runChatModel();

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('chat');
  });

  it('treats an empty-string model as missing', () => {
    const endedSpans = setupClient('stream');
    runChatModel('');

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('chat');
  });
});
