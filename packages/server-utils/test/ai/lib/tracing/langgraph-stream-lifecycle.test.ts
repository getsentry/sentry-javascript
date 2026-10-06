import { describe, expect, it, vi } from 'vitest';
import { SPAN_STATUS_ERROR } from '@sentry/core';
import type { Span } from '@sentry/core';
import { instrumentStreamResult } from '../../../../src/ai/langgraph/streaming';

describe('LangGraph response recording failures', () => {
  it.each([false, true])('preserves the stream outcome when serialization fails (stream error: %s)', async fails => {
    const span = {
      end: vi.fn(),
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }),
    };
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
});
