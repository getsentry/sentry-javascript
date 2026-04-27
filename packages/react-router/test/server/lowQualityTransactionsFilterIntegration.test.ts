import type { Client, ClientOptions } from '@sentry/core';
import { shouldIgnoreSpan } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { lowQualityTransactionsFilterIntegration } from '../../src/server/integration/lowQualityTransactionsFilterIntegration';

function makeMockClient(initial: Partial<ClientOptions> = {}): Client {
  const options = { ...initial } as ClientOptions;
  return { getOptions: () => options } as Client;
}

function setupIntegrationAndGetIgnoreSpans(initial: Partial<ClientOptions> = {}) {
  const integration = lowQualityTransactionsFilterIntegration({});
  const client = makeMockClient(initial);
  integration.beforeSetup!(client);
  return client.getOptions().ignoreSpans!;
}

describe('lowQualityTransactionsFilterIntegration', () => {
  it('appends the low-quality regexes to ignoreSpans', () => {
    expect(setupIntegrationAndGetIgnoreSpans()).toEqual([
      /GET \/node_modules\//,
      /GET \/favicon\.ico/,
      /GET \/@id\//,
      /GET \/__manifest\?/,
    ]);
  });

  it('preserves user-provided ignoreSpans entries', () => {
    expect(setupIntegrationAndGetIgnoreSpans({ ignoreSpans: [/keep-me/] })).toEqual([
      /keep-me/,
      /GET \/node_modules\//,
      /GET \/favicon\.ico/,
      /GET \/@id\//,
      /GET \/__manifest\?/,
    ]);
  });

  describe('drops low-quality transactions', () => {
    it.each([
      ['node_modules requests', 'GET /node_modules/some-package/index.js'],
      ['favicon.ico requests', 'GET /favicon.ico'],
      ['@id/ requests', 'GET /@id/some-id'],
      ['manifest requests', 'GET /__manifest?p=%2Fperformance%2Fserver-action'],
    ])('%s', (_label, name) => {
      const ignoreSpans = setupIntegrationAndGetIgnoreSpans();
      expect(shouldIgnoreSpan({ description: name, op: 'http.server' }, ignoreSpans)).toBe(true);
    });
  });

  describe('keeps high-quality transactions', () => {
    it.each([
      ['normal page requests', 'GET /api/users'],
      ['API endpoints', 'POST /data'],
      ['app routes', 'GET /projects/123'],
    ])('%s', (_label, name) => {
      const ignoreSpans = setupIntegrationAndGetIgnoreSpans();
      expect(shouldIgnoreSpan({ description: name, op: 'http.server' }, ignoreSpans)).toBe(false);
    });
  });
});
