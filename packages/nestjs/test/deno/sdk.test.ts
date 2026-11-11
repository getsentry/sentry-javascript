import { SDK_VERSION } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/deno/sdk';

vi.mock('@sentry/deno', () => ({
  init: vi.fn(),
  getDefaultIntegrations: vi.fn(() => [{ name: 'DenoDefault' }]),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const { init: denoInit } = await vi.importMock<typeof import('@sentry/deno')>('@sentry/deno');

const PUBLIC_DSN = 'https://username@domain/123';

describe('Initialize Nest SDK on Deno', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has the correct metadata', () => {
    init({ dsn: PUBLIC_DSN });

    expect(denoInit).toHaveBeenCalledTimes(1);
    expect(denoInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.nestjs',
            packages: [
              { name: 'npm:@sentry/nestjs', version: SDK_VERSION },
              { name: 'npm:@sentry/deno', version: SDK_VERSION },
            ],
            version: SDK_VERSION,
          },
        },
      }),
    );
  });

  it('adds the Nest integration to the Deno defaults', () => {
    init({ dsn: PUBLIC_DSN });

    expect(denoInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        defaultIntegrations: [expect.objectContaining({ name: 'Nest' }), { name: 'DenoDefault' }],
      }),
    );
  });

  it('keeps user-provided default integrations', () => {
    init({ dsn: PUBLIC_DSN, defaultIntegrations: false });

    expect(denoInit).toHaveBeenLastCalledWith(expect.objectContaining({ defaultIntegrations: false }));
  });
});
