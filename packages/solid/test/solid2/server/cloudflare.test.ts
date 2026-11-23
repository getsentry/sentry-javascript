import { type CloudflareOptions, getDefaultIntegrations } from '@sentry/cloudflare';
import { getIntegrationsToSetup } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { defineCloudflareOptions } from '../../../src/solid2/cloudflare';
import { solidServerErrorsIntegration } from '../../../src/solid2/server/errors';

// Resolves the integrations the way the Cloudflare SDK does at `init`.
function setupIntegrationNames(options: CloudflareOptions | undefined): string[] {
  const opts = { ...options };
  if (opts.defaultIntegrations === undefined) {
    opts.defaultIntegrations = getDefaultIntegrations(opts);
  }
  return getIntegrationsToSetup(opts).map(integration => integration.name);
}

describe('defineCloudflareOptions', () => {
  it('adds the Solid server integrations to the Cloudflare default integrations', () => {
    const options = defineCloudflareOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337' })({});

    expect(options?.defaultIntegrations).toBeUndefined();
    expect(setupIntegrationNames(options)).toEqual(expect.arrayContaining(['Dedupe', 'SolidServerErrors']));
  });

  it('builds the defaults from options changed after the options are defined', () => {
    const options = defineCloudflareOptions({})({});

    // `instrumentWorkflowWithSentry` turns off Dedupe right before `init`.
    const names = setupIntegrationNames({ ...options, enableDedupe: false });

    expect(names).not.toContain('Dedupe');
    expect(names).toContain('SolidServerErrors');
  });

  it('keeps the integrations the user adds', () => {
    const options = defineCloudflareOptions({ integrations: [{ name: 'Custom' }] })({});

    expect(setupIntegrationNames(options)).toEqual(expect.arrayContaining(['SolidServerErrors', 'Custom']));
  });

  it('passes the defaults with Solid integrations to an integrations callback', () => {
    const options = defineCloudflareOptions({
      integrations: defaults => defaults.filter(integration => integration.name !== 'SolidServerErrors'),
    })({});

    expect(setupIntegrationNames(options)).not.toContain('SolidServerErrors');
  });

  it('does not add the Solid integrations when the user turned off the default integrations', () => {
    const options = defineCloudflareOptions({ defaultIntegrations: false })({});

    expect(setupIntegrationNames(options)).toEqual([]);
  });

  it('keeps a single instance when the user also adds the Solid integration', () => {
    const options = defineCloudflareOptions({ integrations: [solidServerErrorsIntegration()] })({});

    expect(setupIntegrationNames(options).filter(name => name === 'SolidServerErrors')).toHaveLength(1);
  });

  it('does not report the Solid integrations as set by the user', () => {
    const fromArray = defineCloudflareOptions({ integrations: [{ name: 'Custom' }] })({});
    const fromCallback = defineCloudflareOptions({
      integrations: defaults => [...defaults, { name: 'Custom' }],
    })({});
    setupIntegrationNames(fromCallback);

    expect(fromArray?._metadata?.integrationsSetByUser).toEqual(['Custom']);
    expect(fromCallback?._metadata?.integrationsSetByUser).toEqual(['Custom']);
  });

  it('passes the env to an options callback', () => {
    const options = defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({ dsn: env.SENTRY_DSN }))({
      SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337',
    });

    expect(options?.dsn).toBe('https://public@dsn.ingest.sentry.io/1337');
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
