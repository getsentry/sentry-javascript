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
});
