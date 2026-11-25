import * as SentryCore from '@sentry/core';
import * as SentryCoreServer from '@sentry/core/server';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { captureNitroRequestError, captureNitroTaskError } from '../../../src/integrations/nitro/captureErrors';

function makeHTTPError(status: number, cause?: unknown): Error {
  return Object.assign(new Error('HTTP error', { cause }), { name: 'HTTPError', status });
}

function makeCapturedError(): Error {
  const error = new Error('Already captured');
  Object.defineProperty(error, '__sentry_captured__', { value: true });
  return error;
}

const REQUEST_MECHANISM = { handled: false, type: 'auto.function.nitro.captureErrorHook' };

describe('nitro error capture', () => {
  let captureExceptionSpy: MockInstance;
  let flushSpy: MockInstance;

  beforeEach(() => {
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => 'id');
    flushSpy = vi.spyOn(SentryCoreServer, 'flushIfServerless').mockResolvedValue(undefined);
    vi.spyOn(SentryCore, 'getClient').mockReturnValue({ getOptions: () => ({}) } as SentryCore.Client);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('captureNitroRequestError', () => {
    it('captures the error with the request method, path and tags', async () => {
      const error = new Error('Database unavailable');

      await captureNitroRequestError(error, {
        event: { req: { method: 'POST', url: 'https://api.example.com/users/42?include=profile' } },
        tags: ['request'],
      });

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        captureContext: { contexts: { nitro: { method: 'POST', path: '/users/42', tags: ['request'] } } },
        mechanism: REQUEST_MECHANISM,
      });
    });

    it('captures the error with an empty nitro context when no context is passed', async () => {
      const error = new Error('Database unavailable');

      await captureNitroRequestError(error);

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        captureContext: { contexts: { nitro: {} } },
        mechanism: REQUEST_MECHANISM,
      });
    });

    it('flushes after capturing', async () => {
      await captureNitroRequestError(new Error('Database unavailable'));

      expect(flushSpy).toHaveBeenCalledTimes(1);
    });

    it('does not capture when enableNitroErrorHandler is false', async () => {
      vi.spyOn(SentryCore, 'getClient').mockReturnValue({
        getOptions: () => ({ enableNitroErrorHandler: false }),
      } as unknown as SentryCore.Client);

      await captureNitroRequestError(new Error('Database unavailable'));

      expect(captureExceptionSpy).not.toHaveBeenCalled();
      expect(flushSpy).not.toHaveBeenCalled();
    });

    it.each([300, 302, 404, 499])('does not capture an HTTPError with status %i', async status => {
      await captureNitroRequestError(makeHTTPError(status));

      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it.each([299, 500, 503])('captures an HTTPError with status %i', async status => {
      const error = makeHTTPError(status);

      await captureNitroRequestError(error);

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        captureContext: { contexts: { nitro: {} } },
        mechanism: REQUEST_MECHANISM,
      });
    });

    it('does not capture an HTTPError whose cause was already captured', async () => {
      await captureNitroRequestError(makeHTTPError(500, makeCapturedError()));

      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('captures an HTTPError without a valid status even when its cause was already captured', async () => {
      const error = Object.assign(new Error('HTTP error', { cause: makeCapturedError() }), { name: 'HTTPError' });

      await captureNitroRequestError(error);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    });

    it('captures a non-HTTPError error with a 4xx status', async () => {
      const error = Object.assign(new Error('Not found'), { status: 404 });

      await captureNitroRequestError(error);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    });

    it('captures a plain object shaped like an HTTPError', async () => {
      const error = { name: 'HTTPError', status: 404, message: 'Not found' };

      await captureNitroRequestError(error);

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('captureNitroTaskError', () => {
    it('captures the error with the task name and flushes', async () => {
      const error = new Error('Task failed');

      await captureNitroTaskError(error, 'db:cleanup');

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        captureContext: { contexts: { nitro: { task: 'db:cleanup' } } },
        mechanism: { handled: false, type: 'auto.function.nitro.task' },
      });
      expect(flushSpy).toHaveBeenCalledTimes(1);
    });
  });
});
