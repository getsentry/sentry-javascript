import { describe, expect, it, vi } from 'vitest';
import { isNitroDevServer } from '../src/devServer';
import { getDefaultIntegrations, init } from '../src/sdk';

const { httpIntegration } = vi.hoisted(() => ({ httpIntegration: vi.fn(() => ({ name: 'Http' })) }));

vi.mock('@sentry/node', async importOriginal => ({ ...(await importOriginal<object>()), httpIntegration }));

describe('getDefaultIntegrations', () => {
  it('sets up a single Http integration that skips the dev server requests', () => {
    const integrations = getDefaultIntegrations({});

    expect(integrations?.filter(integration => integration.name === 'Http')).toHaveLength(1);
    expect(httpIntegration).toHaveBeenCalledWith({ ignoreIncomingRequests: isNitroDevServer });
  });
});

describe('init', () => {
  it('accepts enableNitroErrorHandler and keeps it on the client options', () => {
    const client = init({ dsn: 'https://public@dsn.ingest.sentry.io/1337', enableNitroErrorHandler: false });

    expect(client?.getOptions()).toMatchObject({ enableNitroErrorHandler: false });
  });
});
