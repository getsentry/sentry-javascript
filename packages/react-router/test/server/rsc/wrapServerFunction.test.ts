import * as core from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapServerFunction, wrapServerFunctions } from '../../../src/server/rsc/wrapServerFunction';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn(),
    withIsolationScope: vi.fn(),
    captureException: vi.fn(),
    flushIfServerless: vi.fn().mockResolvedValue(undefined),
    getActiveSpan: vi.fn(),
  };
});

describe('wrapServerFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should wrap a server function and execute it', async () => {
    const mockResult = { success: true };
    const mockServerFn = vi.fn().mockResolvedValue(mockResult);
    const mockSetTransactionName = vi.fn();

    (core.withIsolationScope as any).mockImplementation(async (fn: any) => {
      return fn({ setTransactionName: mockSetTransactionName });
    });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn);
    const result = await wrappedFn('arg1', 'arg2');

    expect(result).toEqual(mockResult);
    expect(mockServerFn).toHaveBeenCalledWith('arg1', 'arg2');
    expect(core.withIsolationScope).toHaveBeenCalled();
    expect(mockSetTransactionName).toHaveBeenCalledWith('serverFunction/testFunction');
    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'serverFunction/testFunction',
        forceTransaction: true,
        attributes: expect.objectContaining({
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.rsc.server_function',
          [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.rsc.server_function',
          'rsc.server_function.name': 'testFunction',
        }),
      }),
      expect.any(Function),
    );
    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should use custom span name when provided', async () => {
    const mockServerFn = vi.fn().mockResolvedValue('result');
    const mockSetTransactionName = vi.fn();

    (core.withIsolationScope as any).mockImplementation(async (fn: any) => {
      return fn({ setTransactionName: mockSetTransactionName });
    });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn, {
      name: 'Custom Span Name',
    });
    await wrappedFn();

    expect(mockSetTransactionName).toHaveBeenCalledWith('Custom Span Name');
    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Custom Span Name',
      }),
      expect.any(Function),
    );
  });

  it('should merge custom attributes with default attributes', async () => {
    const mockServerFn = vi.fn().mockResolvedValue('result');
    const mockSetTransactionName = vi.fn();

    (core.withIsolationScope as any).mockImplementation(async (fn: any) => {
      return fn({ setTransactionName: mockSetTransactionName });
    });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn, {
      attributes: { 'custom.attr': 'value' },
    });
    await wrappedFn();

    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.rsc.server_function',
          'custom.attr': 'value',
        }),
      }),
      expect.any(Function),
    );
  });

  it('should capture exceptions on error', async () => {
    const mockError = new Error('Server function failed');
    const mockServerFn = vi.fn().mockRejectedValue(mockError);
    const mockSetStatus = vi.fn();
    const mockSetTransactionName = vi.fn();

    (core.withIsolationScope as any).mockImplementation(async (fn: any) => {
      return fn({ setTransactionName: mockSetTransactionName });
    });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: mockSetStatus }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn);

    await expect(wrappedFn()).rejects.toThrow('Server function failed');
    expect(mockSetStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: {
        type: 'instrument',
        handled: false,
        data: {
          function: 'serverFunction',
          server_function_name: 'testFunction',
        },
      },
    });
    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should not capture redirect errors as exceptions', async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: '/new-path' },
    });
    const mockServerFn = vi.fn().mockRejectedValue(redirectResponse);
    const mockSetStatus = vi.fn();
    const mockSetTransactionName = vi.fn();

    (core.withIsolationScope as any).mockImplementation(async (fn: any) => {
      return fn({ setTransactionName: mockSetTransactionName });
    });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: mockSetStatus }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn);

    await expect(wrappedFn()).rejects.toBe(redirectResponse);
    expect(mockSetStatus).toHaveBeenCalledWith({ code: 1 });
    expect(core.captureException).not.toHaveBeenCalled();
  });

  it('should preserve function name', () => {
    const mockServerFn = vi.fn().mockResolvedValue('result');
    const wrappedFn = wrapServerFunction('testFunction', mockServerFn);

    expect(wrappedFn.name).toBe('sentryWrapped_testFunction');
  });

  it('should propagate errors after capturing', async () => {
    const mockError = new Error('Test error');
    const mockServerFn = vi.fn().mockRejectedValue(mockError);
    const mockSetTransactionName = vi.fn();

    (core.withIsolationScope as any).mockImplementation(async (fn: any) => {
      return fn({ setTransactionName: mockSetTransactionName });
    });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn);

    await expect(wrappedFn()).rejects.toBe(mockError);
  });
});

describe('wrapServerFunctions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should wrap all functions in an object', async () => {
    const mockFn1 = vi.fn().mockResolvedValue('result1');
    const mockFn2 = vi.fn().mockResolvedValue('result2');
    const mockSetTransactionName = vi.fn();

    (core.withIsolationScope as any).mockImplementation(async (fn: any) => {
      return fn({ setTransactionName: mockSetTransactionName });
    });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrapped = wrapServerFunctions('myModule', {
      fn1: mockFn1,
      fn2: mockFn2,
    });

    await wrapped.fn1();
    await wrapped.fn2();

    expect(mockFn1).toHaveBeenCalled();
    expect(mockFn2).toHaveBeenCalled();
    expect(mockSetTransactionName).toHaveBeenCalledWith('serverFunction/myModule.fn1');
    expect(mockSetTransactionName).toHaveBeenCalledWith('serverFunction/myModule.fn2');
  });

  it('should skip non-function values', () => {
    const mockFn = vi.fn().mockResolvedValue('result');

    const wrapped = wrapServerFunctions('myModule', {
      fn: mockFn,
      notAFunction: 'string value' as any,
    });

    expect(typeof wrapped.fn).toBe('function');
    expect(wrapped.notAFunction).toBe('string value');
  });
});
