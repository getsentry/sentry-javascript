import type { Client } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import clientPlugin from '../../../src/runtime/plugins/sentry.client';
import * as utils from '../../../src/runtime/utils';

const getClient = vi.hoisted(() => vi.fn<() => Client | undefined>());
const browserTracingIntegration = vi.hoisted(() => vi.fn());
const vueIntegration = vi.hoisted(() => vi.fn());
const createVueRouteProvider = vi.hoisted(() => vi.fn());
const getRouteProvider = vi.hoisted(() => vi.fn());
const setRouteProvider = vi.hoisted(() => vi.fn());

const nuxtVueOptions = vi.hoisted(() => ({
  trackComponents: ['NuxtApp'],
  attachProps: false,
}));
const globalObj = vi.hoisted(() => ({
  _sentryNuxtVueIntegrationOptions: nuxtVueOptions,
}));

vi.mock(import('@sentry/core'), async importOriginal => {
  const mod = await importOriginal();
  return { ...mod, getClient, GLOBAL_OBJ: globalObj as never };
});

vi.mock(import('@sentry/vue'), async importOriginal => {
  const mod = await importOriginal();
  return {
    ...mod,
    browserTracingIntegration,
    vueIntegration,
    _INTERNAL_createVueRouteProvider: createVueRouteProvider,
    getRouteProvider,
    setRouteProvider,
  };
});

vi.mock(import('nuxt/app'), () => ({
  defineNuxtPlugin: vi.fn(plugin => plugin),
  isNuxtError: vi.fn(() => false),
}));

type PluginSetup = (nuxtApp: {
  $router?: unknown;
  hook: ReturnType<typeof vi.fn>;
}) => Promise<void>;

type NuxtPluginShape = { setup: PluginSetup };

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    addIntegration: vi.fn(),
    getOptions: vi.fn(() => ({ attachProps: true })),
    ...overrides,
  } as unknown as Client;
}

function makeNuxtApp(router?: unknown): { $router?: unknown; hook: ReturnType<typeof vi.fn> } {
  return router === undefined ? { hook: vi.fn() } : { $router: router, hook: vi.fn() };
}

describe('Sentry Nuxt client plugin', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('route provider setup', () => {
    it('installs a Vue route provider when a Nuxt router is present and none is set', async () => {
      const router = { beforeEach: vi.fn(), onError: vi.fn() };
      const client = makeClient();
      const provider = { resolveRoute: vi.fn(), resolveCurrentRoute: vi.fn() };
      getClient.mockReturnValue(client);
      getRouteProvider.mockReturnValue(undefined);
      createVueRouteProvider.mockReturnValue(provider);

      await (clientPlugin as NuxtPluginShape).setup(makeNuxtApp(router));

      expect(createVueRouteProvider).toHaveBeenCalledWith(expect.any(Function));
      expect(setRouteProvider).toHaveBeenCalledWith(provider, client);
    });

    it('does not override a user-supplied route provider', async () => {
      const client = makeClient();
      getClient.mockReturnValue(client);
      getRouteProvider.mockReturnValue({ resolveRoute: () => '/u', resolveCurrentRoute: () => '/u' });

      await (clientPlugin as NuxtPluginShape).setup(makeNuxtApp({}));

      expect(createVueRouteProvider).not.toHaveBeenCalled();
      expect(setRouteProvider).not.toHaveBeenCalled();
    });

    it('skips route provider setup without an initialized client', async () => {
      getClient.mockReturnValue(undefined);

      await (clientPlugin as NuxtPluginShape).setup(makeNuxtApp({}));

      expect(createVueRouteProvider).not.toHaveBeenCalled();
      expect(setRouteProvider).not.toHaveBeenCalled();
    });

    it('skips route provider setup without a $router on the Nuxt app', async () => {
      const client = makeClient();
      getClient.mockReturnValue(client);
      getRouteProvider.mockReturnValue(undefined);

      await (clientPlugin as NuxtPluginShape).setup(makeNuxtApp());

      expect(createVueRouteProvider).not.toHaveBeenCalled();
      expect(setRouteProvider).not.toHaveBeenCalled();
    });
  });

  describe('browser tracing integration', () => {
    it('adds browserTracingIntegration with the Nuxt router and path-based labels', async () => {
      const router = { beforeEach: vi.fn(), onError: vi.fn() };
      const integration = { name: 'BrowserTracing' };
      const client = makeClient();
      getClient.mockReturnValue(client);
      getRouteProvider.mockReturnValue(undefined);
      browserTracingIntegration.mockReturnValue(integration);

      await (clientPlugin as NuxtPluginShape).setup(makeNuxtApp(router));

      expect(browserTracingIntegration).toHaveBeenCalledWith({ router, routeLabel: 'path' });
      expect(client.addIntegration).toHaveBeenCalledWith(integration);
    });

    it('does not add browserTracingIntegration without an initialized client', async () => {
      getClient.mockReturnValue(undefined);

      await (clientPlugin as NuxtPluginShape).setup(makeNuxtApp({ beforeEach: vi.fn() }));

      expect(browserTracingIntegration).not.toHaveBeenCalled();
    });

    it('does not add browserTracingIntegration when the Nuxt app has no router', async () => {
      const client = makeClient();
      getClient.mockReturnValue(client);
      getRouteProvider.mockReturnValue(undefined);

      await (clientPlugin as NuxtPluginShape).setup(makeNuxtApp());

      expect(browserTracingIntegration).not.toHaveBeenCalled();
    });
  });

  describe('app:created hook — Vue integration', () => {
    it('adds the Nuxt-specific Vue integration with attachErrorHandler disabled and merges GLOBAL_OBJ-provided options', async () => {
      const client = makeClient();
      const integration = { name: 'NuxtVueIntegration' };
      const vueApp = { Symbol: 'app' };
      getClient.mockReturnValue(client);
      getRouteProvider.mockReturnValue(undefined);
      vueIntegration.mockReturnValue(integration);

      const nuxtApp = makeNuxtApp();
      await (clientPlugin as NuxtPluginShape).setup(nuxtApp);
      const appCreatedCall = nuxtApp.hook.mock.calls.find(c => c[0] === 'app:created');
      expect(appCreatedCall).toBeTruthy();
      const appCreatedCb = appCreatedCall![1] as (app: unknown) => void;
      appCreatedCb(vueApp);

      // Nuxt-specific: _sentryNuxtVueIntegrationOptions from GLOBAL_OBJ must
      // flow into vueIntegration alongside the fixed Nuxt options.
      expect(vueIntegration).toHaveBeenCalledWith(
        expect.objectContaining({
          app: vueApp,
          attachErrorHandler: false,
          trackComponents: nuxtVueOptions.trackComponents,
          attachProps: nuxtVueOptions.attachProps,
        }),
      );
      expect(client.addIntegration).toHaveBeenCalledWith(integration);
    });

    it('does not add the Vue integration when the client is gone by the time the hook fires', async () => {
      const client = makeClient();
      getClient.mockReturnValueOnce(client);
      getRouteProvider.mockReturnValue(undefined);

      const nuxtApp = makeNuxtApp();
      await (clientPlugin as NuxtPluginShape).setup(nuxtApp);

      // Second getClient call (inside the hook) returns undefined — simulates teardown.
      getClient.mockReturnValueOnce(undefined);
      const appCreatedCb = nuxtApp.hook.mock.calls.find(c => c[0] === 'app:created')?.[1] as (app: unknown) => void;
      appCreatedCb({});

      expect(vueIntegration).not.toHaveBeenCalled();
    });
  });

  describe.each(['app:error', 'vue:error'] as const)('%s hook — status-code filtering', hookName => {
    const fireHook = (
      nuxtApp: { hook: ReturnType<typeof vi.fn> },
      error: unknown,
    ) => {
      const cb = nuxtApp.hook.mock.calls.find(c => c[0] === hookName)?.[1] as (
        e: unknown,
        instance?: unknown,
        info?: string,
      ) => void;
      // vue:error carries (error, instance, info); app:error only (error). The
      // plugin passes the extra args through for vue:error, so include them
      // uniformly here and rely on expect.objectContaining({ error }) below.
      cb(error, undefined, 'setup');
    };

    it.each([404, 301])('skips reporting when a Nuxt error carries a %d status code', async statusCode => {
      const { isNuxtError } = await import('nuxt/app');
      const reportSpy = vi.spyOn(utils, 'reportNuxtError').mockImplementation(() => {});
      vi.mocked(isNuxtError).mockReturnValue(true);
      getClient.mockReturnValue(makeClient());
      getRouteProvider.mockReturnValue(undefined);

      const nuxtApp = makeNuxtApp();
      await (clientPlugin as NuxtPluginShape).setup(nuxtApp);
      fireHook(nuxtApp, { statusCode });

      expect(reportSpy).not.toHaveBeenCalled();
    });

    it('reports a Nuxt error when the status code is 5xx', async () => {
      const { isNuxtError } = await import('nuxt/app');
      const reportSpy = vi.spyOn(utils, 'reportNuxtError').mockImplementation(() => {});
      vi.mocked(isNuxtError).mockReturnValue(true);
      getClient.mockReturnValue(makeClient());
      getRouteProvider.mockReturnValue(undefined);

      const nuxtApp = makeNuxtApp();
      await (clientPlugin as NuxtPluginShape).setup(nuxtApp);
      const err = { statusCode: 503, message: 'bad gateway' };
      fireHook(nuxtApp, err);

      expect(reportSpy).toHaveBeenCalledWith(expect.objectContaining({ error: err }));
    });

    // Non-Nuxt error carrying a 4xx statusCode exercises the `isNuxtError`
    // guard directly — without the guard this would be skipped as 4xx.
    it('reports a non-Nuxt error even when it carries a 4xx statusCode', async () => {
      const { isNuxtError } = await import('nuxt/app');
      const reportSpy = vi.spyOn(utils, 'reportNuxtError').mockImplementation(() => {});
      vi.mocked(isNuxtError).mockReturnValue(false);
      getClient.mockReturnValue(makeClient());
      getRouteProvider.mockReturnValue(undefined);

      const nuxtApp = makeNuxtApp();
      await (clientPlugin as NuxtPluginShape).setup(nuxtApp);
      const err = Object.assign(new Error('boom'), { statusCode: 404 });
      fireHook(nuxtApp, err);

      expect(reportSpy).toHaveBeenCalledWith(expect.objectContaining({ error: err }));
    });
  });

  describe('vue:error hook — component instance passthrough', () => {
    it('forwards the error, component instance and info to reportNuxtError', async () => {
      const reportSpy = vi.spyOn(utils, 'reportNuxtError').mockImplementation(() => {});
      getClient.mockReturnValue(makeClient());
      getRouteProvider.mockReturnValue(undefined);

      const nuxtApp = makeNuxtApp();
      await (clientPlugin as NuxtPluginShape).setup(nuxtApp);
      const vueErrorCb = nuxtApp.hook.mock.calls.find(c => c[0] === 'vue:error')?.[1] as (
        e: unknown,
        instance: unknown,
        info: string,
      ) => void;
      const err = new Error('vue boom');
      const instance = { $props: { foo: 1 } };
      vueErrorCb(err, instance, 'render');

      expect(reportSpy).toHaveBeenCalledWith({ error: err, instance, info: 'render' });
    });
  });
});
