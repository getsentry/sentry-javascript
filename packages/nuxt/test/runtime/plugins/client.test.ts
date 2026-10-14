import { getClient } from '@sentry/core';
import { browserTracingIntegration, vueIntegration } from '@sentry/vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import clientPlugin from '../../../src/runtime/plugins/sentry.client';

vi.mock(import('@sentry/core'), async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, getClient: vi.fn() };
});

vi.mock(import('@sentry/vue'), async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, browserTracingIntegration: vi.fn(), vueIntegration: vi.fn() };
});

vi.mock(import('nuxt/app'), () => ({
  defineNuxtPlugin: vi.fn(plugin => plugin),
  isNuxtError: vi.fn(),
}));

type ClientPlugin = {
  setup: (nuxtApp: { $router?: unknown; hook: ReturnType<typeof vi.fn> }) => Promise<void>;
};

describe('Sentry client plugin', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('instruments the Nuxt pages router with path-based route labels', async () => {
    const router = { beforeEach: vi.fn(), onError: vi.fn() };
    const integration = { name: 'BrowserTracing' };
    const addIntegration = vi.fn();
    vi.mocked(getClient).mockReturnValue({ addIntegration } as never);
    vi.mocked(browserTracingIntegration).mockReturnValue(integration as never);

    await (clientPlugin as ClientPlugin).setup({ $router: router, hook: vi.fn() });

    expect(browserTracingIntegration).toHaveBeenCalledWith({ router, routeLabel: 'path' });
    expect(addIntegration).toHaveBeenCalledWith(integration);
  });

  it('does not create router instrumentation without an initialized client', async () => {
    vi.mocked(getClient).mockReturnValue(undefined);

    await (clientPlugin as ClientPlugin).setup({ $router: {}, hook: vi.fn() });

    expect(browserTracingIntegration).not.toHaveBeenCalled();
  });

  it('only adds the Vue integration when the Nuxt app has no pages router', async () => {
    const vueApp = {};
    const integration = { name: 'Vue' };
    const addIntegration = vi.fn();
    const hook = vi.fn();
    vi.mocked(getClient).mockReturnValue({ addIntegration } as never);
    vi.mocked(vueIntegration).mockReturnValue(integration as never);

    await (clientPlugin as ClientPlugin).setup({ hook });
    const appCreatedHook = hook.mock.calls.find(([name]) => name === 'app:created')?.[1];
    appCreatedHook(vueApp);

    expect(browserTracingIntegration).not.toHaveBeenCalled();
    expect(addIntegration).toHaveBeenCalledOnce();
    expect(addIntegration).toHaveBeenCalledWith(integration);
  });
});
