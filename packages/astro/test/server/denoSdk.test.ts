import type { Integration } from '@sentry/core';
import { getMainCarrier } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { init } from '../../src/index.deno';

const originalVersions = Object.getOwnPropertyDescriptor(process, 'versions')!;

// Without a DSN, the client does not set up its integrations, so these tests do not patch `node:http`.
describe('Deno init()', () => {
  afterEach(() => {
    Object.defineProperty(process, 'versions', originalVersions);
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('reports Deno as the runtime', () => {
    Object.defineProperty(process, 'versions', { ...originalVersions, value: { ...process.versions, deno: '2.9.0' } });

    const client = init({});

    expect(client?.getOptions().runtime).toEqual({ name: 'deno', version: '2.9.0' });
  });

  it('inits the Astro SDK', () => {
    const client = init({});

    expect(client?.getOptions()._metadata?.sdk?.name).toBe('sentry.javascript.astro');
  });

  it('replaces the undici fetch integration with the fetch integration of Deno', () => {
    const client = init({});

    expect(
      client
        ?.getOptions()
        .integrations.map(integration => integration.name)
        .filter(name => ['NodeFetch', 'Fetch'].includes(name)),
    ).toEqual(['Fetch']);
  });

  it('adds the integrations that the user passes as an array', () => {
    const userIntegration: Integration = { name: 'UserIntegration' };

    const client = init({ integrations: [userIntegration] });

    expect(
      client
        ?.getOptions()
        .integrations.map(integration => integration.name)
        .filter(name => ['NodeFetch', 'Fetch', 'UserIntegration'].includes(name)),
    ).toEqual(['Fetch', 'UserIntegration']);
  });

  it('passes the Deno integrations to an integrations function of the user', () => {
    const client = init({
      integrations: integrations => integrations.filter(integration => integration.name !== 'Fetch'),
    });

    expect(
      client
        ?.getOptions()
        .integrations.map(integration => integration.name)
        .filter(name => ['NodeFetch', 'Fetch'].includes(name)),
    ).toEqual([]);
  });

  it('does not report the Deno runtime and integrations as set by the user', () => {
    const client = init({ integrations: integrations => integrations });

    expect(client?.getSdkMetadata()?.optionsSetByUser).toEqual(['integrations']);
    expect(client?.getSdkMetadata()?.integrationsSetByUser).toEqual([]);
  });
});
