import { tracingChannel } from 'node:diagnostics_channel';
import * as SentryCore from '@sentry/core';
import * as SentryCoreServer from '@sentry/core/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { captureNitroAppErrors } from '../../../src/integrations/nitro/captureAppErrors';
import { setupNitroErrorCapture } from '../../../src/integrations/nitro/captureErrors';
import { CHANNELS } from '../../../src/orchestrion/channels';

type ErrorHook = (error: unknown, errorContext: unknown) => unknown;

interface FakeEvent {
  req: { method: string; url: string; waitUntil: ReturnType<typeof vi.fn> };
}

const MECHANISM = { handled: false, type: 'auto.function.nitro.captureErrorHook' };

function createEvent(): FakeEvent {
  return { req: { method: 'GET', url: 'http://localhost/api/fail', waitUntil: vi.fn() } };
}

// Mirrors the app that Nitro's `#nitro/virtual/app` template compiles to. Without hooks (no plugins and no
// `features.runtimeHooks`), `captureError` calls no hook and h3's `onError` doesn't call `captureError`.
function createNitroApp({ withHooks }: { withHooks: boolean }) {
  const errorHooks: ErrorHook[] = [];
  const hooks = withHooks
    ? {
        hook: vi.fn((_name: 'error', fn: ErrorHook) => {
          errorHooks.push(fn);
        }),
        callHook: (_name: 'error', error: unknown, errorContext: unknown) =>
          Promise.all(errorHooks.map(fn => fn(error, errorContext))),
      }
    : undefined;

  const pushedErrors: unknown[] = [];
  const captureError = (error: unknown, errorContext: unknown): void => {
    void hooks?.callHook('error', error, errorContext);
    pushedErrors.push(error);
  };

  const errorResponse = new Response('error', { status: 500 });
  const h3 = {
    config: {
      onError(error: unknown, event: FakeEvent) {
        if (withHooks) {
          captureError(error, { event });
        }
        return errorResponse;
      },
    },
  };

  return { app: { fetch: vi.fn(), h3, hooks, captureError }, pushedErrors, errorResponse };
}

function publishUseNitroApp(app: unknown): void {
  tracingChannel(CHANNELS.NITRO_USE_NITRO_APP).traceSync(() => app, { arguments: [] });
}

describe('captureNitroAppErrors', () => {
  let captureExceptionSpy: MockInstance;

  beforeAll(() => {
    captureNitroAppErrors();
  });

  beforeEach(() => {
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => 'id');
    vi.spyOn(SentryCoreServer, 'flushIfServerless').mockResolvedValue(undefined);
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({ getOptions: () => ({}) } as SentryCore.Client);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the error hook once, although `useNitroApp` fires on every call', async () => {
    const { app } = createNitroApp({ withHooks: true });

    publishUseNitroApp(app);
    publishUseNitroApp(app);
    publishUseNitroApp(app);

    expect(app.hooks!.hook).toHaveBeenCalledTimes(1);

    const error = new Error('Handler failed');
    app.h3.config.onError(error, createEvent());
    await vi.waitFor(() => expect(captureExceptionSpy).toHaveBeenCalledTimes(1));
    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      captureContext: { contexts: { nitro: { method: 'GET', path: '/api/fail' } } },
      mechanism: MECHANISM,
    });
  });

  it('captures one event when `@sentry/nitro` already set up the app', async () => {
    const { app } = createNitroApp({ withHooks: true });

    // `@sentry/nitro`'s plugin runs during plugin init, before `useNitroApp` returns.
    setupNitroErrorCapture(app);
    publishUseNitroApp(app);

    expect(app.hooks!.hook).toHaveBeenCalledTimes(1);

    app.h3.config.onError(new Error('Handler failed'), createEvent());
    await vi.waitFor(() => expect(captureExceptionSpy).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
  });

  it("skips an app that another copy of the SDK set up, like `@sentry/nitro`'s bundled runtime plugin", async () => {
    vi.resetModules();
    const pluginCopy = await import('../../../src/integrations/nitro/captureErrors');
    expect(pluginCopy.setupNitroErrorCapture).not.toBe(setupNitroErrorCapture);

    const { app } = createNitroApp({ withHooks: true });
    pluginCopy.setupNitroErrorCapture(app);
    publishUseNitroApp(app);

    expect(app.hooks!.hook).toHaveBeenCalledTimes(1);
  });

  it('does not add an enumerable property to the app', () => {
    const { app } = createNitroApp({ withHooks: true });

    publishUseNitroApp(app);

    expect(Object.keys(app)).toEqual(['fetch', 'h3', 'hooks', 'captureError']);
  });

  describe('when the app has no hooks', () => {
    it("captures request errors from h3's `onError` and keeps Nitro's error response", async () => {
      const { app, pushedErrors, errorResponse } = createNitroApp({ withHooks: false });
      publishUseNitroApp(app);
      publishUseNitroApp(app);

      const error = new Error('Handler failed');
      const event = createEvent();
      const response = app.h3.config.onError(error, event);

      expect(response).toBe(errorResponse);
      await vi.waitFor(() => expect(captureExceptionSpy).toHaveBeenCalledTimes(1));
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        captureContext: { contexts: { nitro: { method: 'GET', path: '/api/fail' } } },
        mechanism: MECHANISM,
      });
      expect(event.req.waitUntil).toHaveBeenCalledWith(expect.any(Promise));
      // Nitro's own `captureError` isn't called from `onError` without hooks, and that stays so.
      expect(pushedErrors).toEqual([]);
    });

    it('captures errors that Nitro passes to `captureError`, and still calls the original', async () => {
      const { app, pushedErrors } = createNitroApp({ withHooks: false });
      publishUseNitroApp(app);

      const error = new Error('Cache failed');
      app.captureError(error, { tags: ['cache'] });

      expect(pushedErrors).toEqual([error]);
      await vi.waitFor(() => expect(captureExceptionSpy).toHaveBeenCalledTimes(1));
      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        captureContext: { contexts: { nitro: { tags: ['cache'] } } },
        mechanism: MECHANISM,
      });
    });

    it('wraps `onError` and `captureError` only once', () => {
      const { app } = createNitroApp({ withHooks: false });
      publishUseNitroApp(app);
      const { onError } = app.h3.config;
      const { captureError } = app;

      publishUseNitroApp(app);

      expect(app.h3.config.onError).toBe(onError);
      expect(app.captureError).toBe(captureError);
    });

    it('does not capture 4xx `HTTPError`s', async () => {
      const { app } = createNitroApp({ withHooks: false });
      publishUseNitroApp(app);

      app.h3.config.onError(Object.assign(new Error('Not found'), { name: 'HTTPError', status: 404 }), createEvent());
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });
  });

  it('ignores a `useNitroApp` call that threw', () => {
    expect(() =>
      tracingChannel(CHANNELS.NITRO_USE_NITRO_APP).traceSync(
        () => {
          throw new Error('Plugin init failed');
        },
        { arguments: [] },
      ),
    ).toThrow('Plugin init failed');
  });
});
