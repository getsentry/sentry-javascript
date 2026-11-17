import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
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
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { GEN_AI_DECIDE } from '@sentry/conventions/op';
import { getClient, getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
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
 * the model and the config on the instance, as the real `Chat` does, and exposes the two
 * message-sending methods. Neither is repeated in the arguments of a `sendMessage()` call.
 */
function createFakeChatClient(): { chats: { create: (params: Record<string, unknown>) => unknown } } {
  return {
    chats: {
      create: (params: Record<string, unknown>) => ({
        model: params.model,
        config: params.config,
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

  it('reports the chat config on chat.sendMessage() spans', async () => {
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
    expect(data[GEN_AI_INPUT_MESSAGES]).toBe('[{"role":"user","parts":[{"type":"text","content":"Tell me a joke"}]}]');
  });

  it('reports the chat config on chat.sendMessageStream() spans', async () => {
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

  it('replaces the chat config when a message provides its own', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentGoogleGenAIClient(createFakeChatClient());

    const chat = instrumented.chats.create({ model: CHAT_MODEL, config: CHAT_CONFIG }) as {
      sendMessage: (params: Record<string, unknown>) => Promise<unknown>;
    };
    await chat.sendMessage({ message: 'Tell me a joke', config: { temperature: 0.1 } });

    const data = spanToStaticSpanJSON(endedSpans[0]!).data;
    // @google/genai resolves the request config as `params.config ?? chat.config`, so the
    // per-message config is sent on its own. The chat config fields it omits are not part of the
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

  it('falls back to the chat config when a message passes `config: null`', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentGoogleGenAIClient(createFakeChatClient());

    const chat = instrumented.chats.create({ model: CHAT_MODEL, config: CHAT_CONFIG }) as {
      sendMessage: (params: Record<string, unknown>) => Promise<unknown>;
    };
    // `@google/genai` resolves `params.config ?? chat.config`, so an explicit null still inherits.
    await chat.sendMessage({ message: 'Tell me a joke', config: null });

    const data = spanToStaticSpanJSON(endedSpans[0]!).data;
    expect(data[GEN_AI_REQUEST_TEMPERATURE]).toBe(0.8);
    expect(data[GEN_AI_REQUEST_MAX_TOKENS]).toBe(150);
  });

  it('records no config when the chat was created without one', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentGoogleGenAIClient(createFakeChatClient());

    const chat = instrumented.chats.create({ model: CHAT_MODEL }) as {
      sendMessage: (params: Record<string, unknown>) => Promise<unknown>;
    };
    await chat.sendMessage({ message: 'Tell me a joke' });

    const data = spanToStaticSpanJSON(endedSpans[0]!).data;
    expect(data[GEN_AI_REQUEST_MODEL]).toBe(CHAT_MODEL);
    expect(data[GEN_AI_REQUEST_TEMPERATURE]).toBeUndefined();
    expect(data[GEN_AI_TOOL_DEFINITIONS]).toBeUndefined();
  });

  it('keeps each chat on its own config', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentGoogleGenAIClient(createFakeChatClient());

    type FakeChat = { sendMessage: (params: Record<string, unknown>) => Promise<unknown> };
    const hot = instrumented.chats.create({ model: CHAT_MODEL, config: { temperature: 0.9 } }) as FakeChat;
    const cold = instrumented.chats.create({ model: CHAT_MODEL, config: { temperature: 0.1 } }) as FakeChat;

    await hot.sendMessage({ message: 'Tell me a joke' });
    await cold.sendMessage({ message: 'Tell me a joke' });

    expect(spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_REQUEST_TEMPERATURE]).toBe(0.9);
    expect(spanToStaticSpanJSON(endedSpans[1]!).data[GEN_AI_REQUEST_TEMPERATURE]).toBe(0.1);
  });

  it('reports the chat config with the static trace lifecycle', async () => {
    const endedSpans = setupClient('static');
    const instrumented = instrumentGoogleGenAIClient(createFakeChatClient());

    const chat = instrumented.chats.create({ model: CHAT_MODEL, config: CHAT_CONFIG }) as {
      sendMessage: (params: Record<string, unknown>) => Promise<unknown>;
    };
    await chat.sendMessage({ message: 'Tell me a joke' });

    const data = spanToStaticSpanJSON(endedSpans[0]!).data;
    expect(data[GEN_AI_REQUEST_TEMPERATURE]).toBe(0.8);
    expect(data[GEN_AI_REQUEST_MAX_TOKENS]).toBe(150);
  });
});

describe('instrumentGoogleGenAIClient decisions.create', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  const DECISION_REQUEST = {
    model: 'models/gemini-3-flash',
    input: 'I was charged twice and want a refund.',
    questions: { wants_refund: { type: 'noul', instructions: 'Is a refund requested?' } },
  };
  const DECISION_RESPONSE = {
    answers: { wants_refund: { type: 'noul', noul: 0.97, confidence: 0.94 } },
    usage: { total_input_tokens: 382, total_cached_tokens: 256, total_output_tokens: 0, total_tokens: 382 },
  };

  function fakeDecisionsClient(create = vi.fn().mockResolvedValue(DECISION_RESPONSE)) {
    return { decisions: { create } };
  }

  it('records the input when the span starts, so samplers can read it', async () => {
    setupClient('stream');
    const inputsAtStart: unknown[] = [];
    getClient()!.on('spanStart', span => inputsAtStart.push(spanToStaticSpanJSON(span).data[GEN_AI_INPUT_MESSAGES]));
    const instrumented = instrumentGoogleGenAIClient(fakeDecisionsClient());

    await instrumented.decisions.create(DECISION_REQUEST);

    expect(inputsAtStart).toEqual([
      JSON.stringify([{ type: 'evaluation', state: DECISION_REQUEST.input, questions: DECISION_REQUEST.questions }]),
    ]);
  });

  it('records a decide span with its answers and token usage', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentGoogleGenAIClient(fakeDecisionsClient());

    await instrumented.decisions.create(DECISION_REQUEST);

    expect(endedSpans).toHaveLength(1);
    const json = spanToStaticSpanJSON(endedSpans[0]!);
    expect(json.description).toBe('decide models/gemini-3-flash');
    expect(json.op).toBe(GEN_AI_DECIDE);
    expect(json.data[GEN_AI_OPERATION_NAME]).toBe('decide');
    expect(json.data[GEN_AI_USAGE_INPUT_TOKENS]).toBe(382);
    expect(json.data[GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]).toBe(256);
    expect(json.data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(0);
    expect(json.data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(382);
    expect(JSON.parse(json.data[GEN_AI_OUTPUT_MESSAGES] as string)).toEqual([
      { type: 'evaluation', answers: DECISION_RESPONSE.answers },
    ]);
  });

  it('records neither input nor answers when recording is off', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentGoogleGenAIClient(fakeDecisionsClient(), {
      recordInputs: false,
      recordOutputs: false,
    });

    await instrumented.decisions.create(DECISION_REQUEST);

    const { data } = spanToStaticSpanJSON(endedSpans[0]!);
    expect(data[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
    expect(data[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
    expect(data[GEN_AI_USAGE_INPUT_TOKENS]).toBe(382);
  });

  it('marks a failed call as an internal error', async () => {
    const endedSpans = setupClient('stream');
    const instrumented = instrumentGoogleGenAIClient(
      fakeDecisionsClient(vi.fn().mockRejectedValue(new Error('500 Internal server error'))),
    );

    await expect(instrumented.decisions.create(DECISION_REQUEST)).rejects.toThrow('500 Internal server error');

    expect(endedSpans).toHaveLength(1);
    expect(spanToStaticSpanJSON(endedSpans[0]!).status).toBe('internal_error');
  });
});
