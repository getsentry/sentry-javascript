import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  wrapApiHandlerWithSentry,
  wrapMiddlewareWithSentry,
  wrapRouteHandlerWithSentry,
  wrapServerComponentWithSentry,
} from '../../src/common/wrappers';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn((_options, callback) => callback()),
    withIsolationScope: vi.fn(callback =>
      callback({
        setTransactionName: vi.fn(),
      }),
    ),
    captureException: vi.fn(),
  };
});

describe('wrapRouteHandlerWithSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the original handler and returns its result', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('OK'));
    const wrapped = wrapRouteHandlerWithSentry(handler, 'GET', '/api/users');

    const result = await wrapped();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(Response);
  });

  it('creates a span with the correct attributes', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('OK'));
    const wrapped = wrapRouteHandlerWithSentry(handler, 'POST', '/api/data');

    await wrapped();

    expect(SentryCore.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'POST /api/data',
        attributes: expect.objectContaining({
          'http.method': 'POST',
        }),
      }),
      expect.any(Function),
    );
  });

  it('captures errors and re-throws', async () => {
    const error = new Error('handler failed');
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = wrapRouteHandlerWithSentry(handler, 'GET', '/api/test');

    await expect(wrapped()).rejects.toThrow('handler failed');
    expect(SentryCore.captureException).toHaveBeenCalledWith(error, {
      mechanism: {
        handled: false,
        type: 'auto.function.vinext.route_handler',
      },
    });
  });
});

describe('wrapServerComponentWithSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the original component', async () => {
    const component = vi.fn().mockResolvedValue('<div>Hello</div>');
    const wrapped = wrapServerComponentWithSentry(component, {
      componentRoute: '/blog/[slug]',
      componentType: 'page',
    });

    await wrapped({ slug: 'test' });

    expect(component).toHaveBeenCalledWith({ slug: 'test' });
  });

  it('creates a span with correct attributes', async () => {
    const component = vi.fn().mockResolvedValue(null);
    const wrapped = wrapServerComponentWithSentry(component, {
      componentRoute: '/about',
      componentType: 'layout',
    });

    await wrapped();

    expect(SentryCore.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'layout /about',
        attributes: expect.objectContaining({
          'vinext.component_type': 'layout',
        }),
      }),
      expect.any(Function),
    );
  });
});

describe('wrapMiddlewareWithSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the original middleware', async () => {
    const middleware = vi.fn().mockResolvedValue(new Response());
    const wrapped = wrapMiddlewareWithSentry(middleware);

    const request = { url: 'http://localhost:3000/api/test', method: 'GET' };
    await wrapped(request);

    expect(middleware).toHaveBeenCalledWith(request);
  });

  it('extracts path from request URL', async () => {
    const middleware = vi.fn().mockResolvedValue(new Response());
    const wrapped = wrapMiddlewareWithSentry(middleware);

    await wrapped({ url: 'http://localhost:3000/protected', method: 'POST' });

    expect(SentryCore.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'middleware POST /protected',
      }),
      expect.any(Function),
    );
  });
});

describe('wrapApiHandlerWithSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the original handler', async () => {
    const handler = vi.fn();
    const wrapped = wrapApiHandlerWithSentry(handler, '/api/users');

    const req = { method: 'GET' };
    const res = {};
    await wrapped(req, res);

    expect(handler).toHaveBeenCalledWith(req, res);
  });

  it('creates a span with the route', async () => {
    const handler = vi.fn();
    const wrapped = wrapApiHandlerWithSentry(handler, '/api/users/[id]');

    await wrapped({ method: 'PUT' }, {});

    expect(SentryCore.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'PUT /api/users/[id]',
      }),
      expect.any(Function),
    );
  });
});
