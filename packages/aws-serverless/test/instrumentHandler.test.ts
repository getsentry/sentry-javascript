import type { Context, Handler } from 'aws-lambda';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { instrumentHandler } from '../src/instrumentHandler';

const mockSpan = {
  setStatus: vi.fn(),
  end: vi.fn(),
};

vi.mock('@sentry/core', async () => {
  const original = await vi.importActual('@sentry/core');
  return {
    ...original,
    continueTrace: (_traceData: unknown, callback: () => unknown) => callback(),
    startSpanManual: (_options: unknown, callback: (span: unknown) => unknown) => callback(mockSpan),
  };
});

vi.mock('@sentry/node', async () => {
  const original = await vi.importActual('@sentry/node');
  return {
    ...original,
    flush: () => Promise.resolve(true),
    captureException: vi.fn(),
  };
});

const fakeContext = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'functionName',
  functionVersion: 'functionVersion',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:functionName',
  memoryLimitInMB: '128',
  awsRequestId: 'awsRequestId',
  logGroupName: 'logGroupName',
  logStreamName: 'logStreamName',
  getRemainingTimeInMillis: () => 30_000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
} as Context;

describe('instrumentHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('ends the span when a callback-style handler calls back asynchronously', async () => {
    const handler: Handler = (_event, _context, callback) => {
      setTimeout(() => callback(null, 42), 10);
    };

    const result = instrumentHandler(handler)({}, fakeContext, () => {});
    expect(mockSpan.end).not.toHaveBeenCalled();

    await expect(result).resolves.toBe(42);
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
    expect(mockSpan.setStatus).not.toHaveBeenCalled();
  });

  test('sets error status when a callback-style handler calls back with an error asynchronously', async () => {
    const handler: Handler = (_event, _context, callback) => {
      setTimeout(() => callback(new Error('boom')), 10);
    };

    const result = instrumentHandler(handler)({}, fakeContext, () => {});
    expect(mockSpan.end).not.toHaveBeenCalled();

    await expect(result).rejects.toThrow('boom');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'boom' });
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });

  test('ends the span when an async handler resolves', async () => {
    const handler: Handler = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 42;
    };

    await expect(instrumentHandler(handler)({}, fakeContext, () => {})).resolves.toBe(42);
    expect(mockSpan.end).toHaveBeenCalledTimes(1);
    expect(mockSpan.setStatus).not.toHaveBeenCalled();
  });
});
