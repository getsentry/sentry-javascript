import * as core from '@sentry/core';
import type { LoaderFunctionArgs } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapServerLoader } from '../../src/server/wrapServerLoader';

describe('wrapServerLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should wrap a loader function with default options', async () => {
    const mockLoaderFn = vi.fn().mockResolvedValue('result');
    const mockArgs = { request: new Request('http://test.com') } as LoaderFunctionArgs;

    const spy = vi.spyOn(core, 'startSpan');
    const wrappedLoader = wrapServerLoader({}, mockLoaderFn);
    await wrappedLoader(mockArgs);

    expect(spy).toHaveBeenCalledWith(
      {
        name: 'Executing Server Loader',
        attributes: {
          [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react-router.loader',
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.loader',
        },
      },
      expect.any(Function),
    );
    expect(mockLoaderFn).toHaveBeenCalledWith(mockArgs);
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

    const spy = vi.spyOn(core, 'startSpan');
    const wrappedLoader = wrapServerLoader(customOptions, mockLoaderFn);
    await wrappedLoader(mockArgs);

    expect(spy).toHaveBeenCalledWith(
      {
        name: 'Custom Loader',
        attributes: {
          [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react-router.loader',
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.loader',
          'sentry.custom': 'value',
        },
      },
      expect.any(Function),
    );
    expect(mockLoaderFn).toHaveBeenCalledWith(mockArgs);
  });
});
