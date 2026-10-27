import type { Client } from '@sentry/core';
import { getCurrentScope, makeDsn } from '@sentry/core';
import { _INTERNAL_resetManagedTunnelDefaults, serveTunnelIntegration } from '@sentry/core/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNitroModule } from '../src/module';

vi.mock('../src/instruments/instrumentServer', () => ({ instrumentServer: vi.fn() }));
vi.mock('../src/sourceMaps', () => ({ setupSourceMaps: vi.fn() }));

const DSN = 'https://public@o1.ingest.sentry.io/1337';

/** Sets a client with `serveTunnelIntegration` set up. */
function setClient(managedTunnel: object): Record<string, unknown> {
  const options: Record<string, unknown> = { dsn: DSN };
  const client = { getDsn: () => makeDsn(DSN), getOptions: () => options } as unknown as Client;
  getCurrentScope().setClient(client);
  serveTunnelIntegration(managedTunnel).setup!(client);

  return options;
}

function setup(options: { dev: boolean; baseURL: string }): void {
  (createNitroModule().setup as (nitro: unknown) => void)({ options });
}

describe('createNitroModule', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
    _INTERNAL_resetManagedTunnelDefaults();
  });

  it("serves the dev server's managed tunnel under `baseURL`", () => {
    const options = setClient({});

    setup({ dev: true, baseURL: '/app/' });

    expect(options._managedTunnel).toEqual({ basePath: '/app' });
  });

  it('leaves the client alone in a build, where the runtime plugin applies the base path', () => {
    const options = setClient({});

    setup({ dev: false, baseURL: '/app/' });

    expect(options._managedTunnel).toEqual({});
  });
});
