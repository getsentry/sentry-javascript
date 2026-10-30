import {
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { Span } from '@sentry/core';
import { addResponseAttributes } from '../../../../src/ai/anthropic-ai';
import { instrumentAsyncIterableStream, instrumentMessageStream } from '../../../../src/ai/anthropic-ai/streaming';
import type { AnthropicAiStreamingEvent } from '../../../../src/ai/anthropic-ai/types';

function createMockSpan(): { span: Span; attributes: Record<string, unknown> } {
  const attributes: Record<string, unknown> = {};
  let ended = false;
  const span = {
    isRecording: () => !ended,
    setAttribute: (key: string, value: unknown) => {
      attributes[key] = value;
    },
    setAttributes: (values: Record<string, unknown>) => {
      Object.assign(attributes, values);
    },
    end: () => {
      ended = true;
    },
  } as unknown as Span;
  return { span, attributes };
}

describe.each(['response', 'async iterable', 'message stream'] as const)('Anthropic token usage (%s)', mode => {
  it.each([
    {
      name: 'includes cache reads and writes in input tokens',
      cache: { cache_read_input_tokens: 2048, cache_creation_input_tokens: 512 },
      inputTokens: 2600,
      totalTokens: 2720,
      cacheAttributes: {
        [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 2048,
        [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 512,
      },
    },
    {
      name: 'includes cache reads when cache writes are absent',
      cache: { cache_read_input_tokens: 2048 },
      inputTokens: 2088,
      totalTokens: 2208,
      cacheAttributes: { [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 2048 },
    },
    {
      name: 'includes cache writes when cache reads are absent',
      cache: { cache_creation_input_tokens: 512 },
      inputTokens: 552,
      totalTokens: 672,
      cacheAttributes: { [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 512 },
    },
    {
      name: 'preserves zero cache counts',
      cache: { cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      inputTokens: 40,
      totalTokens: 160,
      cacheAttributes: {
        [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 0,
        [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 0,
      },
    },
    {
      name: 'omits cache attributes when cache usage is absent',
      cache: {},
      inputTokens: 40,
      totalTokens: 160,
      cacheAttributes: {},
    },
  ])('$name', async ({ cache, inputTokens, totalTokens, cacheAttributes }) => {
    const { span, attributes } = createMockSpan();
    const response = {
      id: 'msg_cache_usage',
      type: 'message' as const,
      model: 'claude-sonnet-4-6',
      role: 'assistant',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 40, output_tokens: 120, ...cache },
    };
    const events: AnthropicAiStreamingEvent[] = [
      { type: 'message_start', message: { ...response, usage: { ...response.usage, output_tokens: 1 } } },
      { type: 'message_delta', usage: { output_tokens: 60 } },
      { type: 'message_delta', usage: { output_tokens: 120 } },
      { type: 'message_stop' },
    ];

    if (mode === 'response') {
      addResponseAttributes(span, response, false);
    } else if (mode === 'async iterable') {
      const stream = (async function* () {
        yield* events;
      })();
      for await (const _ of instrumentAsyncIterableStream(stream, span, false)) {
        void _;
      }
    } else {
      const stream = instrumentMessageStream(new EventEmitter(), span, false);
      for (const event of events) {
        stream.emit('streamEvent', event);
      }
      stream.emit('message', response);
      stream.emit('message', response);
    }

    expect(attributes).toEqual({
      [GEN_AI_RESPONSE_ID]: 'msg_cache_usage',
      [GEN_AI_RESPONSE_MODEL]: 'claude-sonnet-4-6',
      [GEN_AI_USAGE_INPUT_TOKENS]: inputTokens,
      [GEN_AI_USAGE_OUTPUT_TOKENS]: 120,
      [GEN_AI_USAGE_TOTAL_TOKENS]: totalTokens,
      ...cacheAttributes,
      ...(mode === 'response' ? {} : { [GEN_AI_RESPONSE_STREAMING]: true }),
    });
  });
});

describe.each(['async iterable', 'message stream'] as const)(
  'Anthropic streamed input usage from message_delta (%s)',
  mode => {
    it('uses the cumulative input and cache counts of the final message_delta', async () => {
      const { span, attributes } = createMockSpan();
      // With server tools, message_delta reports input and cache counts that grew past message_start's.
      const events: AnthropicAiStreamingEvent[] = [
        {
          type: 'message_start',
          message: {
            id: 'msg_server_tool',
            type: 'message',
            model: 'claude-sonnet-4-6',
            role: 'assistant',
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: {
              input_tokens: 2285,
              output_tokens: 25,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
        },
        {
          type: 'message_delta',
          usage: {
            input_tokens: 2292,
            output_tokens: 150,
            cache_creation_input_tokens: 12032,
            cache_read_input_tokens: 0,
          },
        },
        { type: 'message_stop' },
      ];

      if (mode === 'async iterable') {
        const stream = (async function* () {
          yield* events;
        })();
        for await (const _ of instrumentAsyncIterableStream(stream, span, false)) {
          void _;
        }
      } else {
        const stream = instrumentMessageStream(new EventEmitter(), span, false);
        for (const event of events) {
          stream.emit('streamEvent', event);
        }
        stream.emit('message', {});
      }

      expect(attributes).toMatchObject({
        [GEN_AI_USAGE_INPUT_TOKENS]: 2292 + 12032,
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 150,
        [GEN_AI_USAGE_TOTAL_TOKENS]: 2292 + 12032 + 150,
        [GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]: 12032,
        [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 0,
      });
    });

    it('keeps the message_start input counts that message_delta omits or sends as null', async () => {
      const { span, attributes } = createMockSpan();
      const events: AnthropicAiStreamingEvent[] = [
        {
          type: 'message_start',
          message: {
            id: 'msg_keep',
            type: 'message',
            model: 'claude-sonnet-4-6',
            role: 'assistant',
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 40 },
          },
        },
        { type: 'message_delta', usage: { input_tokens: null, cache_read_input_tokens: null, output_tokens: 12 } },
        { type: 'message_stop' },
      ];

      if (mode === 'async iterable') {
        const stream = (async function* () {
          yield* events;
        })();
        for await (const _ of instrumentAsyncIterableStream(stream, span, false)) {
          void _;
        }
      } else {
        const stream = instrumentMessageStream(new EventEmitter(), span, false);
        for (const event of events) {
          stream.emit('streamEvent', event);
        }
        stream.emit('message', {});
      }

      expect(attributes).toMatchObject({
        [GEN_AI_USAGE_INPUT_TOKENS]: 50,
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 12,
        [GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 40,
      });
    });

    it('takes the input count from message_delta when message_start reports zero', async () => {
      const { span, attributes } = createMockSpan();
      const events: AnthropicAiStreamingEvent[] = [
        {
          type: 'message_start',
          message: {
            id: 'msg_zero_start',
            type: 'message',
            model: 'claude-sonnet-4-6',
            role: 'assistant',
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 1 },
          },
        },
        { type: 'message_delta', usage: { input_tokens: 1500, output_tokens: 40 } },
        { type: 'message_stop' },
      ];

      if (mode === 'async iterable') {
        const stream = (async function* () {
          yield* events;
        })();
        for await (const _ of instrumentAsyncIterableStream(stream, span, false)) {
          void _;
        }
      } else {
        const stream = instrumentMessageStream(new EventEmitter(), span, false);
        for (const event of events) {
          stream.emit('streamEvent', event);
        }
        stream.emit('message', {});
      }

      expect(attributes).toMatchObject({
        [GEN_AI_USAGE_INPUT_TOKENS]: 1500,
        [GEN_AI_USAGE_OUTPUT_TOKENS]: 40,
        [GEN_AI_USAGE_TOTAL_TOKENS]: 1540,
      });
    });
  },
);
