import type { CloudflareOptions } from '@sentry/cloudflare';
import { serveTunnelIntegration } from '@sentry/cloudflare';
import { wrapRequestHandler } from '@sentry/cloudflare/request';
import { getTunnelPath, SDK_VERSION } from '@sentry/core';
import type { NitroApp } from 'nitropack';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cloudflareEntryPlugin from '../../../src/runtime/plugins/cloudflare-entry.server';
import { sentryCloudflareNitroPlugin } from '../../../src/runtime/plugins/sentry-cloudflare.server';

vi.mock('@sentry/core', async () => ({
  ...(await vi.importActual<object>('@sentry/core')),
  consoleSandbox: (callback: () => void) => callback(),
}));

vi.mock('@sentry/cloudflare/request', () => ({
  wrapRequestHandler: vi.fn((_options: unknown, callback: () => unknown) => callback()),
}));

const DSN = 'https://public@dsn.ingest.sentry.io/1337';

const NUXT_SDK_METADATA = {
  optionsSetByUser: ['dsn'],
  sdk: {
    name: 'sentry.javascript.nuxt',
    packages: [
      { name: 'npm:@sentry/nuxt', version: SDK_VERSION },
      { name: 'npm:@sentry/cloudflare', version: SDK_VERSION },
    ],
    version: SDK_VERSION,
  },
};

async function handleRequest(
  options: CloudflareOptions,
  { path = '/api/db-mysql', method = 'GET', body }: { path?: string; method?: string; body?: string } = {},
): Promise<{ response: unknown; localFetch: ReturnType<typeof vi.fn> }> {
  const localFetch = vi.fn(() => new Response('app'));
  const nitroApp = { localFetch, hooks: { hook: vi.fn() } } as unknown as NitroApp;
  sentryCloudflareNitroPlugin(options)(nitroApp);

  const event = {
    protocol: 'https:',
    host: 'example.com',
    method,
    headers: body ? { 'content-length': String(body.length) } : {},
    body,
    context: { cf: {}, cloudflare: { context: { waitUntil: vi.fn(), passThroughOnException: vi.fn() } } },
  };
  const response = await nitroApp.localFetch(path, event as unknown as RequestInit);

  return { response, localFetch };
}

describe('sentryCloudflareNitroPlugin', () => {
  beforeEach(() => {
    vi.mocked(wrapRequestHandler).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { __SENTRY_NUXT_CLOUDFLARE_ENTRY_WRAPPED__?: boolean })
      .__SENTRY_NUXT_CLOUDFLARE_ENTRY_WRAPPED__;
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

  it('answers a managed tunnel request with the body Nitro read', async () => {
    const actual = await vi.importActual<{ wrapRequestHandler: typeof wrapRequestHandler }>(
      '@sentry/cloudflare/request',
    );
    vi.mocked(wrapRequestHandler).mockImplementationOnce(actual.wrapRequestHandler);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const envelope = `${JSON.stringify({ dsn: DSN })}\n${JSON.stringify({ type: 'event' })}\n{}`;

    const { response, localFetch } = await handleRequest(
      { dsn: DSN, integrations: [serveTunnelIntegration()] },
      { path: getTunnelPath(DSN), method: 'POST', body: envelope },
    );

    expect((response as Response).status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('dsn.ingest.sentry.io/api/1337/envelope/'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(localFetch).not.toHaveBeenCalled();
  });

  it('sets the Nuxt SDK metadata', async () => {
    await handleRequest({ dsn: DSN });

    expect(wrapRequestHandler).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ _metadata: NUXT_SDK_METADATA }) }),
      expect.any(Function),
    );
  });

  it('sets the Nuxt SDK metadata on Nitro v3', async () => {
    const nitroApp = { fetch: vi.fn(), hooks: { hook: vi.fn() } } as unknown as NitroApp & {
      fetch: (request: Request) => Promise<Response>;
    };
    sentryCloudflareNitroPlugin({ dsn: DSN })(nitroApp);

    const request = Object.assign(new Request('https://example.com/'), { runtime: { cloudflare: { context: {} } } });
    await nitroApp.fetch(request);

    expect(wrapRequestHandler).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ _metadata: NUXT_SDK_METADATA }) }),
      expect.any(Function),
    );
  });

  it('does not wrap an internal `$fetch` on Nitro v3, which has no Worker context', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('app')));
    const nitroApp = { fetch, hooks: { hook: vi.fn() } } as unknown as NitroApp & {
      fetch: (request: Request) => Promise<Response>;
    };
    sentryCloudflareNitroPlugin({ dsn: DSN })(nitroApp);

    const request = new Request('https://example.com/api/internal');
    await nitroApp.fetch(request);

    expect(fetch).toHaveBeenCalledWith(request);
    expect(wrapRequestHandler).not.toHaveBeenCalled();
  });

  it('does nothing after the Nitro plugin of the `instrument.server.ts` setup ran', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const localFetch = vi.fn();
    const hook = vi.fn();
    const nitroApp = { localFetch, hooks: { hook } } as unknown as NitroApp;

    cloudflareEntryPlugin({ hooks: { hook: vi.fn() } } as unknown as NitroApp);
    sentryCloudflareNitroPlugin({ dsn: DSN })(nitroApp);

    expect(nitroApp.localFetch).toBe(localFetch);
    expect(hook).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('`sentryCloudflareNitroPlugin` does nothing'));
  });
});
