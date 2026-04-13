import { type ExecutionContext } from '@cloudflare/workers-types';
import * as sentryCore from '@sentry/core';
import { type Client } from '@sentry/core';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { flushAndDispose, makeFlushLock } from '../src/flush';

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

describe('flushAndDispose', () => {
  it('should flush the client when provided (without disposing for client reuse)', async () => {
    const mockClient = {
      flush: vi.fn().mockResolvedValue(true),
      dispose: vi.fn(),
    } as unknown as Client;

    await flushAndDispose(mockClient, 3000);

    expect(mockClient.flush).toHaveBeenCalledWith(3000);
    // Note: dispose is no longer called since clients are reused across requests
    expect(mockClient.dispose).not.toHaveBeenCalled();
  });

  it('should fall back to global flush when no client is provided', async () => {
    const flushSpy = vi.spyOn(sentryCore, 'flush').mockResolvedValue(true);

    await flushAndDispose(undefined);

    expect(flushSpy).toHaveBeenCalledWith(2000);
    flushSpy.mockRestore();
  });

  it('should not call dispose when no client is provided', async () => {
    const flushSpy = vi.spyOn(sentryCore, 'flush').mockResolvedValue(true);

    await flushAndDispose(undefined);

    expect(flushSpy).toHaveBeenCalled();
    flushSpy.mockRestore();
  });
});
