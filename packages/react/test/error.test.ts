import * as SentryBrowser from '@sentry/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactErrorHandler } from '../src/error';

describe('reactErrorHandler', () => {
  const captureException = vi.spyOn(SentryBrowser, 'captureException');

  beforeEach(() => {
    captureException.mockClear();
  });

  it('captures errors as unhandled when no callback is provided', () => {
    const error = new Error('test error');
    const errorInfo = { componentStack: 'component stack' };

    const handler = reactErrorHandler();

    handler(error, errorInfo);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.function.react.error_handler' },
    });
  });

  it('captures errors as handled when a callback is provided', () => {
    captureException.mockReturnValueOnce('custom-event-id');

    const error = new Error('test error');
    const errorInfo = { componentStack: 'component stack' };

    const callback = vi.fn();
    const handler = reactErrorHandler(callback);

    handler(error, errorInfo);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: true, type: 'auto.function.react.error_handler' },
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(error, errorInfo, 'custom-event-id');
  });
});
