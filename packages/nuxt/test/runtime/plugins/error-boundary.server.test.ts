import type { isNuxtError as nuxtIsNuxtError, NuxtApp } from 'nuxt/app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentPublicInstance } from 'vue';
import errorBoundaryServerPlugin from '../../../src/runtime/plugins/error-boundary.server';

const reportNuxtError = vi.hoisted(() => vi.fn());

vi.mock(import('../../../src/runtime/utils'), async importOriginal => {
  const mod = await importOriginal();
  return {
    ...mod,
    reportNuxtError,
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

function makeNuxtApp(payloadError?: unknown): MockNuxtApp & { _fire: (name: string, ...args: unknown[]) => void } {
  const hooksMap = new Map<string, Array<(...args: unknown[]) => void>>();

  const hook = vi.fn((name: string, callback: (...args: unknown[]) => void) => {
    const list = hooksMap.get(name) || [];
    list.push(callback);
    hooksMap.set(name, list);
  });

  return {
    hooks: { hook },
    payload: { error: payloadError },
    _fire: (name: string, ...args: unknown[]) => {
      const callbacks = hooksMap.get(name) || [];
      for (const cb of callbacks) {
        cb(...args);
      }
    },
  } as unknown as MockNuxtApp & { _fire: (name: string, ...args: unknown[]) => void };
}

describe('error-boundary.server plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('captures errors caught by error boundaries during SSR when app rendered with 200', () => {
    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    const testError = new Error('Widget exploded during SSR');
    const instance = { $props: { widgetId: '42' } } as unknown as ComponentPublicInstance;

    nuxtApp._fire('vue:error', testError, instance, 'render');
    nuxtApp._fire('app:rendered');

    expect(reportNuxtError).toHaveBeenCalledTimes(1);
    expect(reportNuxtError).toHaveBeenCalledWith({
      error: testError,
      instance,
      info: 'render',
    });
  });

  it('skips capturing when nuxtApp.payload.error is set (uncaught fatal error handled by Nitro)', () => {
    const fatalError = new Error('Fatal page crash');
    const nuxtApp = makeNuxtApp(fatalError);
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    nuxtApp._fire('vue:error', fatalError, null, 'setup');
    nuxtApp._fire('app:rendered');

    expect(reportNuxtError).not.toHaveBeenCalled();
  });

  it('skips 3xx and 4xx Nuxt errors (redirects and 404s)', async () => {
    const { isNuxtError } = await import('nuxt/app');
    vi.mocked(isNuxtError).mockReturnValue(true);

    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    const redirectError = { statusCode: 302, message: 'redirect' };
    const notFoundError = { statusCode: 404, message: 'not found' };

    nuxtApp._fire('vue:error', redirectError, null, 'render');
    nuxtApp._fire('vue:error', notFoundError, null, 'render');
    nuxtApp._fire('app:rendered');

    expect(reportNuxtError).not.toHaveBeenCalled();
  });

  it('captures non-Nuxt errors even if they have a 4xx statusCode property', async () => {
    const { isNuxtError } = await import('nuxt/app');
    vi.mocked(isNuxtError).mockReturnValue(false);

    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    const err = Object.assign(new Error('API failure'), { statusCode: 404 });
    nuxtApp._fire('vue:error', err, null, 'setup');
    nuxtApp._fire('app:rendered');

    expect(reportNuxtError).toHaveBeenCalledTimes(1);
    expect(reportNuxtError).toHaveBeenCalledWith({
      error: err,
      instance: null,
      info: 'setup',
    });
  });

  it('captures multiple errors caught by different boundaries on the same page', () => {
    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    const error1 = new Error('Sidebar crashed');
    const error2 = new Error('Footer crashed');
    const instance1 = { $props: { slot: 'sidebar' } };
    const instance2 = { $props: { slot: 'footer' } };

    nuxtApp._fire('vue:error', error1, instance1, 'render');
    nuxtApp._fire('vue:error', error2, instance2, 'render');
    nuxtApp._fire('app:rendered');

    expect(reportNuxtError).toHaveBeenCalledTimes(2);
    expect(reportNuxtError).toHaveBeenNthCalledWith(1, {
      error: error1,
      instance: instance1,
      info: 'render',
    });
    expect(reportNuxtError).toHaveBeenNthCalledWith(2, {
      error: error2,
      instance: instance2,
      info: 'render',
    });
  });

  it('drains the error queue so subsequent app:rendered calls do not re-capture', () => {
    const nuxtApp = makeNuxtApp();
    (errorBoundaryServerPlugin as unknown as PluginSetup)(nuxtApp);

    const error = new Error('Temporary failure');
    nuxtApp._fire('vue:error', error, null, 'render');

    nuxtApp._fire('app:rendered');
    expect(reportNuxtError).toHaveBeenCalledTimes(1);

    nuxtApp._fire('app:rendered');
    expect(reportNuxtError).toHaveBeenCalledTimes(1);
  });
});
