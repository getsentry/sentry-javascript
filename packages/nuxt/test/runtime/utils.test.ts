import { captureException, getClient } from '@sentry/core';
import { type Mock, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ComponentPublicInstance } from 'vue';
import { reportNuxtError } from '../../src/runtime/utils';

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
