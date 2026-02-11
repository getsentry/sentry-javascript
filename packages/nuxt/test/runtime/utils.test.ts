import { captureException, getClient } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, type Mock, test, vi } from 'vitest';
import type { ComponentPublicInstance } from 'vue';
import { extractErrorContext, reportNuxtError } from '../../src/runtime/utils';

describe('extractErrorContext', () => {
  it('returns empty object for undefined or empty context', () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(undefined)).toEqual({});
    expect(extractErrorContext({})).toEqual({});
  });

  it('extracts properties from errorContext and drops them if missing', () => {
    const context = {
      event: {
        _method: 'GET',
        _path: '/test',
      },
      tags: ['tag1', 'tag2'],
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(context)).toEqual({
      method: 'GET',
      path: '/test',
      tags: ['tag1', 'tag2'],
    });

    const partialContext = {
      event: {
        _path: '/test',
      },
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(partialContext)).toEqual({ path: '/test' });
  });

  it('handles errorContext.tags correctly, including when absent or of unexpected type', () => {
    const contextWithTags = {
      tags: ['tag1', 'tag2'],
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(contextWithTags)).toEqual({
      tags: ['tag1', 'tag2'],
    });

    const contextWithoutTags = {
      event: {},
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(contextWithoutTags)).toEqual({});

    const contextWithInvalidTags = {
      event: {},
      tags: 'not-an-array',
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(extractErrorContext(contextWithInvalidTags)).toEqual({});
  });

  it('gracefully handles unexpected context structure without throwing errors', () => {
    const weirdContext1 = {
      unexpected: 'value',
    };
    const weirdContext2 = ['value'];
    const weirdContext3 = 123;

    expect(() => extractErrorContext(weirdContext1)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(() => extractErrorContext(weirdContext2)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(() => extractErrorContext(weirdContext3)).not.toThrow();
  });
});

describe('reportNuxtError', () => {
  vi.mock('@sentry/core', async importOriginal => {
    const actual = await importOriginal();
    return {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      ...actual,
      captureException: vi.fn(),
      getClient: vi.fn(),
    };
  });

  const mockError = new Error('Test error');

  const mockInstance: ComponentPublicInstance = {
    $props: { foo: 'bar' },
  } as any;

  const mockClient = {
    getOptions: vi.fn().mockReturnValue({ attachProps: true }),
  };

  beforeEach(() => {
    // Using fake timers as setTimeout is used in `reportNuxtError`
    vi.useFakeTimers();
    vi.clearAllMocks();
    (getClient as Mock).mockReturnValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('captures exception with correct error and metadata', () => {
    reportNuxtError({ error: mockError });
    vi.runAllTimers();

    expect(captureException).toHaveBeenCalledWith(mockError, {
      captureContext: { contexts: { nuxt: { info: undefined } } },
      mechanism: { handled: false, type: 'auto.function.nuxt.app-error' },
    });
  });

  test('includes instance props if attachProps is not explicitly defined', () => {
    reportNuxtError({ error: mockError, instance: mockInstance });
    vi.runAllTimers();

    expect(captureException).toHaveBeenCalledWith(mockError, {
      captureContext: { contexts: { nuxt: { info: undefined, propsData: { foo: 'bar' } } } },
      mechanism: { handled: false, type: 'auto.function.nuxt.vue-error' },
    });
  });

  test('does not include instance props if attachProps is disabled', () => {
    mockClient.getOptions.mockReturnValue({ attachProps: false });

    reportNuxtError({ error: mockError, instance: mockInstance });
    vi.runAllTimers();

    expect(captureException).toHaveBeenCalledWith(mockError, {
      captureContext: { contexts: { nuxt: { info: undefined } } },
      mechanism: { handled: false, type: 'auto.function.nuxt.vue-error' },
    });
  });

  test('handles absence of instance correctly', () => {
    reportNuxtError({ error: mockError, info: 'Some info' });
    vi.runAllTimers();

    expect(captureException).toHaveBeenCalledWith(mockError, {
      captureContext: { contexts: { nuxt: { info: 'Some info' } } },
      mechanism: { handled: false, type: 'auto.function.nuxt.app-error' },
    });
  });
});
