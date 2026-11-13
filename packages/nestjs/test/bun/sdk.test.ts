import { SDK_VERSION } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/bun/sdk';

vi.mock('@sentry/bun', () => ({
  init: vi.fn(),
  getDefaultIntegrations: vi.fn(() => [{ name: 'BunDefault' }]),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const { init: bunInit } = await vi.importMock<typeof import('@sentry/bun')>('@sentry/bun');

const PUBLIC_DSN = 'https://username@domain/123';

describe('Initialize Nest SDK on Bun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the correct metadata', () => {
    init({ dsn: PUBLIC_DSN });

    expect(bunInit).toHaveBeenCalledTimes(1);
    expect(bunInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.nestjs',
            packages: [
              { name: 'npm:@sentry/nestjs', version: SDK_VERSION },
              { name: 'npm:@sentry/bun', version: SDK_VERSION },
            ],
            version: SDK_VERSION,
          },
        },
      }),
    );
  });

  it('adds the Nest integration to the Bun defaults', () => {
    init({ dsn: PUBLIC_DSN });

    expect(bunInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        defaultIntegrations: [expect.objectContaining({ name: 'Nest' }), { name: 'BunDefault' }],
      }),
    );
  });

  it('keeps user-provided default integrations', () => {
    init({ dsn: PUBLIC_DSN, defaultIntegrations: false });

    expect(bunInit).toHaveBeenLastCalledWith(expect.objectContaining({ defaultIntegrations: false }));
  });
});
