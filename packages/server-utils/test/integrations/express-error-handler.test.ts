import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { captureLayerError } from '../../../src/integrations/express/instrumentation';
import type { HandleChannelContext } from '../../../src/integrations/express/types';

function makeErrorData(error: unknown): HandleChannelContext {
  return { error } as unknown as HandleChannelContext;
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

  it('does not capture when there is no error', () => {
    captureLayerError(makeErrorData(undefined), undefined);

    expect(captureExceptionSpy).not.toHaveBeenCalled();
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
});
