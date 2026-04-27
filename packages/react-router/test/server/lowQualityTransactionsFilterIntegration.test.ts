import type { Client, ClientOptions } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { lowQualityTransactionsFilterIntegration } from '../../src/server/integration/lowQualityTransactionsFilterIntegration';

function makeMockClient(initial: Partial<ClientOptions> = {}): Client {
  const options = { ...initial } as ClientOptions;
  return { getOptions: () => options } as Client;
}

describe('lowQualityTransactionsFilterIntegration', () => {
  it('appends the low-quality regexes to ignoreSpans', () => {
    const integration = lowQualityTransactionsFilterIntegration({});
    const client = makeMockClient();

    integration.beforeSetup!(client);

    expect(client.getOptions().ignoreSpans).toEqual([
      /GET \/node_modules\//,
      /GET \/favicon\.ico/,
      /GET \/@id\//,
      /GET \/__manifest\?/,
    ]);
  });

  it('preserves user-provided ignoreSpans entries', () => {
    const integration = lowQualityTransactionsFilterIntegration({});
    const client = makeMockClient({ ignoreSpans: [/keep-me/] });

    integration.beforeSetup!(client);

    expect(client.getOptions().ignoreSpans).toEqual([
      /keep-me/,
      /GET \/node_modules\//,
      /GET \/favicon\.ico/,
      /GET \/@id\//,
      /GET \/__manifest\?/,
    ]);
  });
});
