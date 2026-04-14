import * as sentryCore from '@sentry/core';
import { type Client } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { flushAndDispose } from '../src/flush';

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
