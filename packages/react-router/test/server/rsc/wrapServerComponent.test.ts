import * as core from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapServerComponent } from '../../../src/server/rsc/wrapServerComponent';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    getIsolationScope: vi.fn(),
    getActiveSpan: vi.fn(),
    captureException: vi.fn(),
    flushIfServerless: vi.fn().mockResolvedValue(undefined),
    SPAN_STATUS_OK: 1,
    SPAN_STATUS_ERROR: 2,
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

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/users/:id',
      componentType: 'Page',
    });
    const result = wrappedComponent({ id: '123' });

    expect(result).toEqual(mockResult);
    expect(mockComponent).toHaveBeenCalledWith({ id: '123' });
    expect(mockSetTransactionName).toHaveBeenCalledWith('Page Server Component (/users/:id)');
  });

  it('should capture exceptions on sync error', () => {
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

  it('should capture exceptions on async rejection', async () => {
    const mockError = new Error('Async component failed');
    const mockComponent = vi.fn().mockRejectedValue(mockError);
    const mockSetStatus = vi.fn();
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.getActiveSpan as any).mockReturnValue({ setStatus: mockSetStatus });

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/async-page',
      componentType: 'Page',
    });

    const promise = wrappedComponent();
    await expect(promise).rejects.toThrow('Async component failed');

    expect(core.captureException).toHaveBeenCalledWith(mockError, {
      mechanism: {
        type: 'instrument',
        handled: false,
        data: {
          function: 'ServerComponent',
          component_route: '/async-page',
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

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/async-page',
      componentType: 'Page',
    });
    const result = await wrappedComponent();

    expect(result).toEqual(mockResult);
    expect(mockSetTransactionName).toHaveBeenCalledWith('Page Server Component (/async-page)');
  });

  it('should handle a thenable that ignores the error callback gracefully', () => {
    const thenableResult = {
      then: (_resolve: (value: unknown) => void) => {},
    };
    const mockComponent = vi.fn().mockReturnValue(thenableResult);
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/page',
      componentType: 'Page',
    });

    expect(() => wrappedComponent()).not.toThrow();
  });

  it('should flush on completion for async components', async () => {
    const mockResult = { type: 'div' };
    const mockComponent = vi.fn().mockResolvedValue(mockResult);
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/async-page',
      componentType: 'Page',
    });
    const result = wrappedComponent();

    // Wait for the promise to resolve so the .then() handler fires
    await result;
    // Allow microtask queue to flush
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should flush on completion for sync components', () => {
    const mockComponent = vi.fn().mockReturnValue({ type: 'div' });
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
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

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/page',
      componentType: 'Page',
    });

    expect((wrappedComponent as any).displayName).toBe('MyComponent');
    expect((wrappedComponent as any).customProp).toBe('value');
  });

  it('should not double-capture already-captured errors', () => {
    const mockError = new Error('Already captured error');
    Object.defineProperty(mockError, '__sentry_captured__', { value: true, enumerable: false });

    const mockComponent = vi.fn().mockImplementation(() => {
      throw mockError;
    });
    const mockSetStatus = vi.fn();
    const mockSetTransactionName = vi.fn();

    (core.getIsolationScope as any).mockReturnValue({
      setTransactionName: mockSetTransactionName,
    });
    (core.getActiveSpan as any).mockReturnValue({ setStatus: mockSetStatus });

    const wrappedComponent = wrapServerComponent(mockComponent, {
      componentRoute: '/page',
      componentType: 'Page',
    });

    expect(() => wrappedComponent()).toThrow('Already captured error');
    expect(core.captureException).not.toHaveBeenCalled();
  });
});
