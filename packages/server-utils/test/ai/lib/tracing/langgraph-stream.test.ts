import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SentryCore from '@sentry/core';
import { SPAN_STATUS_ERROR } from '@sentry/core';
import type { Span } from '@sentry/core';
import {
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { instrumentStateGraphCompile } from '../../../../src/ai/langgraph';

const spanEnd = vi.fn();
const spanSetAttribute = vi.fn();
const spanSetStatus = vi.fn();
const startSpanManual = vi.fn();

class TestLangGraphStream<T> extends ReadableStream<T> implements AsyncIterableIterator<T> {
  private iteratorReader: ReadableStreamDefaultReader<T> | undefined;

  public constructor(chunks: T[]) {
    const queuedChunks = [...chunks];
    super({
      pull(controller) {
        const chunk = queuedChunks.shift();
        if (chunk === undefined) {
          controller.close();
        } else {
          controller.enqueue(chunk);
        }
      },
    });
  }

  public async next(): Promise<IteratorResult<T>> {
    this.iteratorReader ??= this.getReader();
    const result = await this.iteratorReader.read();
    if (result.done) {
      this.iteratorReader.releaseLock();
    }
    return result;
  }

  public async return(): Promise<IteratorResult<T>> {
    if (this.iteratorReader) {
      await this.iteratorReader.cancel();
      this.iteratorReader.releaseLock();
    }
    return { done: true, value: undefined };
  }

  public [Symbol.asyncIterator](): this {
    return this;
  }
}

vi.mock('@sentry/core', async importOriginal => {
  const actual = (await importOriginal()) as typeof SentryCore;
  return {
    ...actual,
    startSpanManual: (
      options: SentryCore.StartSpanOptions,
      callback: (span: Span, finish: () => void) => unknown,
    ): unknown => {
      const span = {
        end: spanEnd,
        isRecording: () => true,
        setAttribute: spanSetAttribute,
        setAttributes: vi.fn(),
        setStatus: spanSetStatus,
        updateName: vi.fn(),
      } as unknown as Span;

      startSpanManual(options, callback);
      return callback(span, spanEnd);
    },
  };
});

describe('instrumentStateGraphCompile stream instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the span open until the stream is fully consumed', async () => {
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield { agent: { messages: ['first update'] } };
        yield { agent: { messages: ['final update'] } };
      },
    };
    const compiledGraph = { stream: vi.fn().mockResolvedValue(stream) };
    const compile = instrumentStateGraphCompile(() => compiledGraph, {});

    const graph = compile({ name: 'weather_assistant' }) as {
      stream: (input: unknown) => Promise<AsyncIterable<unknown>>;
    };
    const instrumentedStream = await graph.stream({ messages: ['What is the weather?'] });

    expect(instrumentedStream).toBe(stream);
    expect(spanEnd).not.toHaveBeenCalled();

    const chunks = [];
    for await (const chunk of instrumentedStream) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ agent: { messages: ['first update'] } }, { agent: { messages: ['final update'] } }]);
    expect(startSpanManual).toHaveBeenCalledTimes(1);
    expect(spanSetAttribute).toHaveBeenCalledWith(GEN_AI_RESPONSE_STREAMING, true);
    expect(spanEnd).toHaveBeenCalledTimes(1);
  });

  it('ends the span and the underlying iterator when consumption stops early', async () => {
    const streamCleanup = vi.fn();
    const stream = {
      async *[Symbol.asyncIterator]() {
        try {
          yield 'first update';
          yield 'final update';
        } finally {
          streamCleanup();
        }
      },
    };
    const compiledGraph = { stream: vi.fn().mockResolvedValue(stream) };
    const compile = instrumentStateGraphCompile(() => compiledGraph, {});
    const graph = compile() as { stream: () => Promise<AsyncIterable<unknown>> };

    for await (const _chunk of await graph.stream()) {
      break;
    }

    expect(streamCleanup).toHaveBeenCalledTimes(1);
    expect(spanEnd).toHaveBeenCalledTimes(1);
  });

  it('marks the span as failed when stream iteration throws', async () => {
    const error = new Error('stream failed');
    const stream = {
      [Symbol.asyncIterator]() {
        return {
          next: vi.fn().mockRejectedValue(error),
        };
      },
    };
    const compiledGraph = { stream: vi.fn().mockResolvedValue(stream) };
    const compile = instrumentStateGraphCompile(() => compiledGraph, {});
    const graph = compile() as { stream: () => Promise<AsyncIterable<unknown>> };

    await expect(async () => {
      for await (const _chunk of await graph.stream()) {
        // The iterator throws before yielding.
      }
    }).rejects.toThrow(error);

    expect(spanSetStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    expect(spanEnd).toHaveBeenCalledTimes(1);
  });

  it('ends the span when a reader consumes the stream', async () => {
    const stream = new TestLangGraphStream(['first update', 'final update']);
    const compiledGraph = { stream: vi.fn().mockResolvedValue(stream) };
    const compile = instrumentStateGraphCompile(() => compiledGraph, {});
    const graph = compile() as { stream: () => Promise<TestLangGraphStream<string>> };

    const reader = (await graph.stream()).getReader();
    expect(await reader.read()).toEqual({ done: false, value: 'first update' });
    expect(await reader.read()).toEqual({ done: false, value: 'final update' });
    expect(spanEnd).not.toHaveBeenCalled();
    expect(await reader.read()).toEqual({ done: true, value: undefined });

    expect(spanEnd).toHaveBeenCalledTimes(1);
  });

  it('ends the span when pipeTo consumes the stream', async () => {
    const chunks: string[] = [];
    const stream = new TestLangGraphStream(['first update', 'final update']);
    const compiledGraph = { stream: vi.fn().mockResolvedValue(stream) };
    const compile = instrumentStateGraphCompile(() => compiledGraph, {});
    const graph = compile() as { stream: () => Promise<TestLangGraphStream<string>> };

    await (
      await graph.stream()
    ).pipeTo(
      new WritableStream({
        write(chunk) {
          chunks.push(chunk);
        },
      }),
    );

    expect(chunks).toEqual(['first update', 'final update']);
    expect(spanEnd).toHaveBeenCalledTimes(1);
  });

  it('ends the span when direct next calls consume the stream', async () => {
    const stream = new TestLangGraphStream(['first update']);
    const compiledGraph = { stream: vi.fn().mockResolvedValue(stream) };
    const compile = instrumentStateGraphCompile(() => compiledGraph, {});
    const graph = compile() as { stream: () => Promise<TestLangGraphStream<string>> };

    const instrumentedStream = await graph.stream();
    expect(await instrumentedStream.next()).toEqual({ done: false, value: 'first update' });
    expect(spanEnd).not.toHaveBeenCalled();
    expect(await instrumentedStream.next()).toEqual({ done: true, value: undefined });

    expect(spanEnd).toHaveBeenCalledTimes(1);
  });

  it('ends the span when the stream is canceled directly', async () => {
    const stream = new TestLangGraphStream(['first update']);
    const compiledGraph = { stream: vi.fn().mockResolvedValue(stream) };
    const compile = instrumentStateGraphCompile(() => compiledGraph, {});
    const graph = compile() as { stream: () => Promise<TestLangGraphStream<string>> };

    await (await graph.stream()).cancel('no longer needed');

    expect(spanEnd).toHaveBeenCalledTimes(1);
  });

  it('records response attributes from the final streamed state', async () => {
    const inputMessages = [{ role: 'user', content: 'What is the weather in Paris?' }];
    const intermediateMessage = {
      role: 'assistant',
      content: 'Checking the forecast',
      response_metadata: {
        model_name: 'weather-model-v2',
        tokenUsage: {
          promptTokens: 8,
          completionTokens: 2,
          totalTokens: 10,
        },
      },
    };
    const outputMessage = {
      role: 'assistant',
      content: 'Clear skies',
      response_metadata: {
        model_name: 'weather-model-v2',
        finish_reason: 'stop',
        tokenUsage: {
          promptTokens: 12,
          completionTokens: 3,
          totalTokens: 15,
        },
      },
    };
    const stream = new TestLangGraphStream([
      { planner: { messages: [intermediateMessage] } },
      { agent: { messages: [outputMessage] } },
    ]);
    const compiledGraph = { stream: vi.fn().mockResolvedValue(stream) };
    const compile = instrumentStateGraphCompile(() => compiledGraph, { recordInputs: true, recordOutputs: true });
    const graph = compile() as { stream: (input: unknown) => Promise<TestLangGraphStream<unknown>> };

    for await (const _chunk of await graph.stream({ messages: inputMessages })) {
      // The final state is applied when iteration completes.
    }

    expect(spanSetAttribute).toHaveBeenCalledWith(
      GEN_AI_RESPONSE_TEXT,
      '[{"role":"assistant","content":"Checking the forecast"},{"role":"assistant","content":"Clear skies"}]',
    );
    expect(spanSetAttribute).toHaveBeenCalledWith(GEN_AI_RESPONSE_MODEL, 'weather-model-v2');
    expect(spanSetAttribute).toHaveBeenCalledWith(GEN_AI_RESPONSE_FINISH_REASONS, ['stop']);
    expect(spanSetAttribute).toHaveBeenCalledWith(GEN_AI_USAGE_INPUT_TOKENS, 20);
    expect(spanSetAttribute).toHaveBeenCalledWith(GEN_AI_USAGE_OUTPUT_TOKENS, 5);
    expect(spanSetAttribute).toHaveBeenCalledWith(GEN_AI_USAGE_TOTAL_TOKENS, 25);
    expect(spanEnd).toHaveBeenCalledTimes(1);
  });
});
