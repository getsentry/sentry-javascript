import * as SentryCore from '@sentry/core';
import * as SentryReact from '@sentry/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sentryOnError } from '../../src/client/sentryOnError';

const captureReactExceptionSpy = vi.spyOn(SentryReact, 'captureReactException').mockReturnValue('mock-event-id');
const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('mock-event-id');

describe('sentryOnError', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls captureReactException when errorInfo is provided', () => {
    const error = new Error('test error');
    const errorInfo = { componentStack: '<TestComponent>\n<App>' };

    sentryOnError(error, {
      errorInfo,
    });

    expect(captureReactExceptionSpy).toHaveBeenCalledWith(error, errorInfo, {
      mechanism: { handled: false, type: 'auto.function.react_router.on_error' },
    });
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('calls captureException when errorInfo is undefined', () => {
    const error = new Error('loader error');

    sentryOnError(error, {});

    expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.function.react_router.on_error' },
    });
    expect(captureReactExceptionSpy).not.toHaveBeenCalled();
  });
});
