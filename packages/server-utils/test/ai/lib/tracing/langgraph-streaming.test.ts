import { describe, expect, it, vi } from 'vitest';
import type { Span } from '@sentry/core';
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
  it('ends the span when the graph finishes, while buffered output outlives it', async () => {
    const span = createSpan();
    let finishTransform!: () => void;
    const transformPending = new Promise<void>(resolve => {
      finishTransform = resolve;
    });
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
            await transformPending;
            controller.enqueue(chunk);
          },
        },
        undefined,
        { highWaterMark: 2 },
      ),
    );

    await vi.waitFor(() => expect(span.end).toHaveBeenCalledTimes(1));
    finishTransform();
    const reader = output.getReader();
    expect(await reader.read()).toEqual({ done: false, value: 'Sunny in Seoul' });
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(span.setStatus).not.toHaveBeenCalled();
    reader.releaseLock();
  });

  it('does not mark the agent span failed when a downstream transform fails', async () => {
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
    expect(span.setStatus).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledTimes(1);
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

describe('LangGraph wrapped stream chunks', () => {
  const user = { role: 'user', content: 'Weather?' };
  const assistant = { role: 'assistant', content: 'Sunny' };

  async function recordedResponse(chunks: unknown[]): Promise<unknown> {
    const span = createSpan();
    const stream = instrumentStreamResult(
      {
        async *[Symbol.asyncIterator]() {
          yield* chunks;
        },
      },
      span as unknown as Span,
      [user],
      true,
    );
    for await (const _chunk of stream) {
      // drain
    }
    return span.setAttribute.mock.calls.find(([key]) => key === GEN_AI_RESPONSE_TEXT)?.[1];
  }

  it('records only the root graph output from `subgraphs` chunks', async () => {
    const response = await recordedResponse([
      [[], { messages: [user] }],
      [['inner:1'], { messages: [user, { role: 'assistant', content: 'inner thought' }] }],
      [[], { messages: [user, assistant] }],
    ]);

    expect(response).toBe('[{"role":"assistant","content":"Sunny"}]');
  });

  it('ignores modes that do not carry the graph output', async () => {
    const response = await recordedResponse([
      [[], 'checkpoints', { values: { messages: [user, { role: 'assistant', content: 'stale' }] } }],
      [[], 'values', { messages: [user, assistant] }],
    ]);

    expect(response).toBe('[{"role":"assistant","content":"Sunny"}]');
  });
});

describe('LangGraph stream cancellation and tee', () => {
  it('does not mark a caller cancel as a failure when it rejects the pending read', async () => {
    const span = createSpan();
    const cancelError = new TypeError('Invalid state: Releasing reader');
    let rejectRead!: (error: unknown) => void;
    const source = new ReadableStream<string>();
    const stream = Object.assign(source, {
      getReader: () => ({ read: () => new Promise((_resolve, reject) => (rejectRead = reject)) }),
      cancel: async () => rejectRead(cancelError),
    });
    instrumentStreamResult(stream, span as unknown as Span, null, false);

    const pendingRead = stream.getReader().read();
    Object.defineProperty(stream, 'locked', { value: true });
    await stream.cancel();

    await expect(pendingRead).rejects.toBe(cancelError);
    expect(span.setStatus).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('records and ends the span when the stream is consumed through tee()', async () => {
    const span = createSpan();
    const stream = instrumentStreamResult(
      new ReadableStream({
        start(controller) {
          controller.enqueue({ agent: { messages: [{ role: 'assistant', content: 'Sunny' }] } });
          controller.close();
        },
      }),
      span as unknown as Span,
      null,
      true,
    );

    const [first, second] = stream.tee();
    for await (const _chunk of first) {
      // drain
    }
    for await (const _chunk of second) {
      // drain
    }

    expect(span.setAttribute).toHaveBeenCalledWith(GEN_AI_RESPONSE_TEXT, '[{"role":"assistant","content":"Sunny"}]');
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});
