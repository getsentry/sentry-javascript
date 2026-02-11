import * as SentryBrowser from '@sentry/browser';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { isAtLeastReact17, reactErrorHandler } from '../src/error';

describe('isAtLeastReact17', () => {
  test.each([
    ['React 16', '16.0.4', false],
    ['React 17', '17.0.0', true],
    ['React 17 with no patch', '17.4', true],
    ['React 17 with no patch and no minor', '17', true],
    ['React 18', '18.1.0', true],
    ['React 19', '19.0.0', true],
  ])('%s', (_: string, input: string, output: ReturnType<typeof isAtLeastReact17>) => {
    expect(isAtLeastReact17(input)).toBe(output);
  });
});

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
