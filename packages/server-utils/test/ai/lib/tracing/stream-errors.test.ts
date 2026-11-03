import { describe, expect, it, vi } from 'vitest';
import type { Span } from '@sentry/core';
import { SPAN_STATUS_ERROR } from '@sentry/core';
import { GEN_AI_RESPONSE_STREAMING, GEN_AI_USAGE_INPUT_TOKENS } from '@sentry/conventions/attributes';
import { instrumentAsyncIterableStream } from '../../../../src/ai/anthropic-ai/streaming';
import { instrumentStream as instrumentGoogleGenAIStream } from '../../../../src/ai/google-genai/streaming';
import { instrumentStream as instrumentOpenAIStream } from '../../../../src/ai/openai/streaming';

function createMockSpan(): { span: Span; attributes: Record<string, unknown>; setStatus: ReturnType<typeof vi.fn> } {
  const attributes: Record<string, unknown> = {};
  const setStatus = vi.fn();
  let isEnded = false;
  const span = {
    isRecording: () => !isEnded,
    setAttribute: (key: string, value: unknown) => {
      attributes[key] = value;
    },
    setAttributes: (attrs: Record<string, unknown>) => {
      Object.assign(attributes, attrs);
    },
    setStatus,
    end: () => {
      isEnded = true;
    },
  } as unknown as Span;
  return { span, attributes, setStatus };
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of stream) {
    void _;
  }
}

const providers = [
  {
    name: 'openai',
    instrument: instrumentOpenAIStream,
    chunks: [
      {
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        model: 'gpt-4o',
        choices: [{ index: 0, delta: { content: 'The forecast for Berlin ' } }],
        usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
      },
      { id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: 'is ' } }] },
    ],
  },
  {
    name: 'anthropic',
    instrument: instrumentAsyncIterableStream,
    chunks: [
      { type: 'message_start', message: { id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 8 } } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The forecast for Berlin ' } },
    ],
  },
  {
    name: 'google-genai',
    instrument: instrumentGoogleGenAIStream,
    chunks: [
      {
        candidates: [{ content: { parts: [{ text: 'The forecast for Berlin ' }], role: 'model' }, index: 0 }],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4, totalTokenCount: 12 },
      },
      { candidates: [{ content: { parts: [{ text: 'is ' }], role: 'model' }, index: 0 }] },
    ],
  },
] as const;

describe.each(providers)('$name stream errors', ({ instrument, chunks }) => {
  const run = (stream: AsyncIterable<unknown>, span: Span) =>
    (instrument as (stream: AsyncIterable<unknown>, span: Span, recordOutputs: boolean) => AsyncGenerator<unknown>)(
      stream,
      span,
      false,
    );

  it('marks the span as errored and keeps the partial usage when the stream throws midway', async () => {
    const { span, attributes, setStatus } = createMockSpan();
    const networkError = new Error('terminated');
    async function* failingStream(): AsyncGenerator<unknown> {
      yield* chunks;
      throw networkError;
    }

    await expect(drain(run(failingStream(), span))).rejects.toBe(networkError);

    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    expect(span.isRecording()).toBe(false);
    expect(attributes[GEN_AI_RESPONSE_STREAMING]).toBe(true);
    expect(attributes[GEN_AI_USAGE_INPUT_TOKENS]).toBe(8);
  });

  it('marks the span as cancelled when the caller aborts the stream', async () => {
    const { span, setStatus } = createMockSpan();
    const abortError = new DOMException('This operation was aborted', 'AbortError');
    async function* abortedStream(): AsyncGenerator<unknown> {
      yield* chunks;
      throw abortError;
    }

    await expect(drain(run(abortedStream(), span))).rejects.toBe(abortError);

    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
    expect(span.isRecording()).toBe(false);
  });

  it('leaves the span status alone when the consumer throws into the stream', async () => {
    const { span, setStatus } = createMockSpan();
    const prematureClose = Object.assign(new Error('Premature close'), { code: 'ERR_STREAM_PREMATURE_CLOSE' });
    async function* healthyStream(): AsyncGenerator<unknown> {
      yield* chunks;
    }
    const instrumented = run(healthyStream(), span);
    await instrumented.next();

    await expect(instrumented.throw(prematureClose)).rejects.toBe(prematureClose);

    expect(setStatus).not.toHaveBeenCalled();
    expect(span.isRecording()).toBe(false);
  });

  it('leaves the span status alone when the consumer breaks out of the stream early', async () => {
    const { span, attributes, setStatus } = createMockSpan();
    async function* endlessStream(): AsyncGenerator<unknown> {
      yield* chunks;
      throw new Error('the consumer stopped before this point');
    }

    for await (const _ of run(endlessStream(), span)) {
      break;
    }

    expect(setStatus).not.toHaveBeenCalled();
    expect(span.isRecording()).toBe(false);
    expect(attributes[GEN_AI_USAGE_INPUT_TOKENS]).toBe(8);
  });
});
