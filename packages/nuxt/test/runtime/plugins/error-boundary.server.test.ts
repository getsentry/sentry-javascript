import type { Client } from '@sentry/core';
import type { isNuxtError as nuxtIsNuxtError, NuxtApp } from 'nuxt/app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentPublicInstance } from 'vue';
import errorBoundaryServerPlugin from '../../../src/runtime/plugins/error-boundary.server';

const getClient = vi.hoisted(() => vi.fn<() => Client | undefined>());
const captureException = vi.hoisted(() => vi.fn());
const flushIfServerless = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock(import('@sentry/core'), async importOriginal => {
  const mod = await importOriginal();
  return {
    ...mod,
    getClient: getClient as typeof mod.getClient,
    captureException,
  };
});

vi.mock(import('@sentry/core/server'), async importOriginal => {
  const mod = await importOriginal();
  return {
    ...mod,
    flushIfServerless,
  };
});

vi.mock(import('nuxt/app'), () => ({
  defineNuxtPlugin: vi.fn(plugin => plugin),
  isNuxtError: vi.fn(() => false) as unknown as typeof nuxtIsNuxtError,
}));

type PluginSetup = (nuxtApp: MockNuxtApp) => void;
type MockNuxtApp = NuxtApp & {
  hooks: { hook: ReturnType<typeof vi.fn> };
  payload: { error?: unknown };
};

function makeClient(overrides: Record<string, unknown> = {}): Client {
  return {
    addIntegration: vi.fn(),
    getOptions: vi.fn(() => ({ attachProps: true }) as unknown as ReturnType<Client['getOptions']>),
    ...overrides,
  } as unknown as Client;
}

function makeNuxtApp(
  payloadError?: unknown,
): MockNuxtApp & { _fire: (name: string, ...args: unknown[]) => Promise<void> } {
  const hooksMap = new Map<string, Array<(...args: unknown[]) => unknown>>();

  const hook = vi.fn((name: string, callback: (...args: unknown[]) => unknown) => {
    const list = hooksMap.get(name) || [];
    list.push(callback);
    hooksMap.set(name, list);
  });

  return {
    hooks: { hook },
    payload: { error: payloadError },
    _fire: async (name: string, ...args: unknown[]) => {
      const callbacks = hooksMap.get(name) || [];
      for (const cb of callbacks) {
        await cb(...args);
      }
    },
  } as unknown as MockNuxtApp & { _fire: (name: string, ...args: unknown[]) => Promise<void> };
}

describe('error-boundary.server plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('captures errors caught by error boundaries during SSR and flushes on serverless', async () => {
    const client = makeClient();
    getClient.mockReturnValue(client);

    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    const testError = new Error('Widget exploded during SSR');
    const instance = { $props: { widgetId: '42' } } as unknown as ComponentPublicInstance;

    await nuxtApp._fire('vue:error', testError, instance, 'render');
    await nuxtApp._fire('app:rendered');

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(testError, {
      captureContext: {
        contexts: {
          nuxt: {
            info: 'render',
            propsData: { widgetId: '42' },
          },
        },
      },
      mechanism: {
        handled: false,
        type: 'auto.function.nuxt.vue-error',
      },
    });

    expect(flushIfServerless).toHaveBeenCalledTimes(1);
  });

  it('skips capturing and flushing when nuxtApp.payload.error is set (fatal error handled by Nitro)', async () => {
    const client = makeClient();
    getClient.mockReturnValue(client);

    const fatalError = new Error('Fatal page crash');
    const nuxtApp = makeNuxtApp(fatalError);
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    await nuxtApp._fire('vue:error', fatalError, null, 'setup');
    await nuxtApp._fire('app:rendered');

    expect(captureException).not.toHaveBeenCalled();
    expect(flushIfServerless).not.toHaveBeenCalled();
  });

  it('skips 3xx and 4xx Nuxt errors (redirects and 404s)', async () => {
    const { isNuxtError } = await import('nuxt/app');
    vi.mocked(isNuxtError).mockReturnValue(true);

    const client = makeClient();
    getClient.mockReturnValue(client);

    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    const redirectError = { statusCode: 302, message: 'redirect' };
    const notFoundError = { statusCode: 404, message: 'not found' };

    await nuxtApp._fire('vue:error', redirectError, null, 'render');
    await nuxtApp._fire('vue:error', notFoundError, null, 'render');
    await nuxtApp._fire('app:rendered');

    expect(captureException).not.toHaveBeenCalled();
    expect(flushIfServerless).not.toHaveBeenCalled();
  });

  it('captures non-Nuxt errors even if they have a 4xx statusCode property', async () => {
    const { isNuxtError } = await import('nuxt/app');
    vi.mocked(isNuxtError).mockReturnValue(false);

    const client = makeClient();
    getClient.mockReturnValue(client);

    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    const err = Object.assign(new Error('API failure'), { statusCode: 404 });
    await nuxtApp._fire('vue:error', err, null, 'setup');
    await nuxtApp._fire('app:rendered');

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(err, {
      captureContext: {
        contexts: {
          nuxt: {
            info: 'setup',
          },
        },
      },
      mechanism: {
        handled: false,
        type: 'auto.function.nuxt.app-error',
      },
    });
    expect(flushIfServerless).toHaveBeenCalledTimes(1);
  });

  it('captures multiple errors caught by different boundaries on the same page', async () => {
    const client = makeClient();
    getClient.mockReturnValue(client);

    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    const error1 = new Error('Sidebar crashed');
    const error2 = new Error('Footer crashed');
    const instance1 = { $props: { slot: 'sidebar' } } as unknown as ComponentPublicInstance;
    const instance2 = { $props: { slot: 'footer' } } as unknown as ComponentPublicInstance;

    await nuxtApp._fire('vue:error', error1, instance1, 'render');
    await nuxtApp._fire('vue:error', error2, instance2, 'render');
    await nuxtApp._fire('app:rendered');

    expect(captureException).toHaveBeenCalledTimes(2);
    expect(captureException).toHaveBeenNthCalledWith(1, error1, {
      captureContext: {
        contexts: {
          nuxt: {
            info: 'render',
            propsData: { slot: 'sidebar' },
          },
        },
      },
      mechanism: {
        handled: false,
        type: 'auto.function.nuxt.vue-error',
      },
    });
    expect(captureException).toHaveBeenNthCalledWith(2, error2, {
      captureContext: {
        contexts: {
          nuxt: {
            info: 'render',
            propsData: { slot: 'footer' },
          },
        },
      },
      mechanism: {
        handled: false,
        type: 'auto.function.nuxt.vue-error',
      },
    });
    expect(flushIfServerless).toHaveBeenCalledTimes(1);
  });

  it('drains the error queue so subsequent app:rendered calls do not re-capture', async () => {
    const client = makeClient();
    getClient.mockReturnValue(client);

    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    const error = new Error('Temporary failure');
    await nuxtApp._fire('vue:error', error, null, 'render');

    await nuxtApp._fire('app:rendered');
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(flushIfServerless).toHaveBeenCalledTimes(1);

    // Second app:rendered call with no new errors
    await nuxtApp._fire('app:rendered');
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(flushIfServerless).toHaveBeenCalledTimes(1);
  });

  it('omits propsData when attachProps is configured as false', async () => {
    const client = makeClient({
      getOptions: vi.fn(() => ({ attachProps: false }) as unknown as ReturnType<Client['getOptions']>),
    });
    getClient.mockReturnValue(client);

    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    const error = new Error('Component failed');
    const instance = { $props: { secret: 'sensitive' } } as unknown as ComponentPublicInstance;

    await nuxtApp._fire('vue:error', error, instance, 'render');
    await nuxtApp._fire('app:rendered');

    expect(captureException).toHaveBeenCalledWith(error, {
      captureContext: {
        contexts: {
          nuxt: {
            info: 'render',
          },
        },
      },
      mechanism: {
        handled: false,
        type: 'auto.function.nuxt.vue-error',
      },
    });
    expect(flushIfServerless).toHaveBeenCalledTimes(1);
  });

  it('does not call flushIfServerless if no errors were caught', async () => {
    const client = makeClient();
    getClient.mockReturnValue(client);

    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    await nuxtApp._fire('app:rendered');

    expect(captureException).not.toHaveBeenCalled();
    expect(flushIfServerless).not.toHaveBeenCalled();
  });
});
