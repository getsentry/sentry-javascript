import { describe, expect, test, vi } from 'vitest';

import * as SentryCore from '@sentry/core';
import { init } from '../src/sdk';

describe('init', () => {
  test('should call initAndBind with the correct options', () => {
    const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind');
    init({});

    expect(initAndBindSpy).toHaveBeenCalledWith(expect.any(Function), expect.any(Object));
  });
});
