import * as core from '@sentry/core';
import type { ActionFunctionArgs } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapServerAction } from '../../src/server/wrapServerAction';

describe('wrapServerAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should wrap an action function with default options', async () => {
    const mockActionFn = vi.fn().mockResolvedValue('result');
    const mockArgs = { request: new Request('http://test.com') } as ActionFunctionArgs;

    const spy = vi.spyOn(core, 'startSpan');
    const wrappedAction = wrapServerAction({}, mockActionFn);
    await wrappedAction(mockArgs);

    expect(spy).toHaveBeenCalledWith(
      {
        name: 'Executing Server Action',
        attributes: {
          [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react-router',
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.action',
        },
      },
      expect.any(Function),
    );
    expect(mockActionFn).toHaveBeenCalledWith(mockArgs);
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

    const spy = vi.spyOn(core, 'startSpan');
    const wrappedAction = wrapServerAction(customOptions, mockActionFn);
    await wrappedAction(mockArgs);

    expect(spy).toHaveBeenCalledWith(
      {
        name: 'Custom Action',
        attributes: {
          [core.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react-router',
          [core.SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.action',
          'sentry.custom': 'value',
        },
      },
      expect.any(Function),
    );
    expect(mockActionFn).toHaveBeenCalledWith(mockArgs);
  });
});
