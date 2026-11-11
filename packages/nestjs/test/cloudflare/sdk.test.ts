import { SDK_VERSION } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { defineCloudflareOptions } from '../../src/cloudflare/sdk';

vi.mock('@sentry/cloudflare', async () => ({
  ...(await vi.importActual('@sentry/cloudflare')),
  getDefaultIntegrations: vi.fn(() => [{ name: 'CloudflareDefault' }]),
}));

const PUBLIC_DSN = 'https://username@domain/123';

describe('defineCloudflareOptions', () => {
  it('has the correct metadata', () => {
    const options = defineCloudflareOptions({ dsn: PUBLIC_DSN })({});

    expect(options?._metadata).toEqual({
      sdk: {
        name: 'sentry.javascript.nestjs',
        packages: [
          { name: 'npm:@sentry/nestjs', version: SDK_VERSION },
          { name: 'npm:@sentry/cloudflare', version: SDK_VERSION },
        ],
        version: SDK_VERSION,
      },
    });
  });

  it('adds the Nest integration to the Cloudflare defaults', () => {
    const options = defineCloudflareOptions({ dsn: PUBLIC_DSN })({});

    expect(options?.defaultIntegrations).toEqual([
      expect.objectContaining({ name: 'Nest' }),
      { name: 'CloudflareDefault' },
    ]);
    expect(options?._extendsDefaultIntegrations).toBe(true);
  });

  it('passes env to an options callback', () => {
    const getOptions = defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({ dsn: env.SENTRY_DSN }));

    expect(getOptions({ SENTRY_DSN: PUBLIC_DSN })?.dsn).toBe(PUBLIC_DSN);
  });

  it('keeps user-provided default integrations', () => {
    const options = defineCloudflareOptions({ dsn: PUBLIC_DSN, defaultIntegrations: false })({});

    expect(options?.defaultIntegrations).toBe(false);
    expect(options?._extendsDefaultIntegrations).toBe(false);
  });

  it('returns undefined when the callback returns undefined', () => {
    expect(defineCloudflareOptions(() => undefined)({})).toBeUndefined();
  });
});
