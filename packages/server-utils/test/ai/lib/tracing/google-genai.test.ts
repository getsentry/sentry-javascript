import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_FREQUENCY_PENALTY,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_PRESENCE_PENALTY,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_K,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
} from '@sentry/conventions/attributes';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import { instrumentGoogleGenAIClient } from '../../../../src/ai/google-genai';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

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

describe('instrumentGoogleGenAIClient span names', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function fakeClient(): {
    models: { generateContent: ReturnType<typeof vi.fn> };
    chats: { create: ReturnType<typeof vi.fn> };
  } {
    return {
      models: {
        generateContent: vi.fn().mockResolvedValue({ candidates: [] }),
      },
      chats: {
        create: vi.fn().mockReturnValue({ sendMessage: vi.fn() }),
      },
    };
  }

  it('names the span `{operation} {model}` when a model is present', async () => {
    const endedSpans = setupClient('stream');
    const client = fakeClient();
    const instrumented = instrumentGoogleGenAIClient(client);

    await instrumented.models.generateContent({ model: 'gemini-1.5-pro', contents: 'Hello' });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('generate_content gemini-1.5-pro');
  });

  it('keeps `generate_content unknown` when the model is missing in static mode', async () => {
    const endedSpans = setupClient('static');
    const client = fakeClient();
    const instrumented = instrumentGoogleGenAIClient(client);

    await instrumented.models.generateContent({ contents: 'Hello' });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('generate_content unknown');
  });

  it('uses the operation name when the model is missing and span streaming is enabled', async () => {
    const endedSpans = setupClient('stream');
    const client = fakeClient();
    const instrumented = instrumentGoogleGenAIClient(client);

    await instrumented.models.generateContent({ contents: 'Hello' });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('generate_content');
  });

  it('treats an empty-string model as missing', async () => {
    const endedSpans = setupClient('stream');
    const client = fakeClient();
    const instrumented = instrumentGoogleGenAIClient(client);

    await instrumented.models.generateContent({ model: '', contents: 'Hello' });

    expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('generate_content');
  });

  it('does not start a span for chats.create', () => {
    const endedSpans = setupClient('stream');
    const client = fakeClient();
    const instrumented = instrumentGoogleGenAIClient(client);

    instrumented.chats.create({ model: 'gemini-1.5-pro' });

    expect(endedSpans).toHaveLength(0);
  });
});

const CHAT_MODEL = 'gemini-1.5-pro';

const CHAT_CONFIG = {
  temperature: 0.8,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 150,
  frequencyPenalty: 0.5,
  presencePenalty: 0.3,
  tools: [{ functionDeclarations: [{ name: 'getWeather' }] }],
  systemInstruction: 'You are a friendly robot.',
};

const MOCK_RESPONSE = {
  modelVersion: CHAT_MODEL,
  candidates: [{ content: { parts: [{ text: 'Hi there!' }], role: 'model' } }],
  usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 12, totalTokenCount: 20 },
};

/**
 * Minimal stand-in for a `@google/genai` client. `chats.create()` returns a chat object that keeps
 * the model (as the real SDK does) and exposes the two message-sending methods. The config passed to
 * `create()` is stored on the SDK internally and is not repeated on each `sendMessage()` call.
 */
function createFakeChatClient(): { chats: { create: (params: Record<string, unknown>) => unknown } } {
  return {
    chats: {
      create: (params: Record<string, unknown>) => ({
        model: params.model,
        sendMessage: async (_params: Record<string, unknown>) => MOCK_RESPONSE,
        sendMessageStream: async (_params: Record<string, unknown>) =>
          (async function* () {
            yield MOCK_RESPONSE;
          })(),
      }),
    },
  };
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of stream) {
    // consume so the streaming span is ended
  }
}

describe('instrumentGoogleGenAIClient chat config propagation', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('welds chats.create() config onto chat.sendMessage() spans', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentGoogleGenAIClient(createFakeChatClient());

    const chat = instrumented.chats.create({ model: CHAT_MODEL, config: CHAT_CONFIG }) as {
      sendMessage: (params: Record<string, unknown>) => Promise<unknown>;
    };
    await chat.sendMessage({ message: 'Tell me a joke' });

    expect(endedSpans).toHaveLength(1);
    const data = spanToStaticSpanJSON(endedSpans[0]!).data;

    expect(data[GEN_AI_OPERATION_NAME]).toBe('chat');
    expect(data[GEN_AI_PROVIDER_NAME]).toBe('google_genai');
    expect(data[GEN_AI_REQUEST_MODEL]).toBe(CHAT_MODEL);
    expect(data[GEN_AI_REQUEST_TEMPERATURE]).toBe(0.8);
    expect(data[GEN_AI_REQUEST_TOP_P]).toBe(0.9);
    expect(data[GEN_AI_REQUEST_TOP_K]).toBe(40);
    expect(data[GEN_AI_REQUEST_MAX_TOKENS]).toBe(150);
    expect(data[GEN_AI_REQUEST_FREQUENCY_PENALTY]).toBe(0.5);
    expect(data[GEN_AI_REQUEST_PRESENCE_PENALTY]).toBe(0.3);
    expect(data[GEN_AI_TOOL_DEFINITIONS]).toBe('[{"name":"getWeather"}]');
    expect(data[GEN_AI_SYSTEM_INSTRUCTIONS]).toBe('[{"type":"text","content":"You are a friendly robot."}]');
    // The chat message stays as the only input message; the system instruction is split out above.
    expect(data[GEN_AI_INPUT_MESSAGES]).toBe('[{"role":"user","content":"Tell me a joke"}]');
  });

  it('welds chats.create() config onto chat.sendMessageStream() spans', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentGoogleGenAIClient(createFakeChatClient());

    const chat = instrumented.chats.create({ model: CHAT_MODEL, config: CHAT_CONFIG }) as {
      sendMessageStream: (params: Record<string, unknown>) => Promise<AsyncIterable<unknown>>;
    };
    await drain(await chat.sendMessageStream({ message: 'Tell me a joke' }));

    expect(endedSpans).toHaveLength(1);
    const data = spanToStaticSpanJSON(endedSpans[0]!).data;

    expect(data[GEN_AI_OPERATION_NAME]).toBe('chat');
    expect(data[GEN_AI_REQUEST_MODEL]).toBe(CHAT_MODEL);
    expect(data[GEN_AI_REQUEST_TEMPERATURE]).toBe(0.8);
    expect(data[GEN_AI_REQUEST_TOP_P]).toBe(0.9);
    expect(data[GEN_AI_REQUEST_TOP_K]).toBe(40);
    expect(data[GEN_AI_REQUEST_MAX_TOKENS]).toBe(150);
    expect(data[GEN_AI_REQUEST_FREQUENCY_PENALTY]).toBe(0.5);
    expect(data[GEN_AI_REQUEST_PRESENCE_PENALTY]).toBe(0.3);
    expect(data[GEN_AI_TOOL_DEFINITIONS]).toBe('[{"name":"getWeather"}]');
    expect(data[GEN_AI_SYSTEM_INSTRUCTIONS]).toBe('[{"type":"text","content":"You are a friendly robot."}]');
  });

  it('replaces the chats.create() config when a message provides its own', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentGoogleGenAIClient(createFakeChatClient());

    const chat = instrumented.chats.create({ model: CHAT_MODEL, config: CHAT_CONFIG }) as {
      sendMessage: (params: Record<string, unknown>) => Promise<unknown>;
    };
    await chat.sendMessage({ message: 'Tell me a joke', config: { temperature: 0.1 } });

    const data = spanToStaticSpanJSON(endedSpans[0]!).data;
    // @google/genai resolves the request config as `params.config ?? chat.config`, so the
    // per-message config is sent on its own. The create-time fields it omits are not part of the
    // request, so they must not appear on the span.
    expect(data[GEN_AI_REQUEST_TEMPERATURE]).toBe(0.1);
    expect(data[GEN_AI_REQUEST_TOP_P]).toBeUndefined();
    expect(data[GEN_AI_REQUEST_MAX_TOKENS]).toBeUndefined();
    expect(data[GEN_AI_TOOL_DEFINITIONS]).toBeUndefined();
    expect(data[GEN_AI_SYSTEM_INSTRUCTIONS]).toBeUndefined();
  });

  it('does not leak chat config onto models.generateContent spans', async () => {
    const endedSpans = setupClient('stream');
    const client = {
      chats: { create: createFakeChatClient().chats.create },
      models: { generateContent: async (_params: Record<string, unknown>) => MOCK_RESPONSE },
    };
    const instrumented = instrumentGoogleGenAIClient(client);

    // Create a chat (with config) first, then make an unrelated generateContent call.
    instrumented.chats.create({ model: CHAT_MODEL, config: CHAT_CONFIG });
    await instrumented.models.generateContent({ model: 'gemini-1.5-flash' });

    const genContentSpan = endedSpans.find(
      span => spanToStaticSpanJSON(span).data[GEN_AI_OPERATION_NAME] === 'generate_content',
    );
    const data = spanToStaticSpanJSON(genContentSpan!).data;
    expect(data[GEN_AI_REQUEST_MODEL]).toBe('gemini-1.5-flash');
    expect(data[GEN_AI_REQUEST_TEMPERATURE]).toBeUndefined();
    expect(data[GEN_AI_SYSTEM_INSTRUCTIONS]).toBeUndefined();
  });
});
