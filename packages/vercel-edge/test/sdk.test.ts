import { describe, expect, it, vi } from 'vitest';

import * as SentryCore from '@sentry/core';
import { init } from '../src/sdk';

describe('init', () => {
  it('initializes and returns client', () => {
    const initSpy = vi.spyOn(SentryCore, 'initAndBind');

    expect(init({})).not.toBeUndefined();
    expect(initSpy).toHaveBeenCalledTimes(1);
  });
});
