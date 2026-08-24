import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sentryCloudflareNitroPlugin } from '../../../src/runtime/plugins/cloudflare';

const mocks = vi.hoisted(() => ({
  wrapRequestHandler: vi.fn((_wrapperOptions: unknown, handler: () => unknown) => handler()),
  setAsyncLocalStorageAsyncContextStrategy: vi.fn(),
  getDefaultIntegrations: vi.fn(() => [{ name: 'CloudflareDefault' }]),
}));

vi.mock('@sentry/cloudflare', () => ({
  getDefaultIntegrations: mocks.getDefaultIntegrations,
  setAsyncLocalStorageAsyncContextStrategy: mocks.setAsyncLocalStorageAsyncContextStrategy,
}));

vi.mock('@sentry/cloudflare/request', () => ({
  wrapRequestHandler: mocks.wrapRequestHandler,
}));

const executionContext = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

function createNitroApp(): any {
  return {
    fetch: vi.fn(() => new Response('ok')),
    hooks: { hook: vi.fn() },
  };
}

function createCloudflareRequest(url = 'https://example.com/'): Request {
  return Object.assign(new Request(url), {
    runtime: { name: 'cloudflare', cloudflare: { context: executionContext, env: {} } },
  });
}

describe('sentryCloudflareNitroPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes requests carrying a Cloudflare execution context through `wrapRequestHandler`', async () => {
    const nitroApp = createNitroApp();
    const innerFetch = nitroApp.fetch;

    sentryCloudflareNitroPlugin({ dsn: 'https://public@example.ingest.sentry.io/1' })(nitroApp);
    const request = createCloudflareRequest();
    await nitroApp.fetch(request);

    expect(mocks.wrapRequestHandler).toHaveBeenCalledTimes(1);
    expect(mocks.wrapRequestHandler.mock.calls[0]![0]).toMatchObject({ request, context: executionContext });
    expect(innerFetch).toHaveBeenCalledWith(request);
  });

  // Without an execution context there is nothing to hang the flush on, which is the case in
  // `nitro dev` and on every non-Workers preset.
  it('passes the request through untouched and warns once when there is no execution context', async () => {
    // A fresh module instance, so the one-shot warning flag does not depend on test order.
    vi.resetModules();
    const { sentryCloudflareNitroPlugin: freshPlugin } = await import('../../../src/runtime/plugins/cloudflare');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nitroApp = createNitroApp();
    const innerFetch = nitroApp.fetch;

    freshPlugin({ dsn: 'https://public@example.ingest.sentry.io/1' })(nitroApp);
    const request = new Request('https://example.com/');
    await nitroApp.fetch(request);
    await nitroApp.fetch(new Request('https://example.com/second'));

    expect(mocks.wrapRequestHandler).not.toHaveBeenCalled();
    expect(innerFetch).toHaveBeenCalledWith(request);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('No Cloudflare execution context');
    warnSpy.mockRestore();
  });

  it('registers the error hook and defers the async context strategy to the first instrumented request', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nitroApp = createNitroApp();

    sentryCloudflareNitroPlugin({ dsn: 'https://public@example.ingest.sentry.io/1' })(nitroApp);

    expect(nitroApp.hooks.hook).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mocks.setAsyncLocalStorageAsyncContextStrategy).not.toHaveBeenCalled();

    await nitroApp.fetch(new Request('https://example.com/'));
    expect(mocks.setAsyncLocalStorageAsyncContextStrategy).not.toHaveBeenCalled();

    await nitroApp.fetch(createCloudflareRequest());
    expect(mocks.setAsyncLocalStorageAsyncContextStrategy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('accepts a function so options can be read once the app exists', async () => {
    const nitroApp = createNitroApp();
    const optionsFn = vi.fn(() => ({ dsn: 'https://public@example.ingest.sentry.io/2' }));

    sentryCloudflareNitroPlugin(optionsFn)(nitroApp);
    await nitroApp.fetch(createCloudflareRequest());

    expect(optionsFn).toHaveBeenCalledWith(nitroApp);
    expect(mocks.wrapRequestHandler.mock.calls[0]![0]).toMatchObject({
      options: { dsn: 'https://public@example.ingest.sentry.io/2' },
    });
  });

  it('re-reads the options on every request, so request-scoped bindings are picked up', async () => {
    const nitroApp = createNitroApp();
    const dsns = [
      'https://public@example.ingest.sentry.io/1',
      'https://public@example.ingest.sentry.io/2',
      'https://public@example.ingest.sentry.io/3',
    ];
    const optionsFn = vi.fn(() => ({ dsn: dsns[optionsFn.mock.calls.length - 1] }));

    sentryCloudflareNitroPlugin(optionsFn)(nitroApp);

    expect(optionsFn).not.toHaveBeenCalled();

    await nitroApp.fetch(createCloudflareRequest());
    await nitroApp.fetch(createCloudflareRequest());
    await nitroApp.fetch(createCloudflareRequest());

    expect(optionsFn).toHaveBeenCalledTimes(3);
    expect(mocks.wrapRequestHandler.mock.calls.map(call => (call[0] as any).options.dsn)).toEqual(dsns);
  });

  it('does not read the options for a request it does not instrument', async () => {
    const nitroApp = createNitroApp();
    const optionsFn = vi.fn(() => ({ dsn: 'https://public@example.ingest.sentry.io/1' }));

    sentryCloudflareNitroPlugin(optionsFn)(nitroApp);
    await nitroApp.fetch(new Request('https://example.com/'));

    expect(optionsFn).not.toHaveBeenCalled();
  });

  it('defaults to the `nodejs_compat` integrations but lets explicit options win', async () => {
    const nitroApp = createNitroApp();

    sentryCloudflareNitroPlugin({ dsn: 'https://public@example.ingest.sentry.io/1' })(nitroApp);
    await nitroApp.fetch(createCloudflareRequest());

    expect((mocks.wrapRequestHandler.mock.calls[0]![0] as any).options.defaultIntegrations).toEqual([
      { name: 'CloudflareDefault' },
    ]);

    vi.clearAllMocks();
    const otherApp = createNitroApp();
    sentryCloudflareNitroPlugin({ dsn: 'https://public@example.ingest.sentry.io/1', defaultIntegrations: false })(
      otherApp,
    );
    await otherApp.fetch(createCloudflareRequest());

    expect((mocks.wrapRequestHandler.mock.calls[0]![0] as any).options.defaultIntegrations).toBe(false);
  });
});

// See #22519 for the same class of bug reached through a barrel re-export.
describe('the `@sentry/nitro/cloudflare` module graph', () => {
  const SRC_DIR = resolve(__dirname, '../../../src');
  const IMPORT_SPECIFIER_REGEX = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;

  function resolveRelativeImport(importer: string, specifier: string): string {
    const withoutExtension = join(dirname(importer), specifier);
    const candidates = [`${withoutExtension}.ts`, join(withoutExtension, 'index.ts')];
    const resolved = candidates.find(candidate => existsSync(candidate));

    if (!resolved) {
      throw new Error(`Could not resolve '${specifier}' imported from '${relative(SRC_DIR, importer)}'`);
    }

    return resolved;
  }

  it('never reaches `@sentry/node`', () => {
    const seen = new Set<string>();
    const offenders: string[] = [];
    const queue = [join(SRC_DIR, 'cloudflare/index.ts')];

    while (queue.length) {
      const file = queue.pop() as string;

      if (seen.has(file)) {
        continue;
      }
      seen.add(file);

      for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER_REGEX)) {
        const specifier = match[1] ?? (match[2] as string);

        if (specifier === '@sentry/node' || specifier.startsWith('@sentry/node/')) {
          offenders.push(relative(SRC_DIR, file));
        }
        if (specifier.startsWith('.')) {
          queue.push(resolveRelativeImport(file, specifier));
        }
      }
    }

    expect(seen.size).toBeGreaterThan(1);
    expect(offenders).toEqual([]);
  });
});
