import { afterEach, describe, expect, it, vi } from 'vitest';

const captureExceptionSpy = vi.fn();

vi.mock('@sentry/core', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    captureException: (...args: unknown[]) => captureExceptionSpy(...args),
  };
});

// Import after mocks are set up
const { sentryGlobalRequestMiddleware, sentryGlobalFunctionMiddleware } =
  await import('../../src/server/globalMiddleware');

describe('sentryGlobalRequestMiddleware', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('captures error with correct mechanism when next() throws', async () => {
    const error = new Error('test error');
    const next = vi.fn().mockRejectedValue(error);

    const serverFn = sentryGlobalRequestMiddleware.options!.server!;

    await expect(serverFn({ next })).rejects.toThrow('test error');

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.function.tanstackstart', handled: false },
    });
  });

  it('re-throws error after capture', async () => {
    const error = new Error('test error');
    const next = vi.fn().mockRejectedValue(error);

    const serverFn = sentryGlobalRequestMiddleware.options!.server!;

    await expect(serverFn({ next })).rejects.toThrow(error);
  });

  it('does not capture error when next() succeeds', async () => {
    const next = vi.fn().mockResolvedValue('success');

    const serverFn = sentryGlobalRequestMiddleware.options!.server!;
    const result = await serverFn({ next });

    expect(result).toBe('success');
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('has __SENTRY_INTERNAL__ flag set', () => {
    expect((sentryGlobalRequestMiddleware as unknown as Record<string, unknown>)['__SENTRY_INTERNAL__']).toBe(true);
  });
});

describe('sentryGlobalFunctionMiddleware', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('captures error with correct mechanism when next() throws', async () => {
    const error = new Error('function error');
    const next = vi.fn().mockRejectedValue(error);

    const serverFn = sentryGlobalFunctionMiddleware.options!.server!;

    await expect(serverFn({ next })).rejects.toThrow('function error');

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.function.tanstackstart', handled: false },
    });
  });

  it('does not capture error when next() succeeds', async () => {
    const next = vi.fn().mockResolvedValue('success');

    const serverFn = sentryGlobalFunctionMiddleware.options!.server!;
    const result = await serverFn({ next });

    expect(result).toBe('success');
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('has __SENTRY_INTERNAL__ flag set', () => {
    expect((sentryGlobalFunctionMiddleware as unknown as Record<string, unknown>)['__SENTRY_INTERNAL__']).toBe(true);
  });
});
