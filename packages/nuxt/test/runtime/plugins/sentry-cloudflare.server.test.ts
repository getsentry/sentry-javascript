import type { CloudflareOptions } from '@sentry/cloudflare';
import { wrapRequestHandler } from '@sentry/cloudflare/request';
import type { NitroApp } from 'nitropack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryCloudflareNitroPlugin } from '../../../src/runtime/plugins/sentry-cloudflare.server';

vi.mock('@sentry/cloudflare/request', () => ({
  wrapRequestHandler: vi.fn((_options: unknown, callback: () => unknown) => callback()),
}));

const DSN = 'https://public@dsn.ingest.sentry.io/1337';

async function handleRequest(options: CloudflareOptions): Promise<void> {
  const nitroApp = { localFetch: vi.fn(), hooks: { hook: vi.fn() } } as unknown as NitroApp;
  sentryCloudflareNitroPlugin(options)(nitroApp);

  const event = {
    protocol: 'https:',
    host: 'example.com',
    method: 'GET',
    headers: {},
    context: { cf: {}, cloudflare: { context: {} } },
  };
  await nitroApp.localFetch('/api/db-mysql', event as unknown as RequestInit);
}

describe('sentryCloudflareNitroPlugin', () => {
  beforeEach(() => {
    vi.mocked(wrapRequestHandler).mockClear();
  });

  it('passes a defaultIntegrations list that extends the SDK defaults', async () => {
    await handleRequest({ dsn: DSN });

    expect(wrapRequestHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          defaultIntegrations: expect.any(Array),
          _extendsDefaultIntegrations: true,
        }),
      }),
      expect.any(Function),
    );
  });

  it('does not mark a defaultIntegrations list the user passed as extending the SDK defaults', async () => {
    await handleRequest({ dsn: DSN, defaultIntegrations: [] });

    expect(wrapRequestHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ defaultIntegrations: [], _extendsDefaultIntegrations: false }),
      }),
      expect.any(Function),
    );
  });
});
