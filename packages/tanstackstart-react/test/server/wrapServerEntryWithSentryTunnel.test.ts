import type { Client } from '@sentry/core';
import { createEnvelope, getCurrentScope, getTunnelPath, makeDsn, serializeEnvelope } from '@sentry/core';
import { _INTERNAL_resetManagedTunnelDefaults, serveTunnelIntegration } from '@sentry/core/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapServerEntryWithSentryTunnel } from '../../src/server/tunnelRoute';

const DSN = 'https://public@o1.ingest.sentry.io/1337';
const TUNNEL_URL = `http://localhost:3000${getTunnelPath(DSN)}`;

function makeEnvelopeRequest(url: string): Request {
  const body = serializeEnvelope(createEnvelope({ dsn: DSN }, [])) as string;

  return new Request(url, { method: 'POST', body, headers: { 'content-length': String(body.length) } });
}

/** Sets a client, with `serveTunnelIntegration` set up when `managedTunnel` is given. */
function setClient(managedTunnel: object | undefined): void {
  const options = { dsn: DSN, ignoreSpans: [] };
  const client = { getDsn: () => makeDsn(DSN), getOptions: () => options } as unknown as Client;
  getCurrentScope().setClient(client);
  if (managedTunnel) {
    serveTunnelIntegration(managedTunnel).setup!(client);
  }
}

describe('wrapServerEntryWithSentryTunnel', () => {
  const appFetch = vi.fn(() => new Response('app'));
  const sentryFetch = vi.fn(() => Promise.resolve(new Response('forwarded')));

  beforeEach(() => {
    vi.stubGlobal('fetch', sentryFetch);
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
    _INTERNAL_resetManagedTunnelDefaults();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('hands every request to the app when the managed tunnel is off', async () => {
    setClient(undefined);

    const response = await wrapServerEntryWithSentryTunnel({ fetch: appFetch }).fetch(makeEnvelopeRequest(TUNNEL_URL));

    expect(await response.text()).toBe('app');
    expect(sentryFetch).not.toHaveBeenCalled();
  });

  it('passes other requests and their options to the app', async () => {
    setClient({});
    const request = makeEnvelopeRequest('http://localhost:3000/api/users');

    await wrapServerEntryWithSentryTunnel({ fetch: appFetch }).fetch(request, { context: 1 });

    expect(appFetch).toHaveBeenCalledWith(request, { context: 1 });
  });

  it("passes every argument to the app, like a Cloudflare Worker's `env` and `ctx`", async () => {
    setClient({});
    const request = makeEnvelopeRequest('http://localhost:3000/api/users');
    const env = { E2E_TEST_DSN: DSN };
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

    await wrapServerEntryWithSentryTunnel({ fetch: appFetch }).fetch(request, env, ctx);

    expect(appFetch).toHaveBeenCalledWith(request, env, ctx);
  });

  it('returns a class entry, like a `WorkerEntrypoint`, unchanged', () => {
    class Worker {
      public fetch(): Response {
        return new Response('app');
      }
    }

    expect(wrapServerEntryWithSentryTunnel(Worker as unknown as { fetch: () => Response })).toBe(Worker);
  });

  it('enables `tunnelRoute` on the client like `serveTunnelIntegration` would, dropping its spans from the start', () => {
    setClient(undefined);
    const options = getCurrentScope().getClient()!.getOptions();

    wrapServerEntryWithSentryTunnel({ fetch: appFetch }, {});

    expect(options._managedTunnel).toEqual({});
    expect(
      (options.ignoreSpans![0] as { attributes: { 'url.path': RegExp } }).attributes['url.path'].test(
        getTunnelPath(DSN)!,
      ),
    ).toBe(true);
  });
});
