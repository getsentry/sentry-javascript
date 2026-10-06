import { describe, expect, it, vi } from 'vitest';
import type { Span } from '@sentry/core';
import { SPAN_STATUS_ERROR } from '@sentry/core';
import { AIMessageChunk } from '@langchain/core/messages';
import { GEN_AI_RESPONSE_TEXT, GEN_AI_USAGE_OUTPUT_TOKENS } from '@sentry/conventions/attributes';
import { instrumentStreamResult } from '../../../../src/ai/langgraph/streaming';

function createSpan() {
  return {
    end: vi.fn(),
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }),
  };
}

describe('LangGraph iterable protocol', () => {
  it('preserves repeated iteration over a reusable async iterable', async () => {
    const span = createSpan();
    const stream = instrumentStreamResult(
      {
        async *[Symbol.asyncIterator]() {
          yield 'Sunny in Seoul';
          yield 'Clear skies tomorrow';
        },
      },
      span as unknown as Span,
      null,
      false,
    );
    const first: string[] = [];
    const second: string[] = [];
    for await (const chunk of stream) {
      first.push(chunk);
    }
    for await (const chunk of stream) {
      second.push(chunk);
    }
    expect(first).toEqual(['Sunny in Seoul', 'Clear skies tomorrow']);
    expect(second).toEqual(first);
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});

describe('LangGraph pipeThrough execution lifecycle', () => {
  it('awaits async transform and flush while allowing buffered output to outlive execution', async () => {
    const span = createSpan();
    let finishTransform!: () => void;
    let finishFlush!: () => void;
    const transformPending = new Promise<void>(resolve => {
      finishTransform = resolve;
    });
    const flushPending = new Promise<void>(resolve => {
      finishFlush = resolve;
    });
    const transformStarted = vi.fn();
    const flushStarted = vi.fn();
    const stream = instrumentStreamResult(
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue('Sunny in Seoul');
          controller.close();
        },
      }),
      span as unknown as Span,
      null,
      false,
    );
    const output = stream.pipeThrough(
      new TransformStream<string, string>(
        {
          async transform(chunk, controller) {
            transformStarted();
            await transformPending;
            controller.enqueue(chunk);
          },
          async flush() {
            flushStarted();
            await flushPending;
          },
        },
        undefined,
        { highWaterMark: 2 },
      ),
    );
    await vi.waitFor(() => expect(transformStarted).toHaveBeenCalledTimes(1));
    expect(span.end).not.toHaveBeenCalled();
    finishTransform();
    await vi.waitFor(() => expect(flushStarted).toHaveBeenCalledTimes(1));
    expect(span.end).not.toHaveBeenCalled();
    finishFlush();
    await vi.waitFor(() => expect(span.end).toHaveBeenCalledTimes(1));
    const reader = output.getReader();
    expect(await reader.read()).toEqual({ done: false, value: 'Sunny in Seoul' });
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(span.setStatus).not.toHaveBeenCalled();
    reader.releaseLock();
  });

  it('marks async flush errors as failures of the source execution', async () => {
    const span = createSpan();
    const error = new Error('Weather transform flush failed');
    const stream = instrumentStreamResult(
      new ReadableStream<string>({
        start(controller) {
          controller.close();
        },
      }),
      span as unknown as Span,
      null,
      false,
    );
    const output = stream.pipeThrough(
      new TransformStream<string, string>({
        async flush() {
          throw error;
        },
      }),
    );
    const reader = output.getReader();
    await expect(reader.read()).rejects.toThrow(error);
    await vi.waitFor(() => {
      expect(span.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      expect(span.end).toHaveBeenCalledTimes(1);
    });
    reader.releaseLock();
  });
});

describe('LangGraph stream response recording', () => {
  it.each([
    { updates: false, nativeConcat: false },
    { updates: false, nativeConcat: true },
    { updates: true, nativeConcat: false },
    { updates: true, nativeConcat: true },
  ])('combines chunks with the same id without duplicating updates: %o', async ({ updates, nativeConcat }) => {
    const span = createSpan();
    const firstMessage = {
      id: 'seoul-weather',
      type: 'ai',
      content: 'Sunny ',
    };
    const lastMessage = {
      id: firstMessage.id,
      type: 'ai',
      content: 'in Seoul',
      usage_metadata: { input_tokens: 5, output_tokens: 4, total_tokens: 9 },
    };
    const first = nativeConcat ? new AIMessageChunk(firstMessage) : firstMessage;
    const last = nativeConcat ? new AIMessageChunk(lastMessage) : lastMessage;
    const stream = instrumentStreamResult(
      {
        async *[Symbol.asyncIterator]() {
          yield ['messages', [first, { langgraph_node: 'agent' }]];
          yield ['messages', [last, { langgraph_node: 'agent' }]];
          if (updates) {
            yield ['updates', { agent: { messages: [{ ...lastMessage, content: 'Sunny in Seoul' }] } }];
          }
        },
      },
      span as unknown as Span,
      null,
      true,
    );
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(updates ? 3 : 2);
    expect(span.setAttribute).toHaveBeenCalledWith(
      GEN_AI_RESPONSE_TEXT,
      JSON.stringify([{ role: 'assistant', content: 'Sunny in Seoul' }]),
    );
    expect(span.setAttribute).toHaveBeenCalledWith(GEN_AI_USAGE_OUTPUT_TOKENS, 4);
  });

  it.each([false, true])('records messages tuples with multi-mode wrapping %s', async multiMode => {
    const span = createSpan();
    const message = { type: 'ai', content: 'Sunny in Seoul', usage_metadata: { output_tokens: 4 } };
    const tuple = [message, { langgraph_node: 'agent' }];
    const chunk = multiMode ? ['messages', tuple] : tuple;
    const stream = instrumentStreamResult(
      {
        async *[Symbol.asyncIterator]() {
          yield chunk;
        },
      },
      span as unknown as Span,
      [{ type: 'human', content: 'Weather in Seoul?' }],
      true,
    );
    const chunks = [];
    for await (const value of stream) {
      chunks.push(value);
    }
    expect(chunks).toEqual([chunk]);
    expect(span.setAttribute).toHaveBeenCalledWith(
      GEN_AI_RESPONSE_TEXT,
      JSON.stringify([{ role: 'assistant', content: 'Sunny in Seoul' }]),
    );
    expect(span.setAttribute).toHaveBeenCalledWith(GEN_AI_USAGE_OUTPUT_TOKENS, 4);
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});

describe('LangGraph pipeTo preconditions', () => {
  it.each(['source', 'destination'])('keeps consumption active after piping with a locked %s', async lockedTarget => {
    const span = createSpan();
    const stream = instrumentStreamResult(
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue('Sunny in Seoul');
          controller.enqueue('Clear skies tomorrow');
          controller.close();
        },
      }),
      span as unknown as Span,
      null,
      false,
    );
    const destination = new WritableStream<string>();
    const reader = lockedTarget === 'source' ? stream.getReader() : undefined;
    const writer = lockedTarget === 'destination' ? destination.getWriter() : undefined;
    if (reader) {
      expect(await reader.read()).toEqual({ done: false, value: 'Sunny in Seoul' });
    }
    await expect(stream.pipeTo(destination)).rejects.toThrow(TypeError);
    expect(span.end).not.toHaveBeenCalled();
    expect(span.setStatus).not.toHaveBeenCalled();
    writer?.releaseLock();
    if (reader) {
      expect(await reader.read()).toEqual({ done: false, value: 'Clear skies tomorrow' });
      expect(await reader.read()).toEqual({ done: true, value: undefined });
      reader.releaseLock();
    } else {
      await stream.pipeTo(destination);
    }
    expect(span.end).toHaveBeenCalledTimes(1);
    expect(span.setStatus).not.toHaveBeenCalled();
  });
});

describe('LangGraph stream caller errors', () => {
  it.each([undefined, null, {}])(
    'keeps the stream usable after an invalid pipeTo destination: %s',
    async destination => {
      const span = createSpan();
      const stream = instrumentStreamResult(
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue('Sunny in Seoul');
            controller.close();
          },
        }),
        span as unknown as Span,
        null,
        false,
      );

      await expect(stream.pipeTo(destination as WritableStream<string>)).rejects.toThrow(TypeError);

      expect(span.end).not.toHaveBeenCalled();
      expect(span.setStatus).not.toHaveBeenCalled();
      const chunks: string[] = [];
      await stream.pipeTo(
        new WritableStream({
          write: chunk => {
            chunks.push(chunk);
          },
        }),
      );
      expect(chunks).toEqual(['Sunny in Seoul']);
      expect(span.end).toHaveBeenCalledTimes(1);
      expect(span.setStatus).not.toHaveBeenCalled();
    },
  );

  it('keeps reader consumption active when cancel is called on a locked stream', async () => {
    const span = createSpan();
    const stream = instrumentStreamResult(
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue('Sunny in Seoul');
          controller.enqueue('Clear skies tomorrow');
          controller.close();
        },
      }),
      span as unknown as Span,
      null,
      false,
    );
    const reader = stream.getReader();
    expect(await reader.read()).toEqual({ done: false, value: 'Sunny in Seoul' });

    await expect(stream.cancel()).rejects.toThrow(TypeError);

    expect(span.end).not.toHaveBeenCalled();
    expect(span.setStatus).not.toHaveBeenCalled();
    expect(await reader.read()).toEqual({ done: false, value: 'Clear skies tomorrow' });
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    reader.releaseLock();
    expect(span.end).toHaveBeenCalledTimes(1);
    expect(span.setStatus).not.toHaveBeenCalled();
  });
});
