import { describe, beforeEach, it, expect, vi } from 'vitest';
import { type ExpressPatchLayerOptions, patchLayer } from '../../../../src/integrations/express/patch-layer';
import {
  type ExpressRequest,
  type ExpressLayer,
  type ExpressResponse,
} from '../../../../src/integrations/express/types';
import { getStoredLayers, storeLayer } from '../../../../src/integrations/express/request-layer-store';
import { type StartSpanOptions } from '../../../../src/types-hoist/startSpanOptions';
import { type Span } from '../../../../src/types-hoist/span';
import { EventEmitter } from 'node:events';
import { getOriginalFunction, markFunctionWrapped } from '../../../../src';

// must be var to hoist above vi.mock
var DEBUG_BUILD = true;
beforeEach(() => (DEBUG_BUILD = true));
vi.mock('../../../../src/debug-build', () => ({
  get DEBUG_BUILD() {
    return DEBUG_BUILD ?? true;
  },
}));

const warnings: string[] = [];
beforeEach(() => (warnings.length = 0));
vi.mock('../../../../src/utils/debug-logger', () => ({
  debug: {
    warn(msg: string) {
      warnings.push(msg);
    },
  },
}));

let inDefaultIsolationScope = false;
beforeEach(() => (inDefaultIsolationScope = false));
const transactionNames: string[] = [];
const notDefaultIsolationScope = {
  _scopeData: {} as { sdkProcessingMetadata?: unknown },
  getScopeData() {
    return this._scopeData;
  },
  setTransactionName(name: string) {
    transactionNames.push(name);
  },
  setSDKProcessingMetadata() {},
};
const defaultIsolationScope = {
  _scopeData: {} as { sdkProcessingMetadata?: unknown },
  getScopeData() {
    return this._scopeData;
  },
  setSDKProcessingMetadata(data: unknown) {
    this._scopeData.sdkProcessingMetadata = data;
  },
};
vi.mock('../../../../src/currentScopes', () => ({
  getIsolationScope() {
    return inDefaultIsolationScope ? defaultIsolationScope : notDefaultIsolationScope;
  },
}));
vi.mock('../../../../src/defaultScopes', () => ({
  getDefaultIsolationScope() {
    return defaultIsolationScope;
  },
}));

const mockSpans: MockSpan[] = [];
beforeEach(() => (mockSpans.length = 0));
class MockSpan {
  ended = false;
  status: { code: number; message: string } = { code: 0, message: 'OK' };
  attributes: Record<string, unknown>;
  name: string;

  constructor(options: StartSpanOptions) {
    this.name = options.name;
    this.attributes = options.attributes ?? {};
  }

  updateName(name: string) {
    this.name = name;
    return this;
  }

  setStatus(status: { code: number; message: string }) {
    this.status = status;
  }

  setAttributes(o: Record<string, unknown>) {
    for (const [k, v] of Object.entries(o)) {
      this.setAttribute(k, v);
    }
  }

  setAttribute(key: string, value: unknown) {
    this.attributes[key] = value;
  }

  end() {
    if (this.ended) {
      throw new Error('ended span multiple times!');
    }
    this.ended = true;
  }
  getSpanJSON(): MockSpanJSON {
    // not the whole thing obviously, just enough to know we called it
    return {
      status: this.status,
      data: this.attributes,
      description: this.name,
    };
  }
}
type MockSpanJSON = {
  status?: { code: number; message: string };
  description: string;
  data: Record<string, unknown>;
};

/** verify we get all the expected spans and no more */
const checkSpans = (expectations: Partial<MockSpanJSON>[]) => {
  for (const exp of expectations) {
    const span = mockSpans.pop()?.getSpanJSON();
    expect(span).toMatchObject(exp);
  }
  expect(mockSpans.map(m => m.getSpanJSON())).toStrictEqual([]);
};

let hasActiveSpan = true;
const parentSpan = {};
vi.mock('../../../../src/utils/spanUtils', async () => ({
  ...(await import('../../../../src/utils/spanUtils')),
  getActiveSpan() {
    return hasActiveSpan ? parentSpan : undefined;
  },
}));

vi.mock('../../../../src/tracing', () => ({
  SPAN_STATUS_ERROR: 2,
  withActiveSpan(span: unknown, cb: Function) {
    expect(span).toBe(parentSpan);
    return cb();
  },
  startSpanManual<T = unknown>(options: StartSpanOptions, callback: (span: Span) => T): T {
    const span = new MockSpan(options);
    mockSpans.push(span);
    return callback(span as unknown as Span);
  },
}));

describe('patchLayer', () => {
  describe('no-ops', () => {
    it('if layer is missing', () => {
      // mostly for coverage, verifying it doesn't throw or anything
      patchLayer(() => ({}));
    });

    it('if layer.handle is missing', () => {
      // mostly for coverage, verifying it doesn't throw or anything
      patchLayer(() => ({}), { handle: null } as unknown as ExpressLayer);
    });

    it('if layer already patched', () => {
      // mostly for coverage, verifying it doesn't throw or anything
      function wrapped() {}
      function original() {}
      markFunctionWrapped(wrapped, original);
      const layer = {
        handle: wrapped,
      } as unknown as ExpressLayer;
      patchLayer(() => ({}), layer);
      expect(layer.handle).toBe(wrapped);
    });

    it('if layer handler of length 4', () => {
      // TODO: this should be expanded when we instrument error handlers
      function original(_1: unknown, _2: unknown, _3: unknown, _4: unknown) {}

      const layer = {
        handle: original,
      } as unknown as ExpressLayer;
      patchLayer(() => ({}), layer);
      expect(layer.handle).toBe(original);
    });

    it('wraps the function', () => {
      // mostly a gut-check that we actually do mark wrapped
      function original(_1: unknown, _2: unknown, _3: unknown) {}

      const layer = {
        handle: original,
      } as unknown as ExpressLayer;
      patchLayer(() => ({}), layer);
      expect(getOriginalFunction(layer.handle)).toBe(original);
    });
  });

  it('ignores when no parent span has been started', () => {
    hasActiveSpan = false;
    const options: ExpressPatchLayerOptions = {};
    const req = Object.assign(new EventEmitter(), {
      originalUrl: '/a/b/c',
    }) as unknown as ExpressRequest;

    const layerHandleOriginal = vi.fn();
    const layer = {
      name: 'mw',
      handle: layerHandleOriginal,
    } as unknown as ExpressLayer;

    const res = Object.assign(new EventEmitter(), {}) as unknown as ExpressResponse;

    storeLayer(req, 'a');
    storeLayer(req, '/:boo');
    storeLayer(req, '/:car');

    patchLayer(() => options, layer);
    layer.handle(req, res);
    expect(layerHandleOriginal).toHaveBeenCalledOnce();

    // should not have emitted any spans, it was ignored.
    checkSpans([]);

    hasActiveSpan = true;
  });

  it('ignores layers that should be ignored, runs otherwise', () => {
    const onRouteResolved = vi.fn();
    const options: ExpressPatchLayerOptions = {
      onRouteResolved,
      ignoreLayersType: ['middleware'],
    };
    const req = Object.assign(new EventEmitter(), {
      originalUrl: '/a/b/c/layerPath',
    }) as unknown as ExpressRequest;

    const layerHandleOriginal = vi.fn();
    const layer = {
      name: 'mw',
      handle: layerHandleOriginal,
    } as unknown as ExpressLayer;

    const res = Object.assign(new EventEmitter(), {}) as unknown as ExpressResponse;

    storeLayer(req, 'a');
    storeLayer(req, '/:boo');
    storeLayer(req, '/:car');

    patchLayer(() => options, layer, '/layerPath');
    layer.handle(req, res);
    expect(onRouteResolved).toHaveBeenCalledExactlyOnceWith('/a/:boo/:car/layerPath');
    expect(layerHandleOriginal).toHaveBeenCalledOnce();

    // should not have emitted any spans, it was ignored.
    checkSpans([]);
    options.ignoreLayersType = [];
    layer.handle(req, res);
    const span = mockSpans[0];
    expect(span?.ended).toBe(false);
    checkSpans([
      {
        status: { code: 0, message: 'OK' },
        data: {
          'express.name': 'mw',
          'express.type': 'middleware',
          'http.route': '/a/:boo/:car/layerPath',
          'sentry.op': 'middleware.express',
          'sentry.origin': 'auto.http.express',
        },
        description: 'mw',
      },
    ]);
    res.emit('finish');
    expect(span?.ended).toBe(true);
    checkSpans([]);
  });

  it('pops storedLayers when ignoring router or request_handler type layers', () => {
    for (const type of ['router', 'request_handler'] as const) {
      const options: ExpressPatchLayerOptions = { ignoreLayersType: [type] };
      const req = Object.assign(new EventEmitter(), {
        originalUrl: '/a/b/c/layerPath',
      }) as unknown as ExpressRequest;

      // simulate layers already stored for previous path segments
      storeLayer(req, '/a');
      storeLayer(req, '/b');

      // patch a layer of the ignored type with a layerPath
      const layerHandleOriginal = vi.fn();
      // layer.name must match what getLayerMetadata uses to classify each type:
      // 'router' → router, 'bound dispatch' → request_handler, other → middleware
      const layerName = type === 'router' ? 'router' : 'bound dispatch';
      const layer = { name: layerName, handle: layerHandleOriginal } as unknown as ExpressLayer;
      patchLayer(() => options, layer, '/c');

      // storeLayer('/c') happens inside the patched handle, before being popped
      // after handle returns, storedLayers should be back to ['/a', '/b']
      layer.handle(req, Object.assign(new EventEmitter(), {}) as unknown as ExpressResponse);

      // the ignored layer's path must be cleaned up so subsequent layers see the correct route
      expect(getStoredLayers(req)).toStrictEqual(['/a', '/b']);
    }
  });

  it('warns about not setting name in default isolation scope', async () => {
    inDefaultIsolationScope = true;
    DEBUG_BUILD = true;
    const options: ExpressPatchLayerOptions = {};
    const req = Object.assign(new EventEmitter(), {
      originalUrl: '/a/b/c/layerPath',
    }) as unknown as ExpressRequest;

    const layerHandleOriginal = Object.assign(vi.fn(), {
      x: true,
      // a field that the wrapped one will have, so we skip it.
      toString() {
        return 'x';
      },
    });
    const layer = {
      name: 'handle',
      handle: layerHandleOriginal,
    } as unknown as ExpressLayer;

    const res = Object.assign(new EventEmitter(), {}) as unknown as ExpressResponse;

    storeLayer(req, 'a');
    storeLayer(req, '/:boo');
    storeLayer(req, '/:car');

    patchLayer(() => options, layer, '/layerPath');
    expect(getOriginalFunction(layer.handle)).toBe(layerHandleOriginal);
    expect(layer.handle.x).toBe(true);
    layer.handle.x = false;
    expect(layerHandleOriginal.x).toBe(false);

    warnings.length = 0;
    layer.handle(req, res);
    expect(warnings).toStrictEqual([
      'Isolation scope is still default isolation scope - skipping setting transactionName',
    ]);
    expect(layerHandleOriginal).toHaveBeenCalledOnce();

    // should not have emitted any spans, it was ignored.
    checkSpans([
      {
        status: { code: 0, message: 'OK' },
        data: {
          'express.name': 'a/:boo/:car/layerPath',
          'express.type': 'request_handler',
          'http.route': '/a/:boo/:car/layerPath',
          'sentry.op': 'request_handler.express',
          'sentry.origin': 'auto.http.express',
        },
        description: 'a/:boo/:car/layerPath',
      },
    ]);
    res.emit('finish');
    checkSpans([]);
  });

  it('sets tx name in isolation scope', async () => {
    DEBUG_BUILD = true;
    expect(
      (await import('../../../../src/currentScopes')).getIsolationScope() ===
        (await import('../../../../src/defaultScopes')).getDefaultIsolationScope(),
    ).toBe(false);

    const options: ExpressPatchLayerOptions = {};
    const req = Object.assign(new EventEmitter(), {
      originalUrl: '/a/b/c/layerPath',
    }) as unknown as ExpressRequest;

    const layerHandleOriginal = vi.fn();
    const layer = {
      name: 'handle',
      handle: layerHandleOriginal,
    } as unknown as ExpressLayer;

    const res = Object.assign(new EventEmitter(), {}) as unknown as ExpressResponse;

    storeLayer(req, 'a');
    storeLayer(req, '/:boo');
    storeLayer(req, '/:car');

    patchLayer(() => options, layer);
    expect(getOriginalFunction(layer.handle)).toBe(layerHandleOriginal);
    warnings.length = 0;
    layer.handle(req, res);

    req.method = 'put';
    layer.handle(req, res);
    expect(warnings).toStrictEqual([]);

    expect(transactionNames).toStrictEqual(['GET a/:boo/:car', 'PUT a/:boo/:car']);
    expect(layerHandleOriginal).toHaveBeenCalledTimes(2);

    // should not have emitted any spans, it was ignored.
    checkSpans([
      {
        status: { code: 0, message: 'OK' },
        data: {
          'express.name': 'a/:boo/:car',
          'express.type': 'request_handler',
          'http.route': '/a/:boo/:car',
          'sentry.op': 'request_handler.express',
          'sentry.origin': 'auto.http.express',
        },
        description: 'a/:boo/:car',
      },
      {
        status: { code: 0, message: 'OK' },
        data: {
          'express.name': 'a/:boo/:car',
          'express.type': 'request_handler',
          'http.route': '/a/:boo/:car',
          'sentry.op': 'request_handler.express',
          'sentry.origin': 'auto.http.express',
        },
        description: 'a/:boo/:car',
      },
    ]);
    res.emit('finish');
    checkSpans([]);
  });

  it('works with layerPath field', () => {
    const onRouteResolved = vi.fn();
    const options: ExpressPatchLayerOptions = { onRouteResolved };
    const req = Object.assign(new EventEmitter(), {
      originalUrl: '/a/b/c/d',
    }) as unknown as ExpressRequest;

    const layerHandleOriginal = vi.fn();
    const layer = {
      name: 'mw',
      handle: layerHandleOriginal,
    } as unknown as ExpressLayer;

    const res = Object.assign(new EventEmitter(), {}) as unknown as ExpressResponse;

    storeLayer(req, '/a');
    storeLayer(req, '/b');

    patchLayer(() => options, layer, '/c');
    layer.handle(req, res);
    expect(onRouteResolved).toHaveBeenCalledExactlyOnceWith('/a/b/c');
    const span = mockSpans[0];
    checkSpans([
      {
        status: { code: 0, message: 'OK' },
        data: {
          'express.name': 'mw',
          'express.type': 'middleware',
          'http.route': '/a/b/c',
          'sentry.op': 'middleware.express',
          'sentry.origin': 'auto.http.express',
        },
        description: 'mw',
      },
    ]);
    expect(span?.ended).toBe(false);
    res.emit('finish');
    expect(span?.ended).toBe(true);
    checkSpans([]);
  });

  it('handles case when route does not match url', () => {
    const onRouteResolved = vi.fn();
    const options: ExpressPatchLayerOptions = { onRouteResolved };
    const req = Object.assign(new EventEmitter(), {
      originalUrl: '/abcdef',
    }) as unknown as ExpressRequest;

    const layerHandleOriginal = vi.fn();
    const layer = {
      name: 'router',
      handle: layerHandleOriginal,
    } as unknown as ExpressLayer;

    const res = Object.assign(new EventEmitter(), {}) as unknown as ExpressResponse;

    storeLayer(req, '/a');
    storeLayer(req, '/b');

    patchLayer(() => options, layer, '/c');
    layer.handle(req, res);
    expect(onRouteResolved).toHaveBeenCalledExactlyOnceWith(undefined);
    const span = mockSpans[0];
    checkSpans([
      {
        status: { code: 0, message: 'OK' },
        data: {
          'express.name': '/c',
          'express.type': 'router',
          'sentry.op': 'router.express',
          'sentry.origin': 'auto.http.express',
        },
        description: '/c',
      },
    ]);
    expect(span?.ended).toBe(true);
    checkSpans([]);
  });

  it('wraps the callback', () => {
    const options: ExpressPatchLayerOptions = {};

    const layerHandleOriginal = vi.fn((...args) => {
      expect(getStoredLayers(req)).toStrictEqual(['/a', '/b', '/c']);
      (args[3] as Function)();
      // removes the added layer when the cb indicates it's done
      expect(getStoredLayers(req)).toStrictEqual(['/a', '/b']);
    });

    const layer = {
      name: 'mw',
      handle: layerHandleOriginal,
    } as unknown as ExpressLayer;

    const res = Object.assign(new EventEmitter(), {}) as unknown as ExpressResponse;
    const req = Object.assign(new EventEmitter(), {
      originalUrl: '/a/b/c',
      res,
      route: {},
    }) as unknown as ExpressRequest;

    storeLayer(req, '/a');
    storeLayer(req, '/b');
    patchLayer(() => options, layer, '/c');

    expect(getStoredLayers(req)).toStrictEqual(['/a', '/b']);
    const callback = vi.fn(() => {
      expect(getStoredLayers(req)).toStrictEqual(['/a', '/b']);
    });
    layer.handle(req, res, 'random', callback, 'whatever');
    expect(getStoredLayers(req)).toStrictEqual(['/a', '/b']);

    const span = mockSpans[0];
    checkSpans([
      {
        status: { code: 0, message: 'OK' },
        data: {
          'express.name': 'mw',
          'express.type': 'middleware',
          'sentry.op': 'middleware.express',
          'sentry.origin': 'auto.http.express',
        },
        description: 'mw',
      },
    ]);
    expect(span?.ended).toBe(true);
    checkSpans([]);
  });

  it('handles callback being called with an error', () => {
    const options: ExpressPatchLayerOptions = {};

    const layerHandleOriginal = vi.fn((...args) => {
      expect(getStoredLayers(req)).toStrictEqual(['/a', '/b', '/c']);
      (args[3] as Function)(new Error('oopsie'));
      // do not remove extra layer if this is where it failed though!
      expect(getStoredLayers(req)).toStrictEqual(['/a', '/b', '/c']);
    });

    const layer = {
      name: 'mw',
      handle: layerHandleOriginal,
    } as unknown as ExpressLayer;

    const res = Object.assign(new EventEmitter(), {}) as unknown as ExpressResponse;
    const req = Object.assign(new EventEmitter(), {
      originalUrl: '/a/b/c',
      res,
      route: {},
    }) as unknown as ExpressRequest;

    storeLayer(req, '/a');
    storeLayer(req, '/b');
    patchLayer(() => options, layer, '/c');

    expect(getStoredLayers(req)).toStrictEqual(['/a', '/b']);
    const callback = vi.fn(() => {
      expect(getStoredLayers(req)).toStrictEqual(['/a', '/b', '/c']);
    });
    layer.handle(req, res, 'random', callback, 'whatever');
    expect(getStoredLayers(req)).toStrictEqual(['/a', '/b', '/c']);

    const span = mockSpans[0];
    checkSpans([
      {
        status: { code: 2, message: 'oopsie' },
        data: {
          'express.name': 'mw',
          'express.type': 'middleware',
          'sentry.op': 'middleware.express',
          'sentry.origin': 'auto.http.express',
        },
        description: 'mw',
      },
    ]);
    expect(span?.ended).toBe(true);
    checkSpans([]);
  });

  it('handles throws in layer.handle', () => {
    const onRouteResolved = vi.fn();
    const options: ExpressPatchLayerOptions = { onRouteResolved };
    const req = Object.assign(new EventEmitter(), {
      originalUrl: '/a/b/c/d',
    }) as unknown as ExpressRequest;

    const layerHandleOriginal = vi.fn(() => {
      throw new Error('yur head asplode');
    });
    const layer = {
      name: 'mw',
      handle: layerHandleOriginal,
    } as unknown as ExpressLayer;

    const res = Object.assign(new EventEmitter(), {}) as unknown as ExpressResponse;

    storeLayer(req, '/a');
    storeLayer(req, '/b');

    patchLayer(() => options, layer, '/c');
    expect(() => {
      layer.handle(req, res);
    }).toThrowError('yur head asplode');
    expect(onRouteResolved).toHaveBeenCalledExactlyOnceWith('/a/b/c');
    const span = mockSpans[0];
    checkSpans([
      {
        status: { code: 2, message: 'yur head asplode' },
        data: {
          'express.name': 'mw',
          'express.type': 'middleware',
          'http.route': '/a/b/c',
          'sentry.op': 'middleware.express',
          'sentry.origin': 'auto.http.express',
        },
        description: 'mw',
      },
    ]);
    expect(span?.ended).toBe(false);
    res.emit('finish');
    expect(span?.ended).toBe(true);
    checkSpans([]);
  });
});
