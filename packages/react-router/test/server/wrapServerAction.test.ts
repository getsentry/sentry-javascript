import * as core from '@sentry/core';
import type { ActionFunctionArgs } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapServerAction } from '../../src/server/wrapServerAction';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn(),
    flushIfServerless: vi.fn(),
    debug: {
      warn: vi.fn(),
    },
  };
});

describe('wrapServerAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the global flag and warning state
    delete (globalThis as any).__sentryReactRouterServerInstrumentationUsed;
  });

  afterEach(() => {
    delete (globalThis as any).__sentryReactRouterServerInstrumentationUsed;
  });

  it('should wrap an action function with default options', async () => {
    const mockActionFn = vi.fn().mockResolvedValue('result');
    const mockArgs = { request: new Request('http://test.com') } as ActionFunctionArgs;

    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn());

    const wrappedAction = wrapServerAction({}, mockActionFn);
    await wrappedAction(mockArgs);

    expect(core.startSpan).toHaveBeenCalledWith(
      {
        name: 'Executing Server Action',
        attributes: {
          [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.action',
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.action',
        },
      },
      expect.any(Function),
    );
    expect(mockActionFn).toHaveBeenCalledWith(mockArgs);
    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should wrap an action function with custom options', async () => {
    const customOptions = {
      name: 'Custom Action',
      attributes: {
        'sentry.custom': 'value',
      },
    };

    const mockActionFn = vi.fn().mockResolvedValue('result');
    const mockArgs = { request: new Request('http://test.com') } as ActionFunctionArgs;

    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn());

    const wrappedAction = wrapServerAction(customOptions, mockActionFn);
    await wrappedAction(mockArgs);

    expect(core.startSpan).toHaveBeenCalledWith(
      {
        name: 'Custom Action',
        attributes: {
          [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.action',
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.action',
          'sentry.custom': 'value',
        },
      },
      expect.any(Function),
    );
    expect(mockActionFn).toHaveBeenCalledWith(mockArgs);
    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should call flushIfServerless on successful execution', async () => {
    const mockActionFn = vi.fn().mockResolvedValue('result');
    const mockArgs = { request: new Request('http://test.com') } as ActionFunctionArgs;

    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn());

    const wrappedAction = wrapServerAction({}, mockActionFn);
    await wrappedAction(mockArgs);

    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should call flushIfServerless even when action throws an error', async () => {
    const mockError = new Error('Action failed');
    const mockActionFn = vi.fn().mockRejectedValue(mockError);
    const mockArgs = { request: new Request('http://test.com') } as ActionFunctionArgs;

    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn());

    const wrappedAction = wrapServerAction({}, mockActionFn);

    await expect(wrappedAction(mockArgs)).rejects.toThrow('Action failed');
    expect(core.flushIfServerless).toHaveBeenCalled();
  });

  it('should propagate errors from action function', async () => {
    const mockError = new Error('Test error');
    const mockActionFn = vi.fn().mockRejectedValue(mockError);
    const mockArgs = { request: new Request('http://test.com') } as ActionFunctionArgs;

    (core.startSpan as any).mockImplementation((_: any, fn: any) => fn());

    const wrappedAction = wrapServerAction({}, mockActionFn);

    await expect(wrappedAction(mockArgs)).rejects.toBe(mockError);
  });

  it('should skip span creation and warn when instrumentation API is used', async () => {
    // Reset modules to get a fresh copy with unset warning flag
    vi.resetModules();
    // @ts-expect-error - Dynamic import for module reset works at runtime but vitest's typecheck doesn't fully support it
    const { wrapServerAction: freshWrapServerAction } = await import('../../src/server/wrapServerAction');

    // Set the global flag indicating instrumentation API is in use
    (globalThis as any).__sentryReactRouterServerInstrumentationUsed = true;

    const mockActionFn = vi.fn().mockResolvedValue('result');
    const mockArgs = { request: new Request('http://test.com') } as ActionFunctionArgs;

    const wrappedAction = freshWrapServerAction({}, mockActionFn);

    // Call multiple times
    await wrappedAction(mockArgs);
    await wrappedAction(mockArgs);
    await wrappedAction(mockArgs);

    // Should warn about redundant wrapper via debug.warn, but only once
    expect(core.debug.warn).toHaveBeenCalledTimes(1);
    expect(core.debug.warn).toHaveBeenCalledWith(
      expect.stringContaining('wrapServerAction is redundant when using the instrumentation API'),
    );

    // Should not create spans (instrumentation API handles it)
    expect(core.startSpan).not.toHaveBeenCalled();

    // Should still execute the action function
    expect(mockActionFn).toHaveBeenCalledTimes(3);
  });
});
