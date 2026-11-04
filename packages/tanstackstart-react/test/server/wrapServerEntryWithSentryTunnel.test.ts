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

  it('answers the tunnel path when `serveTunnelIntegration` is set up, without calling the app', async () => {
    setClient({});

    const response = await wrapServerEntryWithSentryTunnel({ fetch: appFetch }).fetch(makeEnvelopeRequest(TUNNEL_URL));

    expect(await response.text()).toBe('forwarded');
    expect(appFetch).not.toHaveBeenCalled();
  });

  it('hands every request to the app when the managed tunnel is off', async () => {
    setClient(undefined);

    const response = await wrapServerEntryWithSentryTunnel({ fetch: appFetch }).fetch(makeEnvelopeRequest(TUNNEL_URL));

    expect(await response.text()).toBe('app');
    expect(sentryFetch).not.toHaveBeenCalled();
  });

  it('serves the tunnel with build-time options even without `serveTunnelIntegration`', async () => {
    setClient(undefined);

    const response = await wrapServerEntryWithSentryTunnel({ fetch: appFetch }, {}).fetch(
      makeEnvelopeRequest(TUNNEL_URL),
    );

    expect(await response.text()).toBe('forwarded');
  });

  it('rejects other methods on a fixed `tunnelRoute` path instead of rendering the app', async () => {
    setClient(undefined);
    const entry: { fetch: (request: Request) => Response } = { fetch: appFetch };
    const wrapped = wrapServerEntryWithSentryTunnel(entry, { path: '/monitor' });

    const response = await wrapped.fetch(new Request('http://localhost:3000/monitor'));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(appFetch).not.toHaveBeenCalled();
    expect(await (await wrapped.fetch(new Request('http://localhost:3000/other'))).text()).toBe('app');
  });

  it('rejects other methods on the DSN-derived tunnel path too', async () => {
    setClient({});
    const entry: { fetch: (request: Request) => Response } = { fetch: appFetch };

    const response = await wrapServerEntryWithSentryTunnel(entry).fetch(new Request(TUNNEL_URL));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(appFetch).not.toHaveBeenCalled();
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

  it("keeps a class instance entry's prototype handlers, like a Worker's `scheduled`", async () => {
    setClient({});
    class Handler {
      public fetch(_request: Request): Response {
        return new Response('app');
      }

      public scheduled(): string {
        return 'scheduled';
      }
    }

    const wrapped = wrapServerEntryWithSentryTunnel(new Handler());

    expect(wrapped.scheduled()).toBe('scheduled');
    expect(wrapped).toBeInstanceOf(Handler);
    expect(await (await wrapped.fetch(makeEnvelopeRequest(TUNNEL_URL))).text()).toBe('forwarded');
  });

  it('wraps an entry whose prototype is frozen', async () => {
    setClient({});
    class Handler {
      public fetch(_request: Request): Response {
        return new Response('app');
      }
    }
    Object.freeze(Handler.prototype);

    const wrapped = wrapServerEntryWithSentryTunnel(new Handler());

    expect(await (await wrapped.fetch(makeEnvelopeRequest(TUNNEL_URL))).text()).toBe('forwarded');
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

  it('keeps the options of `serveTunnelIntegration` over `tunnelRoute`', async () => {
    setClient({ path: '/from-init' });
    const options = getCurrentScope().getClient()!.getOptions();

    const response = await wrapServerEntryWithSentryTunnel({ fetch: appFetch }, { path: '/from-build' }).fetch(
      makeEnvelopeRequest('http://localhost:3000/from-init'),
    );

    expect(options._managedTunnel).toEqual({ path: '/from-init' });
    expect(await response.text()).toBe('forwarded');
  });

  it('answers the tunnel under the base path Start routes on, and only there', async () => {
    setClient({});
    const wrapped = wrapServerEntryWithSentryTunnel({ fetch: appFetch }, undefined, '/app');

    expect(
      await (await wrapped.fetch(makeEnvelopeRequest(`http://localhost:3000/app${getTunnelPath(DSN)}`))).text(),
    ).toBe('forwarded');
    expect(await (await wrapped.fetch(makeEnvelopeRequest(TUNNEL_URL))).text()).toBe('app');
  });

  it('keeps a base path `serveTunnelIntegration` set', async () => {
    setClient({ basePath: '/custom' });
    const wrapped = wrapServerEntryWithSentryTunnel({ fetch: appFetch }, undefined, '/app');

    expect(
      await (await wrapped.fetch(makeEnvelopeRequest(`http://localhost:3000/custom${getTunnelPath(DSN)}`))).text(),
    ).toBe('forwarded');
  });
});
