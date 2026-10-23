import { describe, expect, it, vi } from 'vitest';
import { SPAN_STATUS_ERROR } from '@sentry/core';
import type { Span } from '@sentry/core';
import { instrumentStreamResult } from '../../../../src/ai/langgraph/streaming';

function createSpan() {
  return {
    end: vi.fn(),
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }),
  };
}

describe('LangGraph response recording failures', () => {
  it.each([false, true])('preserves the stream outcome when serialization fails (stream error: %s)', async fails => {
    const span = createSpan();
    const args: Record<string, unknown> = {};
    args.self = args;
    const chunk = {
      agent: { messages: [{ role: 'assistant', content: '', tool_calls: [{ name: 'weather', args }] }] },
    };
    const error = new Error('Graph execution failed');
    const stream = instrumentStreamResult(
      {
        async *[Symbol.asyncIterator]() {
          yield chunk;
          if (fails) {
            throw error;
          }
        },
      },
      span as unknown as Span,
      null,
      true,
    );
    const iterator = stream[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ done: false, value: chunk });

    if (fails) {
      await expect(iterator.next()).rejects.toBe(error);
      expect(span.setStatus).toHaveBeenCalledExactlyOnceWith({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    } else {
      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
      expect(span.setStatus).not.toHaveBeenCalled();
    }
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('keeps streaming when recording a chunk throws', async () => {
    const span = createSpan();
    const message = {
      id: 'msg-1',
      content: 'Sun',
      concat: () => {
        throw new Error('concat failed');
      },
    };
    const chunks = [
      ['messages', [message, {}]],
      ['messages', [{ ...message, content: 'ny' }, {}]],
    ];
    const stream = instrumentStreamResult(
      {
        async *[Symbol.asyncIterator]() {
          yield* chunks;
        },
      },
      span as unknown as Span,
      null,
      true,
    );

    const received: unknown[] = [];
    for await (const chunk of stream) {
      received.push(chunk);
    }

    expect(received).toEqual(chunks);
    expect(span.setStatus).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});

describe('LangGraph source iterator closing', () => {
  it('surfaces the iteration error without closing a source that already threw', async () => {
    const span = createSpan();
    const error = new Error('Graph execution failed');
    const returnSpy = vi.fn(async () => {
      throw new Error('return failed');
    });
    const stream = instrumentStreamResult(
      {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            throw error;
          },
          return: returnSpy,
        }),
      },
      span as unknown as Span,
      null,
      false,
    );

    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBe(error);
    expect(returnSpy).not.toHaveBeenCalled();
    expect(span.setStatus).toHaveBeenCalledExactlyOnceWith({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('closes the source when the consumer stops early', async () => {
    const span = createSpan();
    const returnSpy = vi.fn(async () => ({ done: true as const, value: undefined }));
    const stream = instrumentStreamResult(
      {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: false, value: 'chunk' }),
          return: returnSpy,
        }),
      },
      span as unknown as Span,
      null,
      false,
    );

    for await (const _chunk of stream) {
      break;
    }

    expect(returnSpy).toHaveBeenCalledTimes(1);
    expect(span.setStatus).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});
