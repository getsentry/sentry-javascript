import type { Client } from '@sentry/core';
import { getCurrentScope, makeDsn } from '@sentry/core';
import { _INTERNAL_resetTunnelDefaults, serveTunnelIntegration } from '@sentry/core/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setIsNitroDevServer } from '../src/devServer';
import { createNitroModule } from '../src/module';

vi.mock('../src/instruments/instrumentServer', () => ({ instrumentServer: vi.fn() }));
vi.mock('../src/sourceMaps', () => ({ setupSourceMaps: vi.fn() }));
vi.mock('../src/devServer', () => ({ setIsNitroDevServer: vi.fn() }));

const DSN = 'https://public@o1.ingest.sentry.io/1337';

/** Sets a client with `serveTunnelIntegration` set up. */
function setClient(managedTunnel: object): Record<string, unknown> {
  const options: Record<string, unknown> = { dsn: DSN };
  const client = { getDsn: () => makeDsn(DSN), getOptions: () => options } as unknown as Client;
  getCurrentScope().setClient(client);
  serveTunnelIntegration(managedTunnel).setup!(client);

  return options;
}

function setup(options: {
  dev: boolean;
  baseURL: string;
  runtimeConfig?: Record<string, unknown>;
  devServer?: { runner?: string };
}): void {
  (createNitroModule().setup as (nitro: unknown) => void)({ options: { runtimeConfig: {}, ...options } });
}

describe('createNitroModule', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
    _INTERNAL_resetTunnelDefaults();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
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

  it("serves the dev server's managed tunnel under a framework's `sentryTunnelBasePath`", () => {
    const options = setClient({});

    setup({ dev: true, baseURL: '/', runtimeConfig: { sentryTunnelBasePath: '/app' } });

    expect(options._managedTunnel).toEqual({ basePath: '/app' });
  });

  it.each([undefined, 'node-worker', 'node-process'])(
    'marks the dev server, which runs Nitro in a worker with the %s runner',
    runner => {
      setClient({});

      setup({ dev: true, baseURL: '/', devServer: { runner } });

      expect(setIsNitroDevServer).toHaveBeenCalledOnce();
    },
  );

  it('marks the dev server for a worker runner from `NITRO_DEV_RUNNER`', () => {
    vi.stubEnv('NITRO_DEV_RUNNER', 'node-process');
    setClient({});

    setup({ dev: true, baseURL: '/', devServer: {} });

    expect(setIsNitroDevServer).toHaveBeenCalledOnce();
  });

  it('does not mark the dev server when Nitro runs in it with the `self` runner', () => {
    setClient({});

    setup({ dev: true, baseURL: '/', devServer: { runner: 'self' } });

    expect(setIsNitroDevServer).not.toHaveBeenCalled();
  });

  it('does not mark a build as the dev server', () => {
    setClient({});

    setup({ dev: false, baseURL: '/' });

    expect(setIsNitroDevServer).not.toHaveBeenCalled();
  });
});
