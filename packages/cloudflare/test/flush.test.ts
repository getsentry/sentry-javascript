import { type ExecutionContext } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { makeFlushAfterAll } from '../src/flush';

describe('Flush buffer test', () => {
  const waitUntilPromises: Promise<void>[] = [];
  const mockExecutionContext: ExecutionContext = {
    waitUntil: vi.fn(prmise => {
      waitUntilPromises.push(prmise);
    }),
    passThroughOnException: vi.fn(),
  };
  it('should flush buffer immediately if no waitUntil were called', () => {
    const coreFlush = vi.spyOn(SentryCore, 'flush');
    const flush = makeFlushAfterAll(mockExecutionContext);
    flush();
    expect(coreFlush).toBeCalled();
  });
  it('should flush buffer only after all waitUntil were finished', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const task = new Promise(resolve => setTimeout(resolve, 100));
    const coreFlush = vi.spyOn(SentryCore, 'flush');
    const flush = makeFlushAfterAll(mockExecutionContext);
    mockExecutionContext.waitUntil(task);
    flush();
    expect(coreFlush).not.toBeCalled();
    vi.advanceTimersToNextTimer();
    await Promise.all(waitUntilPromises);
    expect(coreFlush).toBeCalled();
  });
});
