import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureUnderscoreErrorException } from '../../../src/common/pages-router-instrumentation/_error';

const mockCaptureException = vi.fn(() => 'test-event-id');
const mockWithScope = vi.fn((callback: (scope: any) => any) => {
  const mockScope = {
    setSDKProcessingMetadata: vi.fn(),
  };
  return callback(mockScope);
});

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    withScope: (callback: (scope: any) => any) => mockWithScope(callback),
    httpRequestToRequestData: vi.fn(() => ({ url: 'http://test.com' })),
  };
});

vi.mock('../../../src/common/utils/responseEnd', () => ({
  flushSafelyWithTimeout: vi.fn(() => Promise.resolve()),
  waitUntil: vi.fn(),
}));

describe('captureUnderscoreErrorException', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return the event ID when capturing an exception', async () => {
    const error = new Error('Test error');
    const result = await captureUnderscoreErrorException({
      err: error,
      pathname: '/test',
      res: { statusCode: 500 } as any,
    });

    expect(result).toBe('test-event-id');
    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      mechanism: {
        type: 'auto.function.nextjs.underscore_error',
        handled: false,
        data: {
          function: '_error.getInitialProps',
        },
      },
    });
  });

  it('should return undefined for 4xx status codes', async () => {
    const result = await captureUnderscoreErrorException({
      err: new Error('Not found'),
      pathname: '/test',
      res: { statusCode: 404 } as any,
    });

    expect(result).toBeUndefined();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('should return undefined when pathname is not provided (render call)', async () => {
    const result = await captureUnderscoreErrorException({
      err: new Error('Test error'),
      res: { statusCode: 500 } as any,
    });

    expect(result).toBeUndefined();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('should capture falsy errors as messages', async () => {
    const result = await captureUnderscoreErrorException({
      err: undefined,
      pathname: '/test',
      res: { statusCode: 500 } as any,
    });

    expect(result).toBe('test-event-id');
    expect(mockCaptureException).toHaveBeenCalledWith('_error.js called with falsy error (undefined)', {
      mechanism: {
        type: 'auto.function.nextjs.underscore_error',
        handled: false,
        data: {
          function: '_error.getInitialProps',
        },
      },
    });
  });

  it('should use statusCode from contextOrProps when res is not available', async () => {
    const result = await captureUnderscoreErrorException({
      err: new Error('Test error'),
      pathname: '/test',
      statusCode: 500,
    });

    expect(result).toBe('test-event-id');
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('should return undefined when statusCode from contextOrProps is 4xx', async () => {
    const result = await captureUnderscoreErrorException({
      err: new Error('Bad request'),
      pathname: '/test',
      statusCode: 400,
    });

    expect(result).toBeUndefined();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
