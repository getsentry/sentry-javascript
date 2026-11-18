import { describe, expect, it, vi } from 'vitest';
import { isNitroDevServer } from '../src/devServer';
import { getDefaultIntegrations } from '../src/sdk';

const { httpIntegration } = vi.hoisted(() => ({ httpIntegration: vi.fn(() => ({ name: 'Http' })) }));

vi.mock('@sentry/node', async importOriginal => ({ ...(await importOriginal<object>()), httpIntegration }));

describe('getDefaultIntegrations', () => {
  it('sets up a single Http integration that skips the dev server requests', () => {
    const integrations = getDefaultIntegrations({});

    expect(integrations?.filter(integration => integration.name === 'Http')).toHaveLength(1);
    expect(httpIntegration).toHaveBeenCalledWith({ ignoreIncomingRequests: isNitroDevServer });
  });
});
