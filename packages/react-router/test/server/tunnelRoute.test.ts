import type { Client } from '@sentry/core';
import { createEnvelope, getCurrentScope, getTunnelPath, makeDsn, serializeEnvelope } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSentryTunnelRoute } from '../../src/server/tunnelRoute';

const DSN = 'https://public@o1.ingest.sentry.io/1337';

type TunnelRoute = {
  path: string;
  parentId: undefined;
  module: { action: (args: { request: Request }) => Promise<Response> | Response; loader: () => Response };
};

function setClient(managedTunnel: object | undefined): void {
  const options = { dsn: DSN, _managedTunnel: managedTunnel };
  getCurrentScope().setClient({ getDsn: () => makeDsn(DSN), getOptions: () => options } as unknown as Client);
}

describe('createSentryTunnelRoute', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
    vi.unstubAllGlobals();
  });

  it('is a top-level route at the tunnel path when `init` enabled the managed tunnel', () => {
    setClient({});
    const route = createSentryTunnelRoute() as TunnelRoute;

    expect(route.parentId).toBeUndefined();
    expect(route.path).toBe(getTunnelPath(DSN));
  });

  it('serves a path that never matches when the tunnel is off or Sentry is not initialized yet', () => {
    const route = createSentryTunnelRoute() as TunnelRoute;
    const pathWithoutClient = route.path;
    setClient(undefined);

    expect(pathWithoutClient).toBe('/__sentry-tunnel-disabled__');
    expect(route.path).toBe('/__sentry-tunnel-disabled__');
  });

  it('forwards tunnel POSTs and rejects other methods', async () => {
    setClient({});
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('forwarded'))),
    );
    const route = createSentryTunnelRoute() as TunnelRoute;
    const request = new Request(`http://localhost${getTunnelPath(DSN)}`, {
      method: 'POST',
      body: serializeEnvelope(createEnvelope({ dsn: DSN }, [])) as BodyInit,
    });

    expect(await (await route.module.action({ request })).text()).toBe('forwarded');
    expect(route.module.loader().status).toBe(405);
  });

  it('serves the tunnel under `basename`, which React Router leaves in the request URL', async () => {
    setClient({});
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('forwarded'))),
    );
    const route = createSentryTunnelRoute('/app/') as TunnelRoute;
    const request = new Request(`http://localhost/app${getTunnelPath(DSN)}`, {
      method: 'POST',
      body: serializeEnvelope(createEnvelope({ dsn: DSN }, [])) as BodyInit,
    });

    // React Router matches the route under `basename` itself, so the path stays relative to it.
    expect(route.path).toBe(getTunnelPath(DSN));
    expect(await (await route.module.action({ request })).text()).toBe('forwarded');
  });
});
