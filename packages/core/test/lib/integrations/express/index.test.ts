import {
  patchExpressModule,
  unpatchExpressModule,
  expressErrorHandler,
  setupExpressErrorHandler,
} from '../../../../src/integrations/express/index';

import { describe, it, expect, vi } from 'vitest';
import type {
  ExpressIntegrationOptions,
  ExpressExportv5,
  ExpressExportv4,
  ExpressLayer,
  ExpressModuleExport,
  ExpressRoute,
  ExpressRouterv4,
  ExpressRouterv5,
  ExpressResponse,
  ExpressRequest,
  ExpressMiddleware,
  ExpressErrorMiddleware,
  ExpressHandlerOptions,
} from '../../../../src/integrations/express/types';
import type { WrappedFunction } from '../../../../src/types-hoist/wrappedfunction';
import type { IncomingMessage, ServerResponse } from 'http';

const sdkProcessingMetadata: unknown[] = [];
const isolationScope = {
  setSDKProcessingMetadata({ normalizedRequest }: { normalizedRequest: unknown }) {
    sdkProcessingMetadata.push(normalizedRequest);
  },
};

vi.mock('../../../../src/currentScopes', () => ({
  getIsolationScope() {
    return isolationScope;
  },
}));

const capturedExceptions: [unknown, unknown][] = [];
vi.mock('../../../../src/exports', () => ({
  captureException(error: unknown, hint: unknown) {
    capturedExceptions.push([error, hint]);
    return 'eventId';
  },
}));

vi.mock('../../../../src/debug-build', () => ({
  DEBUG_BUILD: true,
}));
const debugErrors: [string, Error][] = [];
vi.mock('../../../../src/utils/debug-logger', () => ({
  debug: {
    error: (msg: string, er: Error) => {
      debugErrors.push([msg, er]);
    },
  },
}));

const patchLayerCalls: [options: ExpressIntegrationOptions, layer: ExpressLayer, layerPath?: string][] = [];

vi.mock('../../../../src/integrations/express/patch-layer', () => ({
  patchLayer: (options: ExpressIntegrationOptions, layer?: ExpressLayer, layerPath?: string) => {
    if (layer) {
      patchLayerCalls.push([options, layer, layerPath]);
    }
  },
}));

describe('(un)patchExpressModule', () => {
  it('throws trying to patch/unpatch the wrong thing', () => {
    expect(() => {
      patchExpressModule({
        express: {} as unknown as ExpressModuleExport,
      } as unknown as ExpressIntegrationOptions);
    }).toThrowError('no valid Express route function to instrument');
    expect(() => {
      unpatchExpressModule({
        express: {},
      } as unknown as ExpressIntegrationOptions);
    }).toThrowError('no valid Express route function to deinstrument');
  });

  // these are called in the unit tests below, so set spies
  const routerv4route = vi.fn();
  const routerv4use = vi.fn();
  const appv4use = vi.fn();
  const expressv4 = Object.assign(function express() {}, {
    application: { use: appv4use },
    Router: Object.assign(function Router() {}, {
      route: routerv4route,
      use: routerv4use,
      stack: [{ name: 'layer0' }, { name: 'layer1' }, { name: 'layerFinal' }],
    }),
  }) as unknown as ExpressExportv4;
  Object.assign(expressv4.application, { _router: expressv4.Router });

  const appv5use = vi.fn();
  const expressv5 = Object.assign(function express() {}, {
    application: { use: appv5use },
    Router: class Router {
      stack: ExpressLayer[] = [];
      route() {}
      use() {}
    },
  }) as unknown as ExpressExportv5;
  Object.assign(expressv5.application, {
    router: {
      stack: [{ name: 'layer0' }, { name: 'layer1' }, { name: 'layerFinal' }],
    },
  });

  it('can patch and restore expressv4 style module', () => {
    const r = expressv4.Router as ExpressRouterv4;
    const a = expressv4.application;
    for (const module of [expressv4, { default: expressv4 }]) {
      const options = { express: module } as unknown as ExpressIntegrationOptions;
      expect((r.use as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((r.route as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((a.use as WrappedFunction).__sentry_original__).toBe(undefined);

      patchExpressModule(options);

      expect(typeof (r.use as WrappedFunction).__sentry_original__).toBe('function');
      expect(typeof (r.route as WrappedFunction).__sentry_original__).toBe('function');
      expect(typeof (a.use as WrappedFunction).__sentry_original__).toBe('function');

      unpatchExpressModule(options);

      expect((r.use as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((r.route as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((a.use as WrappedFunction).__sentry_original__).toBe(undefined);
    }
  });

  it('can patch and restore expressv5 style module', () => {
    const r = expressv5.Router as ExpressRouterv5;
    const a = expressv5.application;
    for (const module of [expressv5, { default: expressv5 }]) {
      const options = { express: module } as unknown as ExpressIntegrationOptions;
      expect((r.prototype.use as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((r.prototype.route as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((a.use as WrappedFunction).__sentry_original__).toBe(undefined);

      patchExpressModule(options);

      expect(typeof (r.prototype.use as WrappedFunction).__sentry_original__).toBe('function');
      expect(typeof (r.prototype.route as WrappedFunction).__sentry_original__).toBe('function');
      expect(typeof (a.use as WrappedFunction).__sentry_original__).toBe('function');

      unpatchExpressModule(options);

      expect((r.prototype.use as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((r.prototype.route as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((a.use as WrappedFunction).__sentry_original__).toBe(undefined);
    }
  });

  it('calls patched and original Router.route', () => {
    const options = { express: expressv4 };
    patchExpressModule(options);
    expressv4.Router.route('a');
    unpatchExpressModule(options);
    expect(patchLayerCalls).toStrictEqual([[options, { name: 'layerFinal' }, 'a']]);
    patchLayerCalls.length = 0;
    expect(routerv4route).toHaveBeenCalledExactlyOnceWith('a');
    routerv4route.mockReset();
  });

  it('calls patched and original Router.use', () => {
    const options = { express: expressv4 };
    patchExpressModule(options);
    expressv4.Router.use('a');
    unpatchExpressModule(options);
    expect(patchLayerCalls).toStrictEqual([[options, { name: 'layerFinal' }, 'a']]);
    patchLayerCalls.length = 0;
    expect(routerv4use).toHaveBeenCalledExactlyOnceWith('a');
    routerv4use.mockReset();
  });

  it('skips patchLayer call in Router.use if no layer in the stack', () => {
    const options = { express: expressv4 };
    patchExpressModule(options);
    const { stack } = expressv4.Router;
    expressv4.Router.stack = [];
    expressv4.Router.use('a');
    expressv4.Router.stack = stack;
    unpatchExpressModule(options);
    expect(patchLayerCalls).toStrictEqual([]);
    patchLayerCalls.length = 0;
    expect(routerv4use).toHaveBeenCalledExactlyOnceWith('a');
    routerv4use.mockReset();
  });

  it('calls patched and original application.use', () => {
    const options = { express: expressv4 };
    patchExpressModule(options);
    expressv4.application.use('a');
    unpatchExpressModule(options);
    expect(patchLayerCalls).toStrictEqual([[options, { name: 'layerFinal' }, 'a']]);
    patchLayerCalls.length = 0;
    expect(appv4use).toHaveBeenCalledExactlyOnceWith('a');
    appv4use.mockReset();
  });

  it('calls patched and original application.use on express v5', () => {
    const options = { express: expressv5 };
    patchExpressModule(options);
    expressv5.application.use('a');
    unpatchExpressModule(options);
    expect(patchLayerCalls).toStrictEqual([[options, { name: 'layerFinal' }, 'a']]);
    patchLayerCalls.length = 0;
    expect(appv5use).toHaveBeenCalledExactlyOnceWith('a');
    appv5use.mockReset();
  });

  it('skips patchLayer on application.use if no router found', () => {
    const options = { express: expressv4 };
    patchExpressModule(options);
    const app = expressv4.application as {
      _router?: ExpressRoute;
    };
    const { _router } = app;
    delete app._router;
    expressv4.application.use('a');
    unpatchExpressModule(options);
    app._router = _router;
    // no router, so no layers to patch!
    expect(patchLayerCalls).toStrictEqual([]);
    patchLayerCalls.length = 0;
    expect(appv4use).toHaveBeenCalledExactlyOnceWith('a');
    appv4use.mockReset();
  });

  it('debug error when unpatching fails', () => {
    unpatchExpressModule({ express: expressv5 });
    expect(debugErrors).toStrictEqual([
      ['Failed to unpatch express route method:', new Error('Method route is not wrapped, and cannot be unwrapped')],
      ['Failed to unpatch express use method:', new Error('Method use is not wrapped, and cannot be unwrapped')],
      [
        'Failed to unpatch express application.use method:',
        new Error('Method use is not wrapped, and cannot be unwrapped'),
      ],
    ]);
    debugErrors.length = 0;
  });

  it('debug error when patching fails', () => {
    patchExpressModule({ express: expressv5 });
    patchExpressModule({ express: expressv5 });
    expect(debugErrors).toStrictEqual([
      ['Failed to patch express route method:', new Error('Attempting to wrap method route multiple times')],
      ['Failed to patch express use method:', new Error('Attempting to wrap method use multiple times')],
      ['Failed to patch express application.use method:', new Error('Attempting to wrap method use multiple times')],
    ]);
  });
});

describe('expressErrorHandler', () => {
  it('handles the error if it should', () => {
    const errorMiddleware = expressErrorHandler();
    const res = { status: 500 } as unknown as ExpressResponse;
    const next = vi.fn();
    const err = new Error('err');
    const req = { headers: { request: 'headers' } } as unknown as ExpressRequest;
    errorMiddleware(err, req, res, next);
    expect((res as unknown as { sentry: string }).sentry).toBe('eventId');
    expect(capturedExceptions).toStrictEqual([
      [
        new Error('err'),
        {
          mechanism: {
            handled: false,
            type: 'auto.middleware.express',
          },
        },
      ],
    ]);
    capturedExceptions.length = 0;
    expect(sdkProcessingMetadata).toStrictEqual([
      {
        url: undefined,
        method: undefined,
        query_string: undefined,
        headers: Object.assign(Object.create(null), { request: 'headers' }),
        cookies: undefined,
        data: undefined,
      },
    ]);
    sdkProcessingMetadata.length = 0;
    expect(next).toHaveBeenCalledExactlyOnceWith(err);
    next.mockReset();
  });

  it('does not the error if it should not', () => {
    const errorMiddleware = expressErrorHandler({
      shouldHandleError: () => false,
    });
    const res = { status: 500 } as unknown as ExpressResponse;
    const req = { headers: { request: 'headers' } } as unknown as ExpressRequest;
    const next = vi.fn();
    const err = new Error('err');
    errorMiddleware(err, req, res, next);
    expect((res as unknown as { sentry?: string }).sentry).toBe(undefined);
    expect(capturedExceptions).toStrictEqual([]);
    expect(sdkProcessingMetadata).toStrictEqual([
      {
        url: undefined,
        method: undefined,
        query_string: undefined,
        headers: Object.assign(Object.create(null), { request: 'headers' }),
        cookies: undefined,
        data: undefined,
      },
    ]);
    sdkProcessingMetadata.length = 0;
    expect(next).toHaveBeenCalledExactlyOnceWith(err);
    next.mockReset();
  });
});

describe('setupExpressErrorHandler', () => {
  const appUseCalls: unknown[] = [];
  const app = {
    use: vi.fn((fn: unknown) => appUseCalls.push(fn)) as (
      middleware: ExpressMiddleware | ExpressErrorMiddleware,
    ) => unknown,
  };
  const options = {} as ExpressHandlerOptions;
  it('should have a test here lolz', () => {
    setupExpressErrorHandler(app, options);
    expect(app.use).toHaveBeenCalledTimes(2);
    const reqHandler = appUseCalls[0];
    expect(typeof reqHandler).toBe('function');
    const next = vi.fn();
    (reqHandler as (request: IncomingMessage, _res: ServerResponse, next: () => void) => void)(
      {
        method: 'GET',
        headers: { request: 'headers' },
      } as unknown as ExpressRequest,
      {} as unknown as ExpressResponse,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(sdkProcessingMetadata).toStrictEqual([
      {
        cookies: undefined,
        data: undefined,
        headers: Object.assign(Object.create(null), {
          request: 'headers',
        }),
        method: 'GET',
        query_string: undefined,
        url: undefined,
      },
    ]);
    sdkProcessingMetadata.length = 0;
  });
});
