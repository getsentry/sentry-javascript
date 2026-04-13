import {
  patchExpressModule,
  expressErrorHandler,
  setupExpressErrorHandler,
} from '../../../../src/integrations/express/index';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
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

const sdkProcessingMetadata: unknown[] = [];
const isolationScope = {
  _scopeData: {} as { sdkProcessingMetadata?: unknown },
  getScopeData() {
    return this._scopeData;
  },
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
const debugWarnings: string[] = [];
vi.mock('../../../../src/utils/debug-logger', () => ({
  debug: {
    warn: (msg: string) => debugWarnings.push(msg),
    error: (msg: string, er: Error) => {
      debugErrors.push([msg, er]);
    },
  },
}));

beforeEach(() => (patchLayerCalls.length = 0));
const patchLayerCalls: [getOptions: () => ExpressIntegrationOptions, layer: ExpressLayer, layerPath?: string][] = [];

vi.mock('../../../../src/integrations/express/patch-layer', () => ({
  patchLayer: (getOptions: () => ExpressIntegrationOptions, layer?: ExpressLayer, layerPath?: string) => {
    if (layer) {
      patchLayerCalls.push([getOptions, layer, layerPath]);
    }
  },
}));

type ExpressSpies = Record<'routerUse' | 'routerRoute' | 'appUse', Mock<() => void>>;

// get a fresh copy of a mock Express version 4 export
function getExpress4(): ExpressExportv4 & { spies: ExpressSpies } {
  const routerRoute = vi.fn();
  const routerUse = vi.fn();
  const appUse = vi.fn();
  const spies = {
    routerRoute,
    routerUse,
    appUse,
  } as const;
  const express = Object.assign(function express() {}, {
    spies,
    application: { use: appUse },
    Router: Object.assign(function Router() {}, {
      route: routerRoute,
      use: routerUse,
      stack: [{ name: 'layer0' }, { name: 'layer1' }, { name: 'layerFinal' }],
    }),
  }) as unknown as ExpressExportv4 & { spies: ExpressSpies };
  Object.assign(express.application, { _router: express.Router });

  return express;
}

// get a fresh copy of a mock Express version 5 export
function getExpress5(): ExpressExportv5 & { spies: ExpressSpies } {
  const routerRoute = vi.fn();
  const routerUse = vi.fn();
  const appUse = vi.fn();
  const spies = {
    routerRoute,
    routerUse,
    appUse,
  } as const;
  const expressv5 = Object.assign(function express() {}, {
    spies,
    application: { use: appUse },
    Router: class Router {
      stack: ExpressLayer[] = [];
      route(...args: unknown[]) {
        return routerRoute(...args);
      }
      use(...args: unknown[]) {
        return routerUse(...args);
      }
    },
  }) as unknown as ExpressExportv5 & { spies: ExpressSpies };
  const stack = [{ name: 'layer0' }, { name: 'layer1' }, { name: 'layerFinal' }];
  Object.assign(expressv5.application, {
    router: { stack },
  });

  return expressv5;
}

describe('patchExpressModule', () => {
  it('throws trying to patch the wrong thing', () => {
    expect(() => {
      patchExpressModule({} as unknown as ExpressModuleExport, () => ({}));
    }).toThrowError('no valid Express route function to instrument');
  });

  it('throws trying to patch without a getOptions getter', () => {
    const express = getExpress4();
    expect(() => {
      //@ts-expect-error The type error prevents this, by design
      patchExpressModule(express);
    }).toThrowError('`patchExpressModule(moduleExports, getOptions)` requires a `getOptions` callback');
  });

  it('can patch expressv4 style module', () => {
    for (const useDefault of [false, true]) {
      const express = getExpress4();
      const moduleExports = useDefault ? { default: express } : express;
      const r = express.Router as ExpressRouterv4;
      const a = express.application;
      expect((r.use as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((r.route as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((a.use as WrappedFunction).__sentry_original__).toBe(undefined);

      patchExpressModule({ express: moduleExports });
      expect(debugWarnings).toStrictEqual([
        '[Express] `patchExpressModule(options)` is deprecated. Use `patchExpressModule(moduleExports, getOptions)` instead.',
      ]);

      expect(typeof (r.use as WrappedFunction).__sentry_original__).toBe('function');
      expect(typeof (r.route as WrappedFunction).__sentry_original__).toBe('function');
      expect(typeof (a.use as WrappedFunction).__sentry_original__).toBe('function');
    }
  });

  it('can patch expressv5 style module', () => {
    for (const useDefault of [false, true]) {
      const express = getExpress5();
      const r = express.Router as ExpressRouterv5;
      const a = express.application;
      const moduleExports = useDefault ? { default: express } : express;
      expect((r.prototype.use as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((r.prototype.route as WrappedFunction).__sentry_original__).toBe(undefined);
      expect((a.use as WrappedFunction).__sentry_original__).toBe(undefined);

      // verify that the debug warning doesn't fire a second time
      // vitest doesn't guarantee test ordering, so just verify
      // in both places that there's only one warning.
      patchExpressModule({ express: moduleExports });
      expect(debugWarnings).toStrictEqual([
        '[Express] `patchExpressModule(options)` is deprecated. Use `patchExpressModule(moduleExports, getOptions)` instead.',
      ]);

      expect(typeof (r.prototype.use as WrappedFunction).__sentry_original__).toBe('function');
      expect(typeof (r.prototype.route as WrappedFunction).__sentry_original__).toBe('function');
      expect(typeof (a.use as WrappedFunction).__sentry_original__).toBe('function');
    }
  });

  it('calls patched and original Router.route', () => {
    const expressv4 = getExpress4();
    const { spies } = expressv4;
    const getOptions = () => ({});
    patchExpressModule(expressv4, getOptions);
    expressv4.Router.route('a');
    expect(spies.routerRoute).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('calls patched and original Router.use', () => {
    const expressv4 = getExpress4();
    const { spies } = expressv4;
    const getOptions = () => ({});
    patchExpressModule(expressv4, getOptions);
    expressv4.Router.use('a');
    expect(patchLayerCalls).toStrictEqual([[getOptions, { name: 'layerFinal' }, 'a']]);
    expect(spies.routerUse).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('skips patchLayer call in Router.use if no layer in the stack', () => {
    const expressv4 = getExpress4();
    const { spies } = expressv4;
    const getOptions = () => ({});
    patchExpressModule(expressv4, getOptions);
    const { stack } = expressv4.Router;
    expressv4.Router.stack = [];
    expressv4.Router.use('a');
    expressv4.Router.stack = stack;
    expect(patchLayerCalls).toStrictEqual([]);
    expect(spies.routerUse).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('calls patched and original application.use', () => {
    const expressv4 = getExpress4();
    const { spies } = expressv4;
    const getOptions = () => ({});
    patchExpressModule(expressv4, getOptions);
    expressv4.application.use('a');
    expect(patchLayerCalls).toStrictEqual([[getOptions, { name: 'layerFinal' }, 'a']]);
    expect(spies.appUse).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('calls patched and original application.use on express v5', () => {
    const expressv5 = getExpress5();
    const { spies } = expressv5;
    const getOptions = () => ({});
    patchExpressModule(expressv5, getOptions);
    expressv5.application.use('a');
    expect(patchLayerCalls).toStrictEqual([[getOptions, { name: 'layerFinal' }, 'a']]);
    expect(spies.appUse).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('skips patchLayer on application.use if no router found', () => {
    const expressv4 = getExpress4();
    const { spies } = expressv4;
    const getOptions = () => ({});
    patchExpressModule(expressv4, getOptions);
    const app = expressv4.application as {
      _router?: ExpressRoute;
    };
    const { _router } = app;
    delete app._router;
    expressv4.application.use('a');
    app._router = _router;
    // no router, so no layers to patch!
    expect(patchLayerCalls).toStrictEqual([]);
    expect(spies.appUse).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('debug error when patching fails', () => {
    const expressv5 = getExpress5();
    const getOptions = () => ({});
    patchExpressModule(expressv5, getOptions);
    patchExpressModule(expressv5, getOptions);
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
    (reqHandler as (request: ExpressRequest, _res: ExpressResponse, next: () => void) => void)(
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
