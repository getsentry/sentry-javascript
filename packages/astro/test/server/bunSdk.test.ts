import type { Integration } from '@sentry/core';
import { getMainCarrier } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { init } from '../../src/index.bun';

const originalVersions = Object.getOwnPropertyDescriptor(process, 'versions')!;

// Without a DSN, the client does not set up its integrations, so these tests do not patch `node:http`.
describe('Bun init()', () => {
  afterEach(() => {
    Object.defineProperty(process, 'versions', originalVersions);
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('reports Bun as the runtime', () => {
    Object.defineProperty(process, 'versions', { ...originalVersions, value: { ...process.versions, bun: '1.4.5' } });

    const client = init({});

    expect(client?.getOptions().runtime).toEqual({ name: 'bun', version: '1.4.5' });
  });

  it('inits the Astro SDK', () => {
    const client = init({});

    expect(client?.getOptions()._metadata?.sdk?.name).toBe('sentry.javascript.astro');
  });

  it('replaces the undici fetch integration with the fetch and HTTP server integrations of Bun', () => {
    const client = init({});

    expect(
      client
        ?.getOptions()
        .integrations.map(integration => integration.name)
        .filter(name => ['NodeFetch', 'Fetch', 'BunHttpServer'].includes(name)),
    ).toEqual(['Fetch', 'BunHttpServer']);
  });

  it('adds the integrations that the user passes as an array', () => {
    const userIntegration: Integration = { name: 'UserIntegration' };

    const client = init({ integrations: [userIntegration] });

    expect(
      client
        ?.getOptions()
        .integrations.map(integration => integration.name)
        .filter(name => ['NodeFetch', 'Fetch', 'BunHttpServer', 'UserIntegration'].includes(name)),
    ).toEqual(['Fetch', 'BunHttpServer', 'UserIntegration']);
  });

  it('passes the Bun integrations to an integrations function of the user', () => {
    const client = init({
      integrations: integrations => integrations.filter(integration => integration.name !== 'BunHttpServer'),
    });

    expect(
      client
        ?.getOptions()
        .integrations.map(integration => integration.name)
        .filter(name => ['NodeFetch', 'Fetch', 'BunHttpServer'].includes(name)),
    ).toEqual(['Fetch']);
  });

  it('does not report the Bun runtime and integrations as set by the user', () => {
    const client = init({ integrations: integrations => integrations });

    expect(client?.getSdkMetadata()?.optionsSetByUser).toEqual(['integrations']);
    expect(client?.getSdkMetadata()?.integrationsSetByUser).toEqual([]);
  });
});
