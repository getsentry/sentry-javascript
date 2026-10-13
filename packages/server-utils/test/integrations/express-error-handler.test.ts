import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { isExpressErrorHandled } from '../../src/integrations/express/error-handled';
// oxlint-disable-next-line typescript/no-deprecated
import { expressErrorHandler } from '../../src/integrations/express/error-handler';
import { captureLayerError } from '../../src/integrations/express/instrumentation';
import type { ExpressRequest, ExpressResponse, HandleChannelContext } from '../../src/integrations/express/types';

function makeErrorData(error: unknown, span?: unknown): HandleChannelContext {
  return { error, _sentrySpan: span } as unknown as HandleChannelContext;
}

/** Express hands every layer `[req, res, next]`. Sentry reads the request from there and marks it as handled. */
function makeLayerErrorData(error: unknown, request: ExpressRequest, span?: unknown): HandleChannelContext {
  return { error, _sentrySpan: span, arguments: [request] } as unknown as HandleChannelContext;
}

function makeRequest(): ExpressRequest {
  return {
    method: 'GET',
    originalUrl: '/users/42?include=profile',
    headers: { host: 'api.example.com', 'user-agent': 'vitest' },
  } as unknown as ExpressRequest;
}

describe('captureLayerError', () => {
  let captureExceptionSpy: MockInstance;

  beforeEach(() => {
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => 'id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures a 5xx error by default', () => {
    const error = Object.assign(new Error('boom'), { statusCode: 500 });

    captureLayerError(makeErrorData(error), undefined);

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.http.express', handled: false },
    });
  });

  it('captures an error without a resolvable status by default', () => {
    const error = new Error('boom');

    captureLayerError(makeErrorData(error), undefined);

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.http.express', handled: false },
    });
  });

  it('does not capture a 4xx error by default', () => {
    const error = Object.assign(new Error('bad request'), { statusCode: 400 });

    captureLayerError(makeErrorData(error), undefined);

    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it.each(['route', 'router'])('ignores the Express `next(%s)` control signal', signal => {
    captureLayerError(makeErrorData(signal), undefined);

    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null], [false], [0], ['']])('does not capture when there is no error (%j)', error => {
    captureLayerError(makeErrorData(error), undefined);

    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it.each([[1], [true], ['asdasdas']])('captures primitive errors (%j)', error => {
    captureLayerError(makeErrorData(error), undefined);

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.http.express', handled: false },
    });
  });

  it('honors a custom shouldHandleError', () => {
    const shouldHandleError = vi.fn().mockReturnValue(true);
    const error = Object.assign(new Error('teapot'), { statusCode: 418 });

    captureLayerError(makeErrorData(error), shouldHandleError);

    expect(shouldHandleError).toHaveBeenCalledWith(error);
    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.http.express', handled: false },
    });
  });

  it('captures nothing when shouldHandleError is false', () => {
    const error = Object.assign(new Error('boom'), { statusCode: 500 });

    captureLayerError(makeErrorData(error), false);

    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('re-activates the bound layer span so the event is parented to the trace', () => {
    const withActiveSpanSpy = vi
      .spyOn(SentryCore, 'withActiveSpan')
      .mockImplementation((_span, fn) => (fn as () => unknown)(undefined as never) as never);
    const span = { id: 'layer-span' };
    const error = Object.assign(new Error('boom'), { statusCode: 500 });

    captureLayerError(makeErrorData(error, span), undefined);

    expect(withActiveSpanSpy).toHaveBeenCalledWith(span, expect.any(Function));
    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.http.express', handled: false },
    });
  });

  it('captures without a span when none is bound (e.g. unsampled request)', () => {
    const withActiveSpanSpy = vi.spyOn(SentryCore, 'withActiveSpan');
    const error = Object.assign(new Error('boom'), { statusCode: 500 });

    captureLayerError(makeErrorData(error), undefined);

    expect(withActiveSpanSpy).not.toHaveBeenCalled();
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
  });

  describe('per-request dedup marker', () => {
    it('captures once when the same error bubbles through several layers', () => {
      const request = makeRequest();
      const error = Object.assign(new Error('boom'), { statusCode: 500 });

      captureLayerError(makeLayerErrorData(error, request), undefined);
      captureLayerError(makeLayerErrorData(error, request), undefined);
      captureLayerError(makeLayerErrorData(error, request), undefined);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    });

    it('marks the request when the error is skipped, so the deprecated middleware defers', () => {
      const request = makeRequest();
      const error = Object.assign(new Error('bad request'), { statusCode: 400 });

      captureLayerError(makeLayerErrorData(error, request), undefined);

      expect(captureExceptionSpy).not.toHaveBeenCalled();
      expect(isExpressErrorHandled(request)).toBe(true);
    });

    it('marks the request when shouldHandleError is false', () => {
      const request = makeRequest();
      const error = Object.assign(new Error('boom'), { statusCode: 500 });

      captureLayerError(makeLayerErrorData(error, request), false);

      expect(captureExceptionSpy).not.toHaveBeenCalled();
      expect(isExpressErrorHandled(request)).toBe(true);
    });

    it('leaves the request unmarked when there is no error', () => {
      const request = makeRequest();

      captureLayerError(makeLayerErrorData(undefined, request), undefined);

      expect(isExpressErrorHandled(request)).toBe(false);
    });

    // No request means nothing to mark, so every layer captures again. Express always passes one, so this cannot happen in practice.
    it('captures on every layer when Express passes no request', () => {
      const error = Object.assign(new Error('boom'), { statusCode: 500 });

      captureLayerError(makeErrorData(error), undefined);
      captureLayerError(makeErrorData(error), undefined);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(2);
    });

    // TODO: Sentry marks the request, not the error, so only the first error per request is captured. Later errors on the same request are lost.
    it.fails('captures a second, distinct error raised on the same request', () => {
      const request = makeRequest();
      const firstError = Object.assign(new Error('first failure'), { statusCode: 400 });
      const secondError = Object.assign(new Error('second failure'), { statusCode: 500 });

      captureLayerError(makeLayerErrorData(firstError, request), undefined);
      captureLayerError(makeLayerErrorData(secondError, request), undefined);

      expect(captureExceptionSpy).toHaveBeenCalledWith(secondError, {
        mechanism: { type: 'auto.http.express', handled: false },
      });
    });
  });
});

describe('expressErrorHandler', () => {
  let captureExceptionSpy: MockInstance;

  beforeEach(() => {
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => 'event-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeResponse(): ExpressResponse & { sentry?: string } {
    return { once: () => undefined, removeListener: () => undefined } as unknown as ExpressResponse & {
      sentry?: string;
    };
  }

  // A request whose error the integration already captured, before this middleware runs.
  function makeHandledRequest(): ExpressRequest {
    const request = makeRequest();
    captureLayerError(makeLayerErrorData(new Error('captured by the integration'), request), undefined);
    return request;
  }

  it('captures a 5xx error and exposes the event id on the response', () => {
    const res = makeResponse();
    const error = Object.assign(new Error('boom'), { statusCode: 500 });

    expressErrorHandler()(error, makeRequest(), res, vi.fn());

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.middleware.express', handled: false },
    });
    expect(res.sentry).toBe('event-id');
  });

  it('does not capture a 4xx error', () => {
    const res = makeResponse();
    const error = Object.assign(new Error('bad request'), { statusCode: 400 });

    expressErrorHandler()(error, makeRequest(), res, vi.fn());

    expect(captureExceptionSpy).not.toHaveBeenCalled();
    expect(res.sentry).toBeUndefined();
  });

  it.each([
    ['captured', 500],
    ['skipped', 400],
  ])('forwards the error to next when %s', (_case, statusCode) => {
    const next = vi.fn();
    const error = Object.assign(new Error('boom'), { statusCode });

    expressErrorHandler()(error, makeRequest(), makeResponse(), next);

    expect(next).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('defers to the integration once the request is marked', () => {
    const request = makeHandledRequest();
    captureExceptionSpy.mockClear();
    const error = Object.assign(new Error('boom'), { statusCode: 500 });

    expressErrorHandler()(error, request, makeResponse(), vi.fn());

    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('forwards the error to next even when it defers', () => {
    const next = vi.fn();
    const error = Object.assign(new Error('boom'), { statusCode: 500 });

    expressErrorHandler()(error, makeHandledRequest(), makeResponse(), next);

    expect(next).toHaveBeenCalledExactlyOnceWith(error);
  });

  // TODO: `res.sentry` carries the captured event id, but only this middleware sets it.
  //  Once the integration captures first, apps reading `res.sentry` get undefined instead of the id.
  it.fails('exposes the event id on the response when the integration captured the error', () => {
    const res = makeResponse();
    const error = Object.assign(new Error('boom'), { statusCode: 500 });

    expressErrorHandler()(error, makeHandledRequest(), res, vi.fn());

    expect(res.sentry).toBe('event-id');
  });
});
