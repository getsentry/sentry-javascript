import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_USAGE_INPUT_TOKENS,
} from '@sentry/conventions/attributes';
import { getClient, getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markEveGenAiRecordingDefault } from '../../../src/integrations/vercel-ai/gen-ai-recording-mode';
import {
  createSpanFromMessage,
  enrichSpanOnEnd,
  setFallbackChannelResult,
} from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

// eve stamps every AI SDK call with `recordInputs: false`, which the channel subscriber otherwise
// honors over the global default. `eveIntegration()` (via `markEveGenAiRecordingDefault`) flips that so
// content is recorded by default under eve, while explicit settings still win.
describe('Vercel AI recording under eve', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function setupClient(dataCollection: { genAI?: { inputs?: boolean } } = {}): void {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        dataCollection,
      }),
    );
    setCurrentClient(client);
    client.init();
  }

  // A `generateText` operation carrying input messages and eve's per-call `recordInputs: false`.
  function recordedInputMessages(
    messages: unknown[] = [{ role: 'user', content: 'What is the weather in Paris?' }],
  ): unknown {
    const message = {
      type: 'generateText',
      event: {
        messages,
        recordInputs: false,
      },
    } as Parameters<typeof createSpanFromMessage>[0];
    const span = createSpanFromMessage(message, {});
    return (spanToStaticSpanJSON(span!).data ?? {})[GEN_AI_INPUT_MESSAGES];
  }

  it('honors the per-call recordInputs:false without eve mode', () => {
    setupClient();

    expect(recordedInputMessages()).toBeUndefined();
  });

  it('records inputs by default under eve despite the per-call recordInputs:false', () => {
    setupClient();
    markEveGenAiRecordingDefault(getClient()!);

    expect(recordedInputMessages()).toContain('What is the weather in Paris?');
  });

  it('records no input messages when ai emptied them', () => {
    setupClient();
    markEveGenAiRecordingDefault(getClient()!);

    expect(recordedInputMessages([])).toBeUndefined();
  });

  it.each([
    ['embed', { value: '' }, GEN_AI_EMBEDDINGS_INPUT],
    ['embedMany', { values: [] }, GEN_AI_EMBEDDINGS_INPUT],
    ['experimental_decide', { state: {}, questions: {} }, GEN_AI_INPUT_MESSAGES],
  ])('records no input when ai emptied it on %s', (type, event, attribute) => {
    setupClient();
    markEveGenAiRecordingDefault(getClient()!);

    const message = { type, event: { ...event, recordInputs: false } } as Parameters<typeof createSpanFromMessage>[0];
    const span = createSpanFromMessage(message, {});

    expect(spanToStaticSpanJSON(span!).data?.[attribute]).toBeUndefined();
  });

  it('still honors an explicit dataCollection.genAI opt-out under eve', () => {
    setupClient({ genAI: { inputs: false } });
    markEveGenAiRecordingDefault(getClient()!);

    expect(recordedInputMessages()).toBeUndefined();
  });

  // A `languageModelCall` with eve's per-call `recordOutputs: false`, settled either from `ai`'s channel result or,
  // when `ai` withheld it, from the result Sentry read itself.
  function settledModelCall(source: 'channel' | 'fallback'): Record<string, unknown> {
    const result = {
      content: [{ type: 'text', text: 'It is sunny in Paris.' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: { inputTokens: { total: 10 }, outputTokens: { total: 20 } },
    };
    const message = {
      type: 'languageModelCall',
      event: { modelId: 'gpt-4o-mini', provider: 'openai', recordOutputs: false },
      ...(source === 'channel' ? { result } : {}),
    } as Parameters<typeof createSpanFromMessage>[0];
    const span = createSpanFromMessage(message, {})!;
    if (source === 'fallback') {
      setFallbackChannelResult(span, result);
    }
    enrichSpanOnEnd(span, message, {});
    return spanToStaticSpanJSON(span).data ?? {};
  }

  it('records outputs under eve from a result ai published', () => {
    setupClient();
    markEveGenAiRecordingDefault(getClient()!);

    expect(settledModelCall('channel')[GEN_AI_OUTPUT_MESSAGES]).toContain('It is sunny in Paris.');
  });

  it('records only metadata under eve from a result ai withheld', () => {
    setupClient();
    markEveGenAiRecordingDefault(getClient()!);

    const data = settledModelCall('fallback');

    expect(data[GEN_AI_USAGE_INPUT_TOKENS]).toBe(10);
    expect(data[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
  });
});
