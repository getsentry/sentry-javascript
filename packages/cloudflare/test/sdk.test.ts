import { describe, expect, test, vi } from 'vitest';

import * as SentryCore from '@sentry/core';
import { CloudflareClient } from '../src/client';
import { init } from '../src/sdk';

describe('init', () => {
  test('should call initAndBind with the correct options', () => {
    const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind');
    const client = init({});

    expect(initAndBindSpy).toHaveBeenCalledWith(CloudflareClient, expect.any(Object));

    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(CloudflareClient);
  });
});
