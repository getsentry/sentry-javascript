import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import {
  _INTERNAL_clearAiProviderSkips,
  _INTERNAL_setSpanForScope,
  _INTERNAL_shouldSkipAiProviderWrapping,
  _INTERNAL_skipAiProviderWrapping,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  GLOBAL_OBJ,
  setAsyncContextStrategy,
  setCurrentClient,
  spanToJSON,
  spanToStaticSpanJSON,
  startSpan,
  withScope,
} from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_REASONING_LEVEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_STATUS_MESSAGE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT } from '@sentry/conventions/op';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../../src/ai/anthropic-ai/constants';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '../../src/ai/google-genai/constants';
import { OPENAI_INTEGRATION_NAME } from '../../src/ai/openai/constants';
import { setPiAiResponseAttributes, startPiAiChatSpan } from '../../src/ai/pi-ai/chat';
import type { PiEventStream } from '../../src/ai/pi-ai/types';
import { instrumentWorkersAiClient } from '../../src/ai/workers-ai';
import { piAiIntegration } from '../../src/integrations/pi-ai';
import { CHANNELS } from '../../src/orchestrion/channels';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

// `bindTracingChannelToSpan` only binds when the strategy has a `getTracingChannelBinding`.
function installTestAsyncContextStrategy(): void {
  const asyncStorage = new AsyncLocalStorage<TestStore>();

  function getScopes(): TestStore {
    return asyncStorage.getStore() || { scope: getDefaultCurrentScope(), isolationScope: getDefaultIsolationScope() };
  }

  setAsyncContextStrategy({
    withScope: callback => {
      const scope = getScopes().scope.clone();
      const isolationScope = getScopes().isolationScope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(scope));
    },
    withSetScope: (scope, callback) => {
      const isolationScope = getScopes().isolationScope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(scope));
    },
    withIsolationScope: callback => {
      const scope = getScopes().scope;
      const isolationScope = getScopes().isolationScope.clone();
      return asyncStorage.run({ scope, isolationScope }, () => callback(isolationScope));
    },
    withSetIsolationScope: (isolationScope, callback) => {
      const scope = getScopes().scope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(isolationScope));
    },
    getCurrentScope: () => getScopes().scope,
    getIsolationScope: () => getScopes().isolationScope,
    getTracingChannelBinding: () => ({
      asyncLocalStorage: asyncStorage,
      getStoreWithActiveSpan: (span: Span) => {
        const scope = getScopes().scope.clone();
        const isolationScope = getScopes().isolationScope;
        _INTERNAL_setSpanForScope(scope, span);
        return { scope, isolationScope };
      },
    }),
  });
}

const MODEL = { id: 'faux-model', provider: 'faux' };
const ANSWER = { role: 'assistant', content: [{ type: 'text', text: 'Paris.' }], stopReason: 'stop' };

const streamChannel = tracingChannel(CHANNELS.PI_AI_STREAM);
const completeChannel = tracingChannel(CHANNELS.PI_AI_COMPLETE);
const streamDeferredChannel = tracingChannel(CHANNELS.PI_AI_STREAM_DEFERRED);
const fetchDeferredChannel = tracingChannel(CHANNELS.PI_AI_FETCH_DEFERRED);

// What the orchestrion transform turns the pi-ai entry points into.
function stream(send: () => unknown, ...args: unknown[]): PiEventStream {
  return streamChannel.traceSync(send, { arguments: args }) as PiEventStream;
}

function complete(send: () => Promise<unknown>, ...args: unknown[]): Promise<unknown> {
  return completeChannel.tracePromise(send, { arguments: args });
}

function settlesWith(message: unknown): () => PiEventStream {
  return () => ({ result: async () => message }) as PiEventStream;
}

describe('piAiIntegration', () => {
  let endedSpans: Span[];
  let client: TestClient;

  function useClient(options: Partial<Parameters<typeof getDefaultTestClientOptions>[0]> = {}): void {
    client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1, ...options }),
    );
    setCurrentClient(client);
    client.init();
    client.on('spanEnd', span => endedSpans.push(span));
  }

  beforeAll(() => {
    installTestAsyncContextStrategy();
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@earendil-works/pi-ai'] };
    endedSpans = [];
    useClient();
    piAiIntegration().setup!(client);
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  beforeEach(() => {
    _INTERNAL_clearAiProviderSkips();
    endedSpans = [];
    useClient();
  });

  afterEach(() => {
    _INTERNAL_clearAiProviderSkips();
  });

  it('traces a streamed request and skips the provider SDK integrations', async () => {
    const message = { ...ANSWER, model: 'faux-model', usage: { input: 10, output: 2, totalTokens: 12 } };

    await stream(settlesWith(message), MODEL, { messages: [{ role: 'user', content: 'Capital of France?' }] }).result();

    expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
    const chat = spanToJSON(endedSpans[0]!);
    expect(chat.name).toBe('chat faux-model');
    expect(chat.attributes[SENTRY_OP]).toBe(GEN_AI_CHAT);
    expect(chat.attributes).toMatchObject({
      [SENTRY_ORIGIN]: 'auto.ai.pi_ai',
      [GEN_AI_PROVIDER_NAME]: 'faux',
      [GEN_AI_REQUEST_MODEL]: 'faux-model',
      [GEN_AI_RESPONSE_STREAMING]: true,
      [GEN_AI_RESPONSE_FINISH_REASONS]: '["stop"]',
      [GEN_AI_USAGE_INPUT_TOKENS]: 10,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: 2,
      [GEN_AI_INPUT_MESSAGES]: '[{"role":"user","parts":[{"type":"text","content":"Capital of France?"}]}]',
      [GEN_AI_OUTPUT_MESSAGES]:
        '[{"role":"assistant","parts":[{"type":"text","content":"Paris."}],"finish_reason":"stop"}]',
    });
  });

  it('ends a streamed span only once its result settles', async () => {
    let settle!: (message: unknown) => void;
    const result = new Promise(resolve => {
      settle = resolve;
    });

    const events = stream(() => ({ result: () => result }), MODEL, { messages: [] });
    expect(endedSpans).toHaveLength(0);

    settle(ANSWER);
    await events.result();
    expect(endedSpans).toHaveLength(1);
  });

  it.each([
    ['stream', streamChannel, true, false],
    ['complete', completeChannel, false, false],
    ['streamDeferred', streamDeferredChannel, true, true],
    ['fetchDeferred', fetchDeferredChannel, false, true],
  ] as const)(
    'traces %s with the request options and the response identity',
    async (_name, channel, streaming, deferred) => {
      const message = { ...ANSWER, responseModel: 'faux-model-2026', responseId: 'resp_1' };
      const args = [
        { ...MODEL, baseUrl: 'https://api.example.com:8443/v1' },
        { messages: [{ role: 'user', content: 'Hi.' }] },
        { temperature: 0.2, maxTokens: 50, reasoning: 'low' },
      ];

      if (streaming) {
        await (channel.traceSync(settlesWith(message), { arguments: args }) as PiEventStream).result();
      } else {
        await channel.tracePromise(async () => message, { arguments: args });
      }

      const chat = spanToJSON(endedSpans[0]!);
      expect(chat.name).toBe('chat faux-model');
      expect(chat.attributes[GEN_AI_RESPONSE_STREAMING]).toBe(streaming ? true : undefined);
      expect(chat.attributes[GEN_AI_RESPONSE_MODEL]).toBe('faux-model-2026');
      expect(chat.attributes[GEN_AI_RESPONSE_ID]).toBe('resp_1');
      expect(chat.attributes[SERVER_ADDRESS]).toBe('api.example.com');
      expect(chat.attributes[SERVER_PORT]).toBe(8443);
      // The deferred methods take a handle, not a request, so there is nothing to record.
      expect(chat.attributes[GEN_AI_REQUEST_TEMPERATURE]).toBe(deferred ? undefined : 0.2);
      expect(chat.attributes[GEN_AI_REQUEST_MAX_TOKENS]).toBe(deferred ? undefined : 50);
      expect(chat.attributes[GEN_AI_REQUEST_REASONING_LEVEL]).toBe(deferred ? undefined : 'low');
      expect(chat.attributes[GEN_AI_INPUT_MESSAGES]).toBe(
        deferred ? undefined : '[{"role":"user","parts":[{"type":"text","content":"Hi."}]}]',
      );
    },
  );

  // `complete` awaits the stream of `stream`, and the `compat` functions hand some models to a
  // `Models` of their own: each is one request.
  it('traces a call that makes another traced call as one request', async () => {
    await complete(() => stream(settlesWith(ANSWER), MODEL, { messages: [] }).result(), MODEL, { messages: [] });
    await stream(() => stream(settlesWith(ANSWER), MODEL, { messages: [] }), MODEL, { messages: [] }).result();

    expect(endedSpans.map(span => spanToJSON(span).attributes[GEN_AI_RESPONSE_STREAMING])).toEqual([undefined, true]);
  });

  it('traces requests after a nested one, and after one that threw', async () => {
    expect(() =>
      stream(() => {
        throw new Error('sync boom');
      }, MODEL),
    ).toThrow('sync boom');
    await complete(() => stream(settlesWith(ANSWER), MODEL).result(), MODEL);
    await complete(async () => ANSWER, MODEL);

    expect(endedSpans).toHaveLength(3);
  });

  it('parents the span to the active span and makes it active for the provider call', async () => {
    let providerParent: string | undefined;

    await startSpan({ name: 'agent' }, async parent => {
      await stream(
        () => {
          providerParent = startSpan({ name: 'provider' }, span => spanToJSON(span).parent_span_id);
          return { result: async () => ANSWER };
        },
        MODEL,
        { messages: [] },
      ).result();

      const chat = endedSpans.map(span => spanToJSON(span)).find(span => span.attributes[SENTRY_OP] === GEN_AI_CHAT)!;
      expect(chat.parent_span_id).toBe(parent.spanContext().spanId);
      expect(providerParent).toBe(chat.span_id);
    });
  });

  it('sets the conversation id of the scope on the chat span', async () => {
    await withScope(async scope => {
      scope.setConversationId('harness:7');
      await complete(async () => ANSWER, MODEL, { messages: [] });
    });

    expect(spanToJSON(endedSpans[0]!).attributes[GEN_AI_CONVERSATION_ID]).toBe('harness:7');
  });

  it('counts the cached tokens of a response into its input tokens', async () => {
    const message = {
      ...ANSWER,
      usage: { input: 37, output: 2, cacheRead: 52, cacheWrite: 38, reasoning: 1, totalTokens: 129 },
    };

    await complete(async () => message, MODEL, { messages: [] });

    expect(spanToJSON(endedSpans[0]!).attributes).toMatchObject({
      [GEN_AI_USAGE_INPUT_TOKENS]: 127,
      [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 52,
      [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 38,
      [GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]: 1,
      [GEN_AI_USAGE_TOTAL_TOKENS]: 129,
    });
  });

  // The provider parks the request and the caller fetches the answer later: only the fetch is billed.
  it('records no usage for a request the provider parked, and the usage of its answer', async () => {
    const parked = { role: 'assistant', content: [], stopReason: 'deferred', usage: { input: 0, totalTokens: 0 } };
    const answer = { ...ANSWER, usage: { input: 8, output: 2, totalTokens: 10 } };

    await complete(async () => parked, MODEL, { messages: [] });
    await fetchDeferredChannel.tracePromise(async () => answer, { arguments: [MODEL, { id: 'handle_1' }] });

    const [parkedChat, answerChat] = endedSpans.map(span => spanToJSON(span).attributes);
    expect(parkedChat![GEN_AI_RESPONSE_FINISH_REASONS]).toBe('["deferred"]');
    expect(parkedChat![GEN_AI_USAGE_TOTAL_TOKENS]).toBeUndefined();
    expect(answerChat![GEN_AI_USAGE_TOTAL_TOKENS]).toBe(10);
  });

  it('marks a failed or aborted request with a fixed status message and maps a tool-calling stop', async () => {
    const failed = {
      role: 'assistant',
      content: [],
      stopReason: 'error',
      errorMessage: '401 invalid x-api-key for user@example.com',
      usage: { input: 0, output: 0, totalTokens: 0 },
    };
    const aborted = { role: 'assistant', content: [], stopReason: 'aborted' };
    const toolCall = {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'a.txt' } }],
      stopReason: 'toolUse',
    };

    await complete(async () => failed, MODEL, { messages: [] });
    await stream(settlesWith(aborted), MODEL, { messages: [] }).result();
    await complete(async () => toolCall, MODEL, { messages: [] });

    const [chatFailed, , chatToolCall] = endedSpans.map(span => spanToJSON(span));
    expect(chatFailed!.status).toBe('error');
    expect(chatFailed!.attributes[SENTRY_STATUS_MESSAGE]).toBe('internal_error');
    expect(JSON.stringify(chatFailed!.attributes)).not.toContain('x-api-key');
    expect(chatFailed!.attributes[GEN_AI_USAGE_TOTAL_TOKENS]).toBeUndefined();
    // Streamed span JSON reports a cancellation as `ok`; the static one keeps it.
    expect(spanToStaticSpanJSON(endedSpans[1]!).status).toBe('cancelled');
    expect(chatToolCall!.attributes[GEN_AI_RESPONSE_FINISH_REASONS]).toBe('["tool_call"]');
    expect(chatToolCall!.attributes[GEN_AI_OUTPUT_MESSAGES]).toContain('"finish_reason":"tool_call"');
  });

  it('marks a rejected, throwing or broken request as errored and keeps the error', async () => {
    await expect(
      complete(async () => {
        throw new Error('boom');
      }, MODEL),
    ).rejects.toThrow('boom');
    expect(() =>
      stream(() => {
        throw new Error('sync boom');
      }, MODEL),
    ).toThrow('sync boom');
    const broken = stream(() => ({ result: () => Promise.reject(new Error('broken provider')) }), MODEL);
    await expect(broken.result()).rejects.toThrow('broken provider');

    expect(endedSpans.map(span => spanToJSON(span).status)).toEqual(['error', 'error', 'error']);
  });

  it('returns a result of another shape unchanged and ends its span', () => {
    const events = { events: [] };

    expect(stream(() => events, MODEL)).toBe(events);

    expect(endedSpans.map(span => spanToJSON(span).attributes[SENTRY_OP])).toEqual([GEN_AI_CHAT]);
  });

  it('reads the system prompt and the tools from the positional system messages', async () => {
    // pi-durable never sets `systemPrompt` or `tools`: it sends prompt sections and tool changes as
    // system messages, and each request replays them.
    await stream(settlesWith({ role: 'assistant', content: [], stopReason: 'stop' }), MODEL, {
      messages: [
        {
          role: 'system',
          content: '',
          sections: { preamble: 'You help.' },
          toolsAdded: [{ name: 'read' }, { name: 'bash' }],
        },
        { role: 'user', content: 'Hi.' },
        { role: 'system', content: '', sections: { mode: 'Plan only.' }, toolsRemoved: [{ name: 'bash' }] },
      ],
    }).result();

    const chat = spanToJSON(endedSpans[0]!);
    expect(chat.attributes[GEN_AI_SYSTEM_INSTRUCTIONS]).toBe('You help.\n\nPlan only.');
    expect(chat.attributes[GEN_AI_TOOL_DEFINITIONS]).toBe('[{"name":"read"}]');
    expect(chat.attributes[GEN_AI_INPUT_MESSAGES]).toBe('[{"role":"user","parts":[{"type":"text","content":"Hi."}]}]');
  });

  describe('provider skip', () => {
    it('skips the provider integrations on the first request, not at setup', async () => {
      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);

      await complete(async () => ANSWER, MODEL, { messages: [] });

      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(true);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(GOOGLE_GENAI_INTEGRATION_NAME)).toBe(true);
    });

    // The registry is reset per client, so a one-shot call would be undone by the next `init()`.
    it('applies the skip again after the registry is cleared', async () => {
      await complete(async () => ANSWER, MODEL, { messages: [] });
      _INTERNAL_clearAiProviderSkips();
      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(false);

      await complete(async () => ANSWER, MODEL, { messages: [] });

      expect(_INTERNAL_shouldSkipAiProviderWrapping(OPENAI_INTEGRATION_NAME)).toBe(true);
    });

    it('applies the skip to every provider when only some are already registered', async () => {
      _INTERNAL_skipAiProviderWrapping([OPENAI_INTEGRATION_NAME]);

      await complete(async () => ANSWER, MODEL, { messages: [] });

      expect(_INTERNAL_shouldSkipAiProviderWrapping(ANTHROPIC_AI_INTEGRATION_NAME)).toBe(true);
      expect(_INTERNAL_shouldSkipAiProviderWrapping(GOOGLE_GENAI_INTEGRATION_NAME)).toBe(true);
    });

    // `createAI()` of `agents/models/pi-ai` sends pi-ai requests through the Workers AI binding.
    it('reports a request sent through the Workers AI binding once', async () => {
      const ai = instrumentWorkersAiClient({
        run: async (_model: string, _inputs: unknown, _options: unknown) => new Response('{}'),
        gateway: () => ({}),
        toMarkdown: async () => [],
      });

      await complete(
        async () => {
          await ai.run('@cf/moonshotai/kimi-k2.7-code', { messages: [] }, { returnRawResponse: true });
          return ANSWER;
        },
        MODEL,
        { messages: [] },
      );

      expect(endedSpans.map(span => spanToJSON(span).name)).toEqual(['chat faux-model']);
    });
  });

  describe('content recording', () => {
    const message = {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'call_1', name: 'get_weather', arguments: { city: 'Berlin' } }],
      stopReason: 'toolUse',
    };
    const context = {
      messages: [
        { role: 'system', content: '', sections: { preamble: 'You help.' }, toolsAdded: [{ name: 'get_weather' }] },
        { role: 'user', content: 'Weather in Berlin?' },
      ],
    };
    const CONTENT_ATTRIBUTES = [
      GEN_AI_INPUT_MESSAGES,
      GEN_AI_OUTPUT_MESSAGES,
      GEN_AI_SYSTEM_INSTRUCTIONS,
      GEN_AI_TOOL_DEFINITIONS,
    ];

    it('records nothing when inputs and outputs are off', () => {
      const options = { recordInputs: false, recordOutputs: false };

      const span = startPiAiChatSpan([MODEL, context], { streaming: false, deferred: false }, options);
      setPiAiResponseAttributes(span, message, options);
      span.end();

      const recorded = Object.keys(spanToJSON(span).attributes);
      for (const attribute of CONTENT_ATTRIBUTES) {
        expect(recorded).not.toContain(attribute);
      }
    });

    it('follows the data collection settings of the current client', async () => {
      useClient({ dataCollection: { genAI: { inputs: false, outputs: false } } });

      await complete(async () => message, MODEL, context);

      const recorded = endedSpans.flatMap(span => Object.keys(spanToJSON(span).attributes));
      for (const attribute of CONTENT_ATTRIBUTES) {
        expect(recorded).not.toContain(attribute);
      }
    });
  });
});
