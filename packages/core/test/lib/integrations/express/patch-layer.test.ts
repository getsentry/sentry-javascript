import { describe, it, expect, vi } from 'vitest';
import { type ExpressPatchLayerOptions, patchLayer } from '../../../../src/integrations/express/patch-layer';
import {
  type ExpressRequest,
  type ExpressLayer,
  kLayerPatched,
  type ExpressResponse,
} from '../../../../src/integrations/express/types';
import { getStoredLayers, storeLayer } from '../../../../src/integrations/express/request-layer-store';
import { type StartSpanOptions } from '../../../../src/types-hoist/startSpanOptions';
import { type Span } from '../../../../src/types-hoist/span';
import { EventEmitter } from 'node:events';

const mockSpans: MockSpan[] = [];
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
    if (this.ended) throw new Error('ended span multiple times!');
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
      patchLayer({});
    });

    it('if layer already patched', () => {
      // mostly for coverage, verifying it doesn't throw or anything
      const layer = {
        [kLayerPatched]: true,
      } as unknown as ExpressLayer;
      patchLayer({}, layer);
    });

    it('if layer handler of length 4', () => {
      // TODO: this should be expanded when we instrument error handlers
      const layer = {
        handle(_1: unknown, _2: unknown, _3: unknown, _4: unknown) {},
      } as unknown as ExpressLayer;
      patchLayer({}, layer);
      expect(layer[kLayerPatched]).toBe(true);
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

    patchLayer(options, layer);
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

    patchLayer(options, layer, '/layerPath');
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

    patchLayer(options, layer, '/c');
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

    patchLayer(options, layer, '/c');
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
    patchLayer(options, layer, '/c');

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
    patchLayer(options, layer, '/c');

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

    patchLayer(options, layer, '/c');
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
