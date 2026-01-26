import * as core from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isServerComponentContext, wrapServerComponent } from '../../../src/server/rsc/wrapServerComponent';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    getIsolationScope: vi.fn(),
    getActiveSpan: vi.fn(),
    handleCallbackErrors: vi.fn(),
    captureException: vi.fn(),
    flushIfServerless: vi.fn().mockResolvedValue(undefined),
    SPAN_STATUS_OK: { code: 1, message: 'ok' },
    SPAN_STATUS_ERROR: { code: 2, message: 'internal_error' },
  };
});

describe('wrapServerComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should wrap a server component and execute it', () => {
    const mockResult = { type: 'div' };
    const mockComponent = vi.fn().mockReturnValue(mockResult);
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.handleCallbackErrors as any).mockImplementation((fn: any) => fn());

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/users/:id',
      componentType: 'Page',
    });
    const result = wrappedComponent({ id: '123' });

    expect(result).toEqual(mockResult);
    expect(mockComponent).toHaveBeenCalledWith({ id: '123' });
    expect(mockSetTransactionName).toHaveBeenCalledWith('Page Server Component (/users/:id)');
  });

  it('should capture exceptions on error', () => {
    const mockError = new Error('Component render failed');
    const mockComponent = vi.fn().mockImplementation(() => {
      throw mockError;
    });
    const mockSetStatus = vi.fn();
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.getActiveSpan as any).mockReturnValue({ setStatus: mockSetStatus });
    (core.handleCallbackErrors as any).mockImplementation((fn: any, errorHandler: any, finallyHandler: any) => {
      try {
        return fn();
      } catch (error) {
        errorHandler(error);
        throw error;
      } finally {
        finallyHandler?.();
      }
    });

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/users/:id',
      componentType: 'Page',
    });

    expect(() => wrappedComponent()).toThrow('Component render failed');
    expect(mockSetStatus).toHaveBeenCalledWith({ code: core.SPAN_STATUS_ERROR, message: 'internal_error' });
    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: {
        type: 'instrument',
        handled: false,
        data: {
          function: 'ServerComponent',
          component_route: '/users/:id',
          component_type: 'Page',
        },
      },
    });
  });

  it('should not capture redirect responses as errors', () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: '/new-path' },
    });
    const mockComponent = vi.fn().mockImplementation(() => {
      throw redirectResponse;
    });
    const mockSetStatus = vi.fn();
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.getActiveSpan as any).mockReturnValue({ setStatus: mockSetStatus });
    (core.handleCallbackErrors as any).mockImplementation((fn: any, errorHandler: any, finallyHandler: any) => {
      try {
        return fn();
      } catch (error) {
        errorHandler(error);
        throw error;
      } finally {
        finallyHandler?.();
      }
    });

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/users/:id',
      componentType: 'Page',
    });

    expect(() => wrappedComponent()).toThrow();
    expect(mockSetStatus).toHaveBeenCalledWith({ code: core.SPAN_STATUS_OK });
    expect(core.captureException).not.toHaveBeenCalled();
  });

  it('should not capture 404 responses as errors but mark span status', () => {
    const notFoundResponse = new Response(null, { status: 404 });
    const mockComponent = vi.fn().mockImplementation(() => {
      throw notFoundResponse;
    });
    const mockSetStatus = vi.fn();
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.getActiveSpan as any).mockReturnValue({ setStatus: mockSetStatus });
    (core.handleCallbackErrors as any).mockImplementation((fn: any, errorHandler: any, finallyHandler: any) => {
      try {
        return fn();
      } catch (error) {
        errorHandler(error);
        throw error;
      } finally {
        finallyHandler?.();
      }
    });

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/users/:id',
      componentType: 'Page',
    });

    expect(() => wrappedComponent()).toThrow();
    expect(mockSetStatus).toHaveBeenCalledWith({ code: core.SPAN_STATUS_ERROR, message: 'not_found' });
    expect(core.captureException).not.toHaveBeenCalled();
  });

  it('should handle redirect-like objects with type property', () => {
    const redirectObj = { type: 'redirect', location: '/new-path' };
    const mockComponent = vi.fn().mockImplementation(() => {
      throw redirectObj;
    });
    const mockSetStatus = vi.fn();
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.getActiveSpan as any).mockReturnValue({ setStatus: mockSetStatus });
    (core.handleCallbackErrors as any).mockImplementation((fn: any, errorHandler: any, finallyHandler: any) => {
      try {
        return fn();
      } catch (error) {
        errorHandler(error);
        throw error;
      } finally {
        finallyHandler?.();
      }
    });

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/users/:id',
      componentType: 'Layout',
    });

    expect(() => wrappedComponent()).toThrow();
    expect(mockSetStatus).toHaveBeenCalledWith({ code: core.SPAN_STATUS_OK });
    expect(core.captureException).not.toHaveBeenCalled();
  });

  it('should handle not-found objects with type property', () => {
    const notFoundObj = { type: 'not-found' };
    const mockComponent = vi.fn().mockImplementation(() => {
      throw notFoundObj;
    });
    const mockSetStatus = vi.fn();
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.getActiveSpan as any).mockReturnValue({ setStatus: mockSetStatus });
    (core.handleCallbackErrors as any).mockImplementation((fn: any, errorHandler: any, finallyHandler: any) => {
      try {
        return fn();
      } catch (error) {
        errorHandler(error);
        throw error;
      } finally {
        finallyHandler?.();
      }
    });

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/users/:id',
      componentType: 'Page',
    });

    expect(() => wrappedComponent()).toThrow();
    expect(mockSetStatus).toHaveBeenCalledWith({ code: core.SPAN_STATUS_ERROR, message: 'not_found' });
    expect(core.captureException).not.toHaveBeenCalled();
  });

  it('should work with async server components', async () => {
    const mockResult = { type: 'div', props: { children: 'async content' } };
    const mockComponent = vi.fn().mockResolvedValue(mockResult);
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.handleCallbackErrors as any).mockImplementation((fn: any) => fn());

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/async-page',
      componentType: 'Page',
    });
    const result = await wrappedComponent();

    expect(result).toEqual(mockResult);
    expect(mockSetTransactionName).toHaveBeenCalledWith('Page Server Component (/async-page)');
  });

  it('should flush on completion for serverless environments', () => {
    const mockComponent = vi.fn().mockReturnValue({ type: 'div' });
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.handleCallbackErrors as any).mockImplementation((fn: any, _: any, finallyHandler: any) => {
      const result = fn();
      finallyHandler?.();
      return result;
    });

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/page',
      componentType: 'Page',
    });
    wrappedComponent();

    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should handle span being undefined', () => {
    const mockError = new Error('Component error');
    const mockComponent = vi.fn().mockImplementation(() => {
      throw mockError;
    });
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.getActiveSpan as any).mockReturnValue(undefined);
    (core.handleCallbackErrors as any).mockImplementation((fn: any, errorHandler: any, finallyHandler: any) => {
      try {
        return fn();
      } catch (error) {
        errorHandler(error);
        throw error;
      } finally {
        finallyHandler?.();
      }
    });

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/page',
      componentType: 'Page',
    });

    expect(() => wrappedComponent()).toThrow('Component error');
    expect(core.captureException).toHaveBeenCalled();
  });

  it('should preserve function properties via Proxy', () => {
    const mockComponent = Object.assign(vi.fn().mockReturnValue({ type: 'div' }), {
      displayName: 'MyComponent',
      customProp: 'value',
    });
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.handleCallbackErrors as any).mockImplementation((fn: any) => fn());

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/page',
      componentType: 'Page',
    });

    // Proxy should preserve properties
    expect((wrappedComponent as any).displayName).toBe('MyComponent');
    expect((wrappedComponent as any).customProp).toBe('value');
  });
});

describe('isServerComponentContext', () => {
  it('should return true for valid context', () => {
    expect(
      isServerComponentContext({
        componentRoute: '/users/:id',
        componentType: 'Page',
      }),
    ).toBe(true);
  });

  it('should return false for null', () => {
    expect(isServerComponentContext(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isServerComponentContext(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isServerComponentContext('string')).toBe(false);
    expect(isServerComponentContext(123)).toBe(false);
  });

  it('should return false for missing componentRoute', () => {
    expect(
      isServerComponentContext({
        componentType: 'Page',
      }),
    ).toBe(false);
  });

  it('should return false for missing componentType', () => {
    expect(
      isServerComponentContext({
        componentRoute: '/users/:id',
      }),
    ).toBe(false);
  });

  it('should return false for non-string componentRoute', () => {
    expect(
      isServerComponentContext({
        componentRoute: 123,
        componentType: 'Page',
      }),
    ).toBe(false);
  });

  it('should return false for non-string componentType', () => {
    expect(
      isServerComponentContext({
        componentRoute: '/users/:id',
        componentType: 123,
      }),
    ).toBe(false);
  });

  it('should return false for empty componentRoute', () => {
    expect(
      isServerComponentContext({
        componentRoute: '',
        componentType: 'Page',
      }),
    ).toBe(false);
  });

  it('should return false for invalid componentType not in VALID_COMPONENT_TYPES', () => {
    expect(
      isServerComponentContext({
        componentRoute: '/users/:id',
        componentType: 'InvalidType',
      }),
    ).toBe(false);
  });
});
