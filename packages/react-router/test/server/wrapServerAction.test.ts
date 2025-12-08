import * as core from '@sentry/core';
import type { ActionFunctionArgs } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapServerAction } from '../../src/server/wrapServerAction';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    startSpan: vi.fn(),
    flushIfServerless: vi.fn(),
  };
});

describe('wrapServerAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.action',
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
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.action',
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
});
