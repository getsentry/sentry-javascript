import * as SentryCore from '@sentry/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { patchAppRequest } from '../../src/shared/patchAppRequest';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn((_opts: unknown, callback: () => unknown) => callback()),
    getActiveSpan: vi.fn(() => ({ spanId: 'fake-span' })),
  };
});

const startSpanMock = SentryCore.startSpan as ReturnType<typeof vi.fn>;
const getActiveSpanMock = SentryCore.getActiveSpan as ReturnType<typeof vi.fn>;

describe('patchAppRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveSpanMock.mockReturnValue({ spanId: 'fake-span' });
  });

  it('creates a hono.request span when .request() is called with an active parent span', async () => {
    const app = new Hono();
    app.get('/hello', c => c.text('world'));
    patchAppRequest(app);

    await app.request('/hello');

    expect(startSpanMock).toHaveBeenCalledTimes(1);
    expect(startSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'GET /hello',
        op: 'hono.request',
        onlyIfParent: true,
        attributes: expect.objectContaining({
          'sentry.op': 'hono.request',
          'sentry.origin': 'auto.http.hono.internal_request',
        }),
      }),
      expect.any(Function),
    );
  });

  it('skips span creation when there is no active span', async () => {
    getActiveSpanMock.mockReturnValue(undefined);

    const app = new Hono();
    app.get('/hello', c => c.text('world'));
    patchAppRequest(app);

    const res = await app.request('/hello');

    expect(startSpanMock).not.toHaveBeenCalled();
    expect(await res.text()).toBe('world');
  });

  it('uses the method from requestInit when provided', async () => {
    const app = new Hono();
    app.post('/submit', c => c.text('ok'));
    patchAppRequest(app);

    await app.request('/submit', { method: 'POST' });

    expect(startSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'POST /submit' }), expect.any(Function));
  });

  it('uses the method from a Request object when no requestInit is provided', async () => {
    const app = new Hono();
    app.post('/submit', c => c.text('ok'));
    patchAppRequest(app);

    await app.request(new Request('http://localhost/submit', { method: 'POST' }));

    expect(startSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'POST /submit' }), expect.any(Function));
  });

  it('defaults to GET when no method info is available', async () => {
    const app = new Hono();
    app.get('/hello', c => c.text('world'));
    patchAppRequest(app);

    await app.request('/hello');

    expect(startSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'GET /hello' }), expect.any(Function));
  });

  it('does not double-patch when called twice on the same instance', async () => {
    const app = new Hono();
    app.get('/hello', c => c.text('world'));

    patchAppRequest(app);
    const firstPatched = app.request;

    patchAppRequest(app);
    expect(app.request).toBe(firstPatched);
  });

  it('preserves the original .request() return value', async () => {
    const app = new Hono();
    app.get('/hello', c => c.json({ message: 'world' }));
    patchAppRequest(app);

    const res = await app.request('/hello');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ message: 'world' });
  });

  it('stores the original request via __sentry_original__', () => {
    const app = new Hono();
    const originalRequest = app.request;
    patchAppRequest(app);

    // oxlint-disable-next-line typescript/no-explicit-any
    const sentryOriginal = (app.request as any).__sentry_original__;
    expect(sentryOriginal).toBe(originalRequest);
  });

  it('extracts pathname from a full URL string instead of using the raw string', async () => {
    const app = new Hono();
    app.get('/api/hello', c => c.text('world'));
    patchAppRequest(app);

    await app.request('http://localhost/api/hello');

    expect(startSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'GET /api/hello' }),
      expect.any(Function),
    );
  });

  it('extracts pathname from an https URL string', async () => {
    const app = new Hono();
    app.get('/secure', c => c.text('ok'));
    patchAppRequest(app);

    await app.request('https://example.com/secure');

    expect(startSpanMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'GET /secure' }), expect.any(Function));
  });

  it('extracts pathname from a Request object input', async () => {
    const app = new Hono();
    app.get('/items/abc', c => c.text('found'));
    patchAppRequest(app);

    await app.request(new Request('http://localhost/items/abc'));

    expect(startSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'GET /items/abc' }),
      expect.any(Function),
    );
  });

  describe('non-invasive patching (preserves existing properties)', () => {
    it('preserves symbol-keyed properties on app.request', () => {
      const app = new Hono();
      const CUSTOM_SYMBOL = Symbol('custom-meta');
      (app.request as any)[CUSTOM_SYMBOL] = { version: 2 };

      patchAppRequest(app);

      const symbols = Object.getOwnPropertySymbols(app.request);
      expect(symbols).toContain(CUSTOM_SYMBOL);
      expect((app.request as any)[CUSTOM_SYMBOL]).toEqual({ version: 2 });
    });

    it('preserves string-keyed custom properties on app.request', () => {
      const app = new Hono();
      (app.request as any).customFlag = true;
      (app.request as any).metadata = { wrapped: false };

      patchAppRequest(app);

      expect((app.request as any).customFlag).toBe(true);
      expect((app.request as any).metadata).toEqual({ wrapped: false });
    });

    it('preserves function.name of the original request method', () => {
      const app = new Hono();
      const originalName = app.request.name;
      patchAppRequest(app);

      expect(app.request.name).toBe(originalName);
    });

    it('preserves function.length of the original request method', () => {
      const app = new Hono();
      const originalLength = app.request.length;
      patchAppRequest(app);

      expect(app.request.length).toBe(originalLength);
    });

    it('does not interfere with instanceof or typeof checks', () => {
      const app = new Hono();
      patchAppRequest(app);

      expect(typeof app.request).toBe('function');
    });

    it('preserves prototype chain of the original function', () => {
      const app = new Hono();
      const originalProto = Object.getPrototypeOf(app.request);
      patchAppRequest(app);

      expect(Object.getPrototypeOf(app.request)).toBe(originalProto);
    });

    it('preserves properties added by third-party libraries (e.g. OpenAPI metadata)', () => {
      const app = new Hono();
      const OPENAPI = Symbol('openapi');
      (app.request as any)[OPENAPI] = { paths: { '/hello': { get: {} } } };
      (app.request as any).__middleware_chain__ = ['auth', 'cors'];

      patchAppRequest(app);

      expect((app.request as any)[OPENAPI]).toEqual({ paths: { '/hello': { get: {} } } });
      expect((app.request as any).__middleware_chain__).toEqual(['auth', 'cors']);
    });
  });
});
