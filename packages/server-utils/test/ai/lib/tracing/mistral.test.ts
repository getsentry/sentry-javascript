import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { instrumentMistralAiClient } from '../../../../src/ai/mistral';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

const GEN_AI_REQUEST_STREAM = 'gen_ai.request.stream';

/** One `CompletionEvent`, as the SDK yields it: the chunk lives under `data`. */
function completionEvent(data: Record<string, unknown>): { data: Record<string, unknown> } {
  return { data };
}

const STREAM_EVENTS = [
  completionEvent({
    id: 'chatcmpl-stream',
    model: 'mistral-large-latest',
    choices: [{ delta: { content: 'Hello ' }, finishReason: null }],
  }),
  completionEvent({
    id: 'chatcmpl-stream',
    model: 'mistral-large-latest',
    // Structured content arrives as an array of chunks, same as the non-streaming shape.
    choices: [
      {
        delta: {
          content: [
            { type: 'text', text: 'from ' },
            { type: 'text', text: 'Mistral' },
          ],
        },
      },
    ],
  }),
  completionEvent({
    id: 'chatcmpl-stream',
    model: 'mistral-large-latest',
    choices: [{ delta: {}, finishReason: 'stop' }],
    usage: { promptTokens: 12, completionTokens: 18, totalTokens: 30 },
  }),
];

/**
 * Stand-in for the SDK's `EventStream`, which extends `ReadableStream`. The tests need both drain
 * paths (`for await` and `getReader()`) to behave like the real thing.
 */
function eventStream(events: unknown[] = STREAM_EVENTS): ReadableStream<unknown> {
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(event);
      }
      controller.close();
    },
  });
}

describe('instrumentMistralAiClient', () => {
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

  function fakeClient(overrides: Record<string, unknown> = {}): any {
    return {
      chat: {
        complete: vi.fn().mockResolvedValue({
          id: 'chatcmpl-mock',
          model: 'mistral-small-latest',
          choices: [{ message: { content: 'Hello from Mistral mock!' }, finishReason: 'stop' }],
          usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
        }),
        parse: vi.fn().mockResolvedValue({
          id: 'chatcmpl-parsed',
          model: 'mistral-small-latest',
          choices: [{ message: { content: '{"city":"Paris"}' }, finishReason: 'stop' }],
        }),
        stream: vi.fn().mockResolvedValue(eventStream()),
        parseStream: vi.fn().mockResolvedValue(eventStream()),
      },
      embeddings: {
        create: vi.fn().mockResolvedValue({ id: 'embd-mock', usage: { promptTokens: 8, totalTokens: 8 } }),
      },
      agents: {
        complete: vi.fn().mockResolvedValue({ id: 'agentcmpl-mock', choices: [] }),
        stream: vi.fn().mockResolvedValue(eventStream()),
      },
      ...overrides,
    };
  }

  describe('span names', () => {
    it('names a chat span `{operation} {model}`', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient());

      await client.chat.complete({ model: 'mistral-small-latest', messages: [] });

      expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('chat mistral-small-latest');
    });

    it('keeps `chat unknown` when the model is missing in static mode', async () => {
      const endedSpans = setupClient('static');
      const client = instrumentMistralAiClient(fakeClient());

      await client.chat.complete({ messages: [] });

      expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('chat unknown');
    });

    it('drops the `unknown` model sentinel under span streaming', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient());

      await client.chat.complete({ messages: [] });

      expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('chat');
    });

    it('leaves the agent id out of the span name under span streaming', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient());

      await client.agents.complete({ agentId: 'ag_01abcdef', messages: [] });

      const span = spanToStaticSpanJSON(endedSpans[0]!);
      expect(span.description).toBe('invoke_agent');
      // The id is still recorded, just not in the name.
      expect(span.data[GEN_AI_AGENT_NAME]).toBe('ag_01abcdef');
    });

    it('keeps the agent id in the span name in static mode', async () => {
      const endedSpans = setupClient('static');
      const client = instrumentMistralAiClient(fakeClient());

      await client.agents.complete({ agentId: 'ag_01abcdef', messages: [] });

      expect(spanToStaticSpanJSON(endedSpans[0]!).description).toBe('invoke_agent ag_01abcdef');
    });
  });

  describe('gen_ai.request.stream', () => {
    it('is false for `complete`, even when the request carries `stream: true`', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient());

      await client.chat.complete({ model: 'mistral-small-latest', messages: [], stream: true });

      expect(spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_REQUEST_STREAM]).toBe(false);
    });

    it('is true for `stream`, which takes no `stream` request field', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient());

      const stream = await client.chat.stream({ model: 'mistral-large-latest', messages: [] });
      for await (const _ of stream) {
        void _;
      }

      expect(spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_REQUEST_STREAM]).toBe(true);
    });
  });

  describe('streaming', () => {
    it('hands back the original stream object rather than a bare generator', async () => {
      setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient());

      const stream = await client.chat.stream({ model: 'mistral-large-latest', messages: [] });

      expect(stream).toBeInstanceOf(ReadableStream);
      expect(typeof stream.getReader).toBe('function');
      expect(typeof stream.tee).toBe('function');
    });

    it('accumulates streamed attributes when drained with `for await`', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient(), { recordOutputs: true });

      const stream = await client.chat.stream({ model: 'mistral-large-latest', messages: [] });
      const seen: unknown[] = [];
      for await (const event of stream) {
        seen.push(event);
      }

      expect(seen).toHaveLength(3);
      const span = spanToStaticSpanJSON(endedSpans[0]!);
      expect(span.data[GEN_AI_RESPONSE_STREAMING]).toBe(true);
      expect(span.data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(30);
      // The array-shaped delta contributes its text instead of being dropped.
      expect(span.data[GEN_AI_RESPONSE_TEXT]).toBe('Hello from Mistral');
    });

    it('ends the span when the stream is drained with `getReader()`', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient(), { recordOutputs: true });

      const stream = await client.chat.stream({ model: 'mistral-large-latest', messages: [] });
      const reader = stream.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(endedSpans).toHaveLength(1);
      const span = spanToStaticSpanJSON(endedSpans[0]!);
      expect(span.data[GEN_AI_RESPONSE_STREAMING]).toBe(true);
      expect(span.data[GEN_AI_USAGE_TOTAL_TOKENS]).toBe(30);
      expect(span.data[GEN_AI_RESPONSE_TEXT]).toBe('Hello from Mistral');
    });

    it('ends the span when the stream is cancelled instead of drained', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient());

      const stream = await client.chat.stream({ model: 'mistral-large-latest', messages: [] });
      await stream.cancel();

      expect(endedSpans).toHaveLength(1);
    });

    it('counts each chunk once when the iterator reads through `getReader()`', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient(), { recordOutputs: true });

      const stream = await client.chat.stream({ model: 'mistral-large-latest', messages: [] });
      // Mirrors the SDK's iterator polyfill, which drains through the public `getReader()`.
      const reader = stream.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_RESPONSE_TEXT]).toBe('Hello from Mistral');
    });

    it('marks the span errored when the stream throws', async () => {
      const endedSpans = setupClient('stream');
      const failing = new ReadableStream({
        start(controller) {
          controller.enqueue(STREAM_EVENTS[0]);
          controller.error(new Error('stream blew up'));
        },
      });
      const client = instrumentMistralAiClient(fakeClient({ chat: { stream: vi.fn().mockResolvedValue(failing) } }));

      const stream = await client.chat.stream({ model: 'mistral-large-latest', messages: [] });
      await expect(
        (async () => {
          for await (const _ of stream) {
            void _;
          }
        })(),
      ).rejects.toThrow('stream blew up');

      expect(spanToStaticSpanJSON(endedSpans[0]!).status).toBe('internal_error');
    });

    it('accumulates streamed tool-call arguments across chunks', async () => {
      const endedSpans = setupClient('stream');
      const toolStream = eventStream([
        completionEvent({
          id: 'chatcmpl-tools',
          model: 'mistral-large-latest',
          choices: [
            {
              delta: {
                toolCalls: [{ index: 0, id: 'call_1', function: { name: 'get_weather', arguments: '{"city":' } }],
              },
            },
          ],
        }),
        completionEvent({
          id: 'chatcmpl-tools',
          model: 'mistral-large-latest',
          choices: [
            { delta: { toolCalls: [{ index: 0, function: { arguments: '"Paris"}' } }] }, finishReason: 'tool_calls' },
          ],
        }),
      ]);
      const client = instrumentMistralAiClient(
        fakeClient({ chat: { stream: vi.fn().mockResolvedValue(toolStream) } }),
        {
          recordOutputs: true,
        },
      );

      const stream = await client.chat.stream({ model: 'mistral-large-latest', messages: [] });
      for await (const _ of stream) {
        void _;
      }

      const toolCalls = spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_RESPONSE_TOOL_CALLS] as string;
      expect(JSON.parse(toolCalls)).toEqual([
        { index: 0, id: 'call_1', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
      ]);
    });
  });

  describe('output attributes', () => {
    it('writes `gen_ai.response.text` as a stringified array of messages', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient(), { recordOutputs: true });

      await client.chat.complete({ model: 'mistral-small-latest', messages: [] });

      const responseText = spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_RESPONSE_TEXT] as string;
      expect(JSON.parse(responseText)).toEqual(['Hello from Mistral mock!']);
    });

    it('keeps one entry per choice instead of merging them', async () => {
      const endedSpans = setupClient('stream');
      const multiChoice = vi.fn().mockResolvedValue({
        id: 'chatcmpl-multi',
        model: 'mistral-small-latest',
        choices: [
          { message: { content: 'First answer' }, finishReason: 'stop' },
          { message: { content: 'Second answer' }, finishReason: 'stop' },
        ],
      });
      const client = instrumentMistralAiClient(fakeClient({ chat: { complete: multiChoice } }), {
        recordOutputs: true,
      });

      await client.chat.complete({ model: 'mistral-small-latest', messages: [] });

      const responseText = spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_RESPONSE_TEXT] as string;
      expect(JSON.parse(responseText)).toEqual(['First answer', 'Second answer']);
    });

    it('writes `gen_ai.output.messages` in the documented shape', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient(), { recordOutputs: true });

      await client.chat.complete({ model: 'mistral-small-latest', messages: [] });

      const outputMessages = spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_OUTPUT_MESSAGES] as string;
      expect(JSON.parse(outputMessages)).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Hello from Mistral mock!' }],
          finish_reason: 'stop',
        },
      ]);
    });

    it('carries tool calls into `gen_ai.output.messages` as tool_call parts', async () => {
      const endedSpans = setupClient('stream');
      const withToolCall = vi.fn().mockResolvedValue({
        id: 'chatcmpl-tools',
        model: 'mistral-large-latest',
        choices: [
          {
            message: {
              content: '',
              toolCalls: [{ id: 'call_1', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }],
            },
            finishReason: 'tool_calls',
          },
        ],
      });
      const client = instrumentMistralAiClient(fakeClient({ chat: { complete: withToolCall } }), {
        recordOutputs: true,
      });

      await client.chat.complete({ model: 'mistral-large-latest', messages: [] });

      const outputMessages = spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_OUTPUT_MESSAGES] as string;
      expect(JSON.parse(outputMessages)).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: '{"city":"Paris"}' }],
          finish_reason: 'tool_calls',
        },
      ]);
    });

    it('writes `gen_ai.output.messages` for a streamed response', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient(), { recordOutputs: true });

      const stream = await client.chat.stream({ model: 'mistral-large-latest', messages: [] });
      for await (const _ of stream) {
        void _;
      }

      const outputMessages = spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_OUTPUT_MESSAGES] as string;
      expect(JSON.parse(outputMessages)).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Hello from Mistral' }],
          finish_reason: 'stop',
        },
      ]);
    });

    it('records no output attributes when output recording is off', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient(), { recordOutputs: false });

      await client.chat.complete({ model: 'mistral-small-latest', messages: [] });

      const span = spanToStaticSpanJSON(endedSpans[0]!);
      expect(span.data[GEN_AI_RESPONSE_TEXT]).toBeUndefined();
      expect(span.data[GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
    });
  });

  describe('structured outputs', () => {
    it('instruments `chat.parse`, which does not route through `chat.complete`', async () => {
      const endedSpans = setupClient('stream');
      const raw = fakeClient();
      const client = instrumentMistralAiClient(raw);

      await client.chat.parse({ model: 'mistral-small-latest', messages: [] });

      expect(raw.chat.complete).not.toHaveBeenCalled();
      const span = spanToStaticSpanJSON(endedSpans[0]!);
      expect(span.description).toBe('chat mistral-small-latest');
      expect(span.data[GEN_AI_OPERATION_NAME]).toBe('chat');
      expect(span.data[GEN_AI_PROVIDER_NAME]).toBe('mistralai');
    });

    it('instruments `chat.parseStream` as a streaming call', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(fakeClient());

      const stream = await client.chat.parseStream({ model: 'mistral-large-latest', messages: [] });
      for await (const _ of stream) {
        void _;
      }

      const span = spanToStaticSpanJSON(endedSpans[0]!);
      expect(span.data[GEN_AI_REQUEST_STREAM]).toBe(true);
      expect(span.data[GEN_AI_RESPONSE_STREAMING]).toBe(true);
    });
  });

  describe('errors', () => {
    it('marks the span errored when a non-streaming call rejects', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(
        fakeClient({ chat: { complete: vi.fn().mockRejectedValue(new Error('404 Model not found')) } }),
      );

      await expect(client.chat.complete({ model: 'error-model', messages: [] })).rejects.toThrow('404 Model not found');

      expect(spanToStaticSpanJSON(endedSpans[0]!).status).toBe('internal_error');
    });

    it('marks the span errored when a streaming call rejects before the stream exists', async () => {
      const endedSpans = setupClient('stream');
      const client = instrumentMistralAiClient(
        fakeClient({ chat: { stream: vi.fn().mockRejectedValue(new Error('429 Too many requests')) } }),
      );

      await expect(client.chat.stream({ model: 'mistral-large-latest', messages: [] })).rejects.toThrow(
        '429 Too many requests',
      );

      expect(endedSpans).toHaveLength(1);
      expect(spanToStaticSpanJSON(endedSpans[0]!).status).toBe('internal_error');
    });
  });
});
