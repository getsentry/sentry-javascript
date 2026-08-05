import * as sentryCore from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCallingMethodName } from '../../src/utils/callingMethod';

describe('getCallingMethodName', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the code.function.name declared by the enclosing active span', () => {
    vi.spyOn(sentryCore, 'getActiveSpan').mockReturnValue({} as any);
    vi.spyOn(sentryCore, 'spanToJSON').mockReturnValue({ data: { 'code.function.name': 'greet' } } as any);

    expect(getCallingMethodName()).toBe('greet');
  });

  it('returns undefined when there is no active span', () => {
    vi.spyOn(sentryCore, 'getActiveSpan').mockReturnValue(undefined);

    expect(getCallingMethodName()).toBeUndefined();
  });

  it('returns undefined when the enclosing span declares no function name (e.g. a DO fetch handler)', () => {
    vi.spyOn(sentryCore, 'getActiveSpan').mockReturnValue({} as any);
    vi.spyOn(sentryCore, 'spanToJSON').mockReturnValue({
      description: 'GET /agents/my-agent/user-123',
      op: 'http.server',
    } as any);

    expect(getCallingMethodName()).toBeUndefined();
  });

  it('returns undefined when the enclosing span is a user-created span without a function name', () => {
    vi.spyOn(sentryCore, 'getActiveSpan').mockReturnValue({} as any);
    vi.spyOn(sentryCore, 'spanToJSON').mockReturnValue({ description: 'task-1', op: 'task', data: {} } as any);

    expect(getCallingMethodName()).toBeUndefined();
  });
});
