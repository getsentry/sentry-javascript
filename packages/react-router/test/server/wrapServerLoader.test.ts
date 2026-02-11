import * as core from '@sentry/core';
import type { LoaderFunctionArgs } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapServerLoader } from '../../src/server/wrapServerLoader';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn(),
    flushIfServerless: vi.fn(),
    debug: {
      warn: vi.fn(),
    },
  };
});

describe('wrapServerLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the global flag and warning state
    delete (globalThis as any).__sentryReactRouterServerInstrumentationUsed;
  });

  afterEach(() => {
    delete (globalThis as any).__sentryReactRouterServerInstrumentationUsed;
  });

  it('should wrap a loader function with default options', async () => {
    const mockLoaderFn = vi.fn().mockResolvedValue('result');
    const mockArgs = { request: new Request('http://test.com') } as LoaderFunctionArgs;

    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn());

    const wrappedLoader = wrapServerLoader({}, mockLoaderFn);
    await wrappedLoader(mockArgs);

    expect(core.startSpan).toHaveBeenCalledWith(
      {
        name: 'Executing Server Loader',
        attributes: {
          [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.loader',
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.loader',
        },
      },
      expect.any(Function),
    );
    expect(mockLoaderFn).toHaveBeenCalledWith(mockArgs);
    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should wrap a loader function with custom options', async () => {
    const customOptions = {
      name: 'Custom Loader',
      attributes: {
        'sentry.custom': 'value',
      },
    };

    const mockLoaderFn = vi.fn().mockResolvedValue('result');
    const mockArgs = { request: new Request('http://test.com') } as LoaderFunctionArgs;

    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn());

    const wrappedLoader = wrapServerLoader(customOptions, mockLoaderFn);
    await wrappedLoader(mockArgs);

    expect(core.startSpan).toHaveBeenCalledWith(
      {
        name: 'Custom Loader',
        attributes: {
          [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.loader',
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.loader',
          'sentry.custom': 'value',
        },
      },
      expect.any(Function),
    );
    expect(mockLoaderFn).toHaveBeenCalledWith(mockArgs);
    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should call flushIfServerless on successful execution', async () => {
    const mockLoaderFn = vi.fn().mockResolvedValue('result');
    const mockArgs = { request: new Request('http://test.com') } as LoaderFunctionArgs;

    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn());

    const wrappedLoader = wrapServerLoader({}, mockLoaderFn);
    await wrappedLoader(mockArgs);

    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should call flushIfServerless even when loader throws an error', async () => {
    const mockError = new Error('Loader failed');
    const mockLoaderFn = vi.fn().mockRejectedValue(mockError);
    const mockArgs = { request: new Request('http://test.com') } as LoaderFunctionArgs;

    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn());

    const wrappedLoader = wrapServerLoader({}, mockLoaderFn);

    await expect(wrappedLoader(mockArgs)).rejects.toThrow('Loader failed');
    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should propagate errors from loader function', async () => {
    const mockError = new Error('Test error');
    const mockLoaderFn = vi.fn().mockRejectedValue(mockError);
    const mockArgs = { request: new Request('http://test.com') } as LoaderFunctionArgs;

    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn());

    const wrappedLoader = wrapServerLoader({}, mockLoaderFn);

    await expect(wrappedLoader(mockArgs)).rejects.toBe(mockError);
  });

  it('should skip span creation and warn when instrumentation API is used', async () => {
    // Reset modules to get a fresh copy with unset warning flag
    vi.resetModules();
    // @ts-expect-error - Dynamic import for module reset works at runtime but vitest's typecheck doesn't fully support it
    const { wrapServerLoader: freshWrapServerLoader } = await import('../../src/server/wrapServerLoader');

    // Set the global flag indicating instrumentation API is in use
    (globalThis as any).__sentryReactRouterServerInstrumentationUsed = true;

    const mockLoaderFn = vi.fn().mockResolvedValue('result');
    const mockArgs = { request: new Request('http://test.com') } as LoaderFunctionArgs;

    const wrappedLoader = freshWrapServerLoader({}, mockLoaderFn);

    // Call multiple times
    await wrappedLoader(mockArgs);
    await wrappedLoader(mockArgs);
    await wrappedLoader(mockArgs);

    // Should warn about redundant wrapper via debug.warn, but only once
    expect(core.debug.warn).toHaveBeenCalledTimes(1);
    expect(core.debug.warn).toHaveBeenCalledWith(
      expect.stringContaining('wrapServerLoader is redundant when using the instrumentation API'),
    );

    // Should not create spans (instrumentation API handles it)
    expect(core.startSpan).not.toHaveBeenCalled();

    // Should still execute the loader function
    expect(mockLoaderFn).toHaveBeenCalledTimes(3);
  });
});
