import * as core from '@sentry/core';
import type { LoaderFunctionArgs } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapServerLoader } from '../../src/server/wrapServerLoader';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn(),
    flushIfServerless: vi.fn(),
  };
});

describe('wrapServerLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.loader',
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
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.loader',
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
});
