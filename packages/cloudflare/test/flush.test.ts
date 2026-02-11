import { type ExecutionContext } from '@cloudflare/workers-types';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { makeFlushLock } from '../src/flush';

describe('Flush buffer test', () => {
  const waitUntilPromises: Promise<void>[] = [];
  const mockExecutionContext: ExecutionContext = {
    waitUntil: vi.fn(prmise => {
      waitUntilPromises.push(prmise);
    }),
    passThroughOnException: vi.fn(),
  };
  it('should flush buffer immediately if no waitUntil were called', async () => {
    const { finalize } = makeFlushLock(mockExecutionContext);
    await expect(finalize()).resolves.toBeUndefined();
  });
  it('should flush buffer only after all waitUntil were finished', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const task = new Promise(resolve => setTimeout(resolve, 100));
    const lock = makeFlushLock(mockExecutionContext);
    mockExecutionContext.waitUntil(task);
    void lock.finalize();
    vi.advanceTimersToNextTimer();
    await Promise.all(waitUntilPromises);
    await expect(lock.ready).resolves.toBeUndefined();
  });
});
