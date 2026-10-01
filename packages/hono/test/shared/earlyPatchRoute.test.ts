import * as SentryCore from '@sentry/core';
import { applyHonoPatches as applyPatches, earlyPatchHono } from '@sentry/server-utils';
import { Hono } from 'hono';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startInactiveSpan: vi.fn((_opts: unknown) => ({
      setStatus: vi.fn(),
      end: vi.fn(),
    })),
    startSpan: vi.fn((_opts: unknown, callback: () => unknown) => callback()),
    getActiveSpan: vi.fn(() => ({ spanId: 'fake-span' })),
  };
});

const startSpanMock = SentryCore.startSpan as ReturnType<typeof vi.fn>;

const honoBaseProto = Object.getPrototypeOf(Hono.prototype) as { route: (path: string, app: unknown) => unknown };
const originalRoute = honoBaseProto.route;

// `earlyPatchHono` installs the `HonoBase.prototype.route` hook at import time, before any
// `sentry()`/`applyHonoPatches` runs, so sub-apps mounted early are still collected.
earlyPatchHono(Hono);

describe('earlyPatchHono (two-phase prototype hook)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    honoBaseProto.route = originalRoute;
  });

  it('does NOT patch sub-app .request() at .route() time — only collects', async () => {
    const subApp = new Hono();
    subApp.get('/hello', c => c.text('world'));

    const parent = new Hono();
    parent.route('/api', subApp);

    await subApp.request('/hello');
    expect(startSpanMock).not.toHaveBeenCalled();
  });

  it('patches collected sub-apps when applyHonoPatches activates', async () => {
    const subApp = new Hono();
    subApp.get('/hello', c => c.text('world'));

    const parent = new Hono();
    parent.route('/api', subApp);

    applyPatches(parent);

    await subApp.request('/hello');

    expect(startSpanMock).toHaveBeenCalledTimes(1);
    expect(startSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'GET /hello' }), expect.any(Function));
  });

  it('preserves correct route behavior', async () => {
    const subApp = new Hono();
    subApp.get('/hello', c => c.text('world'));

    const parent = new Hono();
    parent.route('/api', subApp);

    const res = await parent.fetch(new Request('http://localhost/api/hello'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('world');
  });
});

// The prototype `route` hook must patch `HonoBase.prototype.route` without stripping metadata another
// library (e.g. an OpenAPI router) may have attached to it. This behaviour is not observable through
// spans/events, so it lives here rather than in the node-integration tests.
describe('route hook non-invasive patching', () => {
  const ROUTER_META = Symbol('router-meta');

  afterAll(() => {
    honoBaseProto.route = originalRoute;
    Reflect.deleteProperty(originalRoute, ROUTER_META);
    Reflect.deleteProperty(originalRoute, 'pluginId');
  });

  // Re-install the hook over a pristine `route` (carrying any pre-set metadata) via the public entry.
  function reinstallOverPristineRoute(): void {
    honoBaseProto.route = originalRoute;
    applyPatches(new Hono());
  }

  it('preserves function name and length of the original route method', () => {
    reinstallOverPristineRoute();

    const patched = honoBaseProto.route as (...args: unknown[]) => unknown;
    expect(patched.name).toBe(originalRoute.name);
    expect(patched.length).toBe(originalRoute.length);
  });

  it('preserves symbol- and string-keyed properties on the route method', () => {
    (originalRoute as unknown as Record<PropertyKey, unknown>)[ROUTER_META] = { version: 3 };
    (originalRoute as unknown as Record<string, unknown>).pluginId = 'openapi-router';

    reinstallOverPristineRoute();

    expect(Object.getOwnPropertySymbols(honoBaseProto.route)).toContain(ROUTER_META);
    expect((honoBaseProto.route as unknown as Record<PropertyKey, unknown>)[ROUTER_META]).toEqual({ version: 3 });
    expect((honoBaseProto.route as unknown as Record<string, unknown>).pluginId).toBe('openapi-router');
  });

  it('preserves the prototype chain of the original route method', () => {
    reinstallOverPristineRoute();

    expect(Object.getPrototypeOf(honoBaseProto.route)).toBe(Object.getPrototypeOf(originalRoute));
  });

  it('still mounts sub-apps and returns the parent app', () => {
    reinstallOverPristineRoute();

    const parent = new Hono();
    const subApp = new Hono();
    subApp.get('/test', c => c.text('ok'));

    expect(parent.route('/api', subApp)).toBe(parent);
  });
});
