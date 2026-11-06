import { CloudflareClient, SDK_VERSION } from '@sentry/cloudflare';
import { getMainCarrier } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { init, setBindingsGetter } from '../../src/worker/sdk';

describe('Sentry worker SDK', () => {
  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    setBindingsGetter(undefined);
  });

  it('initializes a Cloudflare client with Astro metadata', () => {
    const client = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', cacheClient: false });

    expect(client).toBeInstanceOf(CloudflareClient);
    expect(client?.getOptions()._metadata?.sdk).toEqual({
      name: 'sentry.javascript.astro',
      version: SDK_VERSION,
      packages: [
        { name: 'npm:@sentry/astro', version: SDK_VERSION },
        { name: 'npm:@sentry/cloudflare', version: SDK_VERSION },
      ],
    });
  });

  it('fills options the user left unset from the bindings', () => {
    setBindingsGetter(() => ({
      SENTRY_DSN: 'https://binding@dsn.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: 'from-binding',
    }));

    const client = init({ environment: 'from-options', cacheClient: false });

    expect(client?.getOptions()).toMatchObject({
      dsn: 'https://binding@dsn.ingest.sentry.io/1',
      environment: 'from-options',
    });
  });

  it('keeps the DSN the user passed over the binding', () => {
    setBindingsGetter(() => ({ SENTRY_DSN: 'https://binding@dsn.ingest.sentry.io/1' }));

    const client = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', cacheClient: false });

    expect(client?.getOptions().dsn).toBe('https://public@dsn.ingest.sentry.io/1337');
  });
});
