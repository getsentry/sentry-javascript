import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SentryCore from '@sentry/core';
import { SPAN_STATUS_ERROR } from '@sentry/core';
import type { Span } from '@sentry/core';
import { GEN_AI_RESPONSE_STREAMING } from '@sentry/conventions/attributes';
import { instrumentStateGraphCompile } from '../../../../src/ai/langgraph';

const spanEnd = vi.fn();
const spanSetAttribute = vi.fn();
const spanSetStatus = vi.fn();
const startSpanManual = vi.fn();

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
});
