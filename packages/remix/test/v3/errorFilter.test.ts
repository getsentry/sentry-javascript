import type * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/core', async importOriginal => ({
  isObjectLike: (await importOriginal<typeof SentryCore>()).isObjectLike,
  captureException: (...args: unknown[]) => captureException(...args),
}));

const { captureRequestError, defaultShouldHandleError, isRequestAbort, setShouldHandleError } =
  await import('../../src/v3/server/errorFilter');

/** A request whose connection has dropped, rejecting with `signal.reason` as the router does. */
function abortedRequest(reason: unknown): Request {
  const controller = new AbortController();
  const request = new Request('http://x/', { signal: controller.signal });
  controller.abort(reason);
  return request;
}

describe('defaultShouldHandleError', () => {
  it.each([300, 302, 404, 499])('skips status %i', status => {
    expect(defaultShouldHandleError({ status })).toBe(false);
  });

  it.each([200, 500, 503])('captures status %i', status => {
    expect(defaultShouldHandleError({ status })).toBe(true);
  });

  it.each([
    ['a plain error', new Error('boom')],
    ['a thrown string', 'boom'],
    ['null', null],
    ['a non-numeric status', { status: '404' }],
  ])('captures %s', (_what, error) => {
    expect(defaultShouldHandleError(error)).toBe(true);
  });
});

describe('isRequestAbort', () => {
  it('matches the reason the request was aborted with', () => {
    const reason = new Error('aborted');
    expect(isRequestAbort(reason, abortedRequest(reason))).toBe(true);
  });

  it('does not match a different error on an aborted request', () => {
    expect(isRequestAbort(new Error('boom'), abortedRequest(new Error('aborted')))).toBe(false);
  });

  it('does not match on a live request', () => {
    expect(isRequestAbort(new Error('boom'), new Request('http://x/'))).toBe(false);
  });
});

describe('captureRequestError', () => {
  beforeEach(() => {
    captureException.mockClear();
    setShouldHandleError(undefined);
  });

  it('captures with the mechanism it was given', () => {
    const error = new Error('boom');

    expect(captureRequestError(error, new Request('http://x/'), 'auto.test')).toBe(true);
    expect(captureException).toHaveBeenCalledWith(error, { mechanism: { handled: false, type: 'auto.test' } });
  });

  it('drops an aborted request', () => {
    const reason = new Error('aborted');

    expect(captureRequestError(reason, abortedRequest(reason), 'auto.test')).toBe(false);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('drops what the filter rejects', () => {
    setShouldHandleError(() => false);

    expect(captureRequestError(new Error('boom'), new Request('http://x/'), 'auto.test')).toBe(false);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('swallows a throwing filter so the request keeps its own error', () => {
    setShouldHandleError(() => {
      throw new Error('filter broke');
    });

    expect(() => captureRequestError(new Error('boom'), new Request('http://x/'), 'auto.test')).not.toThrow();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('still captures without a request, as the onError hook has none', () => {
    expect(captureRequestError(new Error('boom'), undefined, 'auto.test')).toBe(true);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
