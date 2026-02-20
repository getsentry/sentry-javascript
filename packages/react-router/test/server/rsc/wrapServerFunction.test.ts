import * as core from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapServerFunction } from '../../../src/server/rsc/wrapServerFunction';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn(),
    getIsolationScope: vi.fn(),
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

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn);
    const result = await wrappedFn('arg1', 'arg2');

    expect(result).toEqual(mockResult);
    expect(mockServerFn).toHaveBeenCalledWith('arg1', 'arg2');
    expect(core.getIsolationScope).toHaveBeenCalled();
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

  it('should set forceTransaction to false when there is an active span', async () => {
    const mockResult = { success: true };
    const mockServerFn = vi.fn().mockResolvedValue(mockResult);
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
    (core.getActiveSpan as any).mockReturnValue({ spanId: 'existing-span' });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn);
    await wrappedFn();

    expect(core.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        forceTransaction: false,
      }),
      expect.any(Function),
    );
  });

  it('should use custom span name when provided', async () => {
    const mockServerFn = vi.fn().mockResolvedValue('result');
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
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

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
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

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: mockSetStatus }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn);

    await expect(wrappedFn()).rejects.toThrow('Server function failed');
    expect(mockSetStatus).toHaveBeenCalledWith({ code: core.SPAN_STATUS_ERROR, message: 'internal_error' });
    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: {
        type: 'react_router.rsc',
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

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: mockSetStatus }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn);

    await expect(wrappedFn()).rejects.toBe(redirectResponse);
    expect(mockSetStatus).toHaveBeenCalledWith({ code: core.SPAN_STATUS_OK });
    expect(core.captureException).not.toHaveBeenCalled();
  });

  it('should not capture not-found errors as exceptions', async () => {
    const notFoundResponse = new Response(null, { status: 404 });
    const mockServerFn = vi.fn().mockRejectedValue(notFoundResponse);
    const mockSetStatus = vi.fn();
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: mockSetStatus }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn);

    await expect(wrappedFn()).rejects.toBe(notFoundResponse);
    expect(mockSetStatus).toHaveBeenCalledWith({ code: core.SPAN_STATUS_ERROR, message: 'not_found' });
    expect(core.captureException).not.toHaveBeenCalled();
  });

  it('should preserve function properties via Proxy', () => {
    const namedServerFn = Object.assign(
      async function myServerAction(): Promise<string> {
        return 'result';
      },
      { customProp: 'value' },
    );
    const wrappedFn = wrapServerFunction('myServerAction', namedServerFn);

    // Proxy should preserve original function name and properties
    expect(wrappedFn.name).toBe('myServerAction');
    expect((wrappedFn as any).customProp).toBe('value');
  });

  it('should propagate errors after capturing', async () => {
    const mockError = new Error('Test error');
    const mockServerFn = vi.fn().mockRejectedValue(mockError);
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({ setTransactionName: mockSetTransactionName });
    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn({ setStatus: vi.fn() }));

    const wrappedFn = wrapServerFunction('testFunction', mockServerFn);

    await expect(wrappedFn()).rejects.toBe(mockError);
  });
});
