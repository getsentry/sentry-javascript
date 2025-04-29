import { SDK_VERSION } from '@sentry/core';
import * as SentryNode from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init as nestInit } from '../src/sdk';

const nodeInit = vi.spyOn(SentryNode, 'init');
const PUBLIC_DSN = 'https://username@domain/123';

describe('Initialize Nest SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the correct metadata', () => {
    const client = nestInit({
      dsn: PUBLIC_DSN,
    });

    const expectedMetadata = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.nestjs',
          packages: [{ name: 'npm:@sentry/nestjs', version: SDK_VERSION }],
          version: SDK_VERSION,
        },
      },
    };

    expect(client).not.toBeUndefined();
    expect(nodeInit).toHaveBeenCalledTimes(1);
    expect(nodeInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
  });
});
