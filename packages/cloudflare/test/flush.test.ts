import { type ExecutionContext } from '@cloudflare/workers-types';
import * as sentryCore from '@sentry/core';
import { type Client } from '@sentry/core';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { flushAndDispose, getOriginalWaitUntil, makeFlushLock } from '../src/flush';

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

  it('does not grow the waitUntil wrapper stack on repeated flush lock creation', async () => {
    const waitUntilPromises: Promise<void>[] = [];
    const context: ExecutionContext = {
      waitUntil: vi.fn(promise => {
        waitUntilPromises.push(promise);
      }),
      passThroughOnException: vi.fn(),
    };

    for (let i = 0; i < 20_000; i++) {
      makeFlushLock(context);
    }

    expect(() => context.waitUntil(Promise.resolve())).not.toThrow();
    await Promise.all(waitUntilPromises);
  });

  it('creates a fresh flush lock when waitUntil was already instrumented', async () => {
    const waitUntilPromises: Promise<void>[] = [];
    const context: ExecutionContext = {
      waitUntil: vi.fn(promise => {
        waitUntilPromises.push(promise);
      }),
      passThroughOnException: vi.fn(),
    };

    const firstLock = makeFlushLock(context);
    await firstLock.finalize();

    let resolveWaitUntil!: () => void;
    const secondTask = new Promise<void>(resolve => {
      resolveWaitUntil = resolve;
    });
    const secondLock = makeFlushLock(context);

    context.waitUntil(secondTask);
    void secondLock.finalize();

    await Promise.resolve();
    expect(waitUntilPromises).toHaveLength(1);
    await expect(Promise.race([secondLock.ready, Promise.resolve('pending')])).resolves.toBe('pending');

    resolveWaitUntil();
    await Promise.all(waitUntilPromises);
    await expect(secondLock.ready).resolves.toBeUndefined();
  });
});

describe('flushAndDispose', () => {
  it('should flush and dispose the client when provided', async () => {
    const mockClient = {
      flush: vi.fn().mockResolvedValue(true),
      dispose: vi.fn(),
    } as unknown as Client;

    await flushAndDispose(mockClient, 3000);

    expect(mockClient.flush).toHaveBeenCalledWith(3000);
    expect(mockClient.dispose).toHaveBeenCalled();
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

describe('getOriginalWaitUntil', () => {
  it('returns the original waitUntil before instrumentation', () => {
    const originalWaitUntil = vi.fn();
    const context: ExecutionContext = {
      waitUntil: originalWaitUntil,
      passThroughOnException: vi.fn(),
    };

    const result = getOriginalWaitUntil(context);
    expect(result).toBe(originalWaitUntil);
  });

  it('returns the original waitUntil after instrumentation', () => {
    const originalWaitUntil = vi.fn();
    const context: ExecutionContext = {
      waitUntil: originalWaitUntil,
      passThroughOnException: vi.fn(),
    };

    makeFlushLock(context);

    const result = getOriginalWaitUntil(context);

    expect(result).not.toBe(context.waitUntil);
    expect(result).toBeDefined();
    result!(Promise.resolve());
    expect(originalWaitUntil).toHaveBeenCalled();
  });

  it('returns the original waitUntil after multiple instrumentations', () => {
    const originalWaitUntil = vi.fn();
    const context: ExecutionContext = {
      waitUntil: originalWaitUntil,
      passThroughOnException: vi.fn(),
    };

    makeFlushLock(context);
    makeFlushLock(context);
    makeFlushLock(context);

    const result = getOriginalWaitUntil(context);

    expect(result).not.toBe(context.waitUntil);
    result!(Promise.resolve());
    expect(originalWaitUntil).toHaveBeenCalled();
  });

  it('allows flushAndDispose to complete when called via original waitUntil', async () => {
    const waitUntilPromises: Promise<void>[] = [];
    const context: ExecutionContext = {
      waitUntil: vi.fn(promise => {
        waitUntilPromises.push(promise);
      }),
      passThroughOnException: vi.fn(),
    };

    const lock = makeFlushLock(context);

    const mockClient = {
      flush: vi.fn(async () => {
        await lock.finalize();
        return true;
      }),
      dispose: vi.fn(),
    } as unknown as Client;

    const originalWaitUntil = getOriginalWaitUntil(context);
    originalWaitUntil!.call(context, flushAndDispose(mockClient));

    await vi.waitFor(() => Promise.all(waitUntilPromises));
    expect(mockClient.flush).toHaveBeenCalled();
    expect(mockClient.dispose).toHaveBeenCalled();
  });
});
