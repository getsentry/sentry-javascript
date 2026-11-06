import { CloudflareClient, SDK_VERSION } from '@sentry/cloudflare';
import { getMainCarrier } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { init } from '../../src/worker/sdk';

describe('Sentry worker SDK', () => {
  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('initializes a Cloudflare client with Astro metadata', () => {
    const client = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

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
});
