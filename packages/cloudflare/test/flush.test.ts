import { type ExecutionContext } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';
import { makeFlushLock } from '../src/flush';

describe('Flush buffer test', () => {
  const mockExecutionContext: ExecutionContext = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: null,
  };
  it('should flush buffer immediately if no waitUntil were called', async () => {
    const { finalize } = makeFlushLock(mockExecutionContext);
    await expect(finalize()).resolves.toBeUndefined();
  });
  it('waitUntil should not be wrapped mose than once', () => {
    expect(makeFlushLock(mockExecutionContext), 'Execution context wrapped twice').toBe(
      makeFlushLock(mockExecutionContext),
    );
  });
  it('should flush buffer only after all waitUntil were finished', async () => {
    const { promise, resolve } = Promise.withResolvers();
    const lock = makeFlushLock(mockExecutionContext);
    mockExecutionContext.waitUntil(promise);
    process.nextTick(resolve);
    await expect(lock.finalize()).resolves.toBeUndefined();
  });
});
