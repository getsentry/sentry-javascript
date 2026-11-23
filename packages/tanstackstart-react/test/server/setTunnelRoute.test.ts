import type { Client } from '@sentry/core';
import { getCurrentScope, getTunnelPath, makeDsn } from '@sentry/core';
import { _INTERNAL_resetTunnelDefaults, serveTunnelIntegration } from '@sentry/core/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setTunnelRoute } from '../../src/server/tunnelRoute';

const DSN = 'https://public@o1.ingest.sentry.io/1337';

/** Sets a client, with `serveTunnelIntegration` set up when `managedTunnel` is given. */
function setClient(managedTunnel: object | undefined): void {
  const options = { dsn: DSN, ignoreSpans: [] };
  const client = { getDsn: () => makeDsn(DSN), getOptions: () => options } as unknown as Client;
  getCurrentScope().setClient(client);
  if (managedTunnel) {
    serveTunnelIntegration(managedTunnel).setup!(client);
  }
}

describe('setTunnelRoute', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
    _INTERNAL_resetTunnelDefaults();
  });

  it('enables `tunnelRoute` on the client like `serveTunnelIntegration` would, dropping its spans from the start', () => {
    setClient(undefined);
    const options = getCurrentScope().getClient()!.getOptions();

    setTunnelRoute({});

    expect(options._managedTunnel).toEqual({});
    expect(
      (options.ignoreSpans![0] as { attributes: { 'url.path': RegExp } }).attributes['url.path'].test(
        getTunnelPath(DSN)!,
      ),
    ).toBe(true);
  });
});
