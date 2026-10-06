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
        'gen_ai.usage.cache_read.input_tokens': 2048,
        'gen_ai.usage.cache_creation.input_tokens': 512,
      },
    },
    {
      name: 'includes cache reads when cache writes are absent',
      cache: { cache_read_input_tokens: 2048 },
      inputTokens: 2088,
      totalTokens: 2208,
      cacheAttributes: { 'gen_ai.usage.cache_read.input_tokens': 2048 },
    },
    {
      name: 'includes cache writes when cache reads are absent',
      cache: { cache_creation_input_tokens: 512 },
      inputTokens: 552,
      totalTokens: 672,
      cacheAttributes: { 'gen_ai.usage.cache_creation.input_tokens': 512 },
    },
    {
      name: 'preserves zero cache counts',
      cache: { cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      inputTokens: 40,
      totalTokens: 160,
      cacheAttributes: {
        'gen_ai.usage.cache_read.input_tokens': 0,
        'gen_ai.usage.cache_creation.input_tokens': 0,
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
      'gen_ai.response.id': 'msg_cache_usage',
      'gen_ai.response.model': 'claude-sonnet-4-6',
      'gen_ai.usage.input_tokens': inputTokens,
      'gen_ai.usage.output_tokens': 120,
      'gen_ai.usage.total_tokens': totalTokens,
      ...cacheAttributes,
      ...(mode === 'response' ? {} : { 'gen_ai.response.streaming': true }),
    });
  });
});
