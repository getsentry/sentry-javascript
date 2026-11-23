import { describe, expect, it } from 'vitest';
import { defineCloudflareOptions } from '../../../src/solid2/server/cloudflare';

function integrationNames(options: ReturnType<ReturnType<typeof defineCloudflareOptions>>): string[] | undefined {
  const defaultIntegrations = options?.defaultIntegrations;
  return Array.isArray(defaultIntegrations) ? defaultIntegrations.map(integration => integration.name) : undefined;
}

describe('defineCloudflareOptions', () => {
  it('adds the Solid server integrations to the Cloudflare default integrations', () => {
    const options = defineCloudflareOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337' })({});

    expect(integrationNames(options)).toEqual(expect.arrayContaining(['Dedupe', 'SolidServerErrors']));
    expect(options?._extendsDefaultIntegrations).toBe(true);
  });

  it('passes the env to an options callback', () => {
    const options = defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({ dsn: env.SENTRY_DSN }))({
      SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337',
    });

    expect(options?.dsn).toBe('https://public@dsn.ingest.sentry.io/1337');
    expect(integrationNames(options)).toContain('SolidServerErrors');
  });

  it('keeps default integrations the user turned off', () => {
    const options = defineCloudflareOptions({ defaultIntegrations: false })({});

    expect(options?.defaultIntegrations).toBe(false);
    expect(options?._extendsDefaultIntegrations).toBeUndefined();
  });

  it('returns no options when the callback returns none', () => {
    expect(defineCloudflareOptions(() => undefined)({})).toBeUndefined();
  });

  it('sets the Solid SDK metadata', () => {
    const options = defineCloudflareOptions({})({});

    expect(options?._metadata?.sdk?.name).toBe('sentry.javascript.solid');
    expect(options?._metadata?.sdk?.packages).toEqual([
      { name: 'npm:@sentry/solid', version: expect.any(String) },
      { name: 'npm:@sentry/cloudflare', version: expect.any(String) },
    ]);
  });
});
