import type { Client } from '@sentry/core';
import { createEnvelope, getCurrentScope, getTunnelPath, makeDsn, serializeEnvelope } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapServerEntryWithSentryTunnel } from '../../src/server/tunnelRoute';

const DSN = 'https://public@o1.ingest.sentry.io/1337';
const TUNNEL_URL = `http://localhost:3000${getTunnelPath(DSN)}`;

function makeEnvelopeRequest(url: string): Request {
  return new Request(url, { method: 'POST', body: serializeEnvelope(createEnvelope({ dsn: DSN }, [])) as BodyInit });
}

function setClient(managedTunnel: object | undefined): void {
  const options = { dsn: DSN, _managedTunnel: managedTunnel, ignoreSpans: [] };
  getCurrentScope().setClient({ getDsn: () => makeDsn(DSN), getOptions: () => options } as unknown as Client);
}

describe('wrapServerEntryWithSentryTunnel', () => {
  const appFetch = vi.fn(() => new Response('app'));
  const sentryFetch = vi.fn(() => Promise.resolve(new Response('forwarded')));

  beforeEach(() => {
    vi.stubGlobal('fetch', sentryFetch);
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('answers the tunnel path when `init` enabled the managed tunnel, without calling the app', async () => {
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

  it('serves the tunnel with build-time options even when `init` did not enable it', async () => {
    setClient(undefined);

    const response = await wrapServerEntryWithSentryTunnel({ fetch: appFetch }, {}).fetch(
      makeEnvelopeRequest(TUNNEL_URL),
    );

    expect(await response.text()).toBe('forwarded');
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

  it('ignores spans for the tunnel path from the start when the client already exists', async () => {
    // Paths are registered once per module, and earlier tests already registered this one.
    vi.resetModules();
    const { wrapServerEntryWithSentryTunnel: freshWrap } = await import('../../src/server/tunnelRoute');
    setClient({});
    const options = getCurrentScope().getClient()!.getOptions();

    freshWrap({ fetch: appFetch });

    expect(options.ignoreSpans).toEqual([{ attributes: { 'url.path': expect.any(RegExp) } }]);
    expect(
      (options.ignoreSpans![0] as { attributes: { 'url.path': RegExp } }).attributes['url.path'].test(
        getTunnelPath(DSN)!,
      ),
    ).toBe(true);
  });

  it('answers the tunnel under the base path Start routes on, and only there', async () => {
    setClient({});
    const wrapped = wrapServerEntryWithSentryTunnel({ fetch: appFetch }, undefined, '/app');

    expect(
      await (await wrapped.fetch(makeEnvelopeRequest(`http://localhost:3000/app${getTunnelPath(DSN)}`))).text(),
    ).toBe('forwarded');
    expect(await (await wrapped.fetch(makeEnvelopeRequest(TUNNEL_URL))).text()).toBe('app');
  });

  it('keeps a base path the server `init` set', async () => {
    setClient({ basePath: '/custom' });
    const wrapped = wrapServerEntryWithSentryTunnel({ fetch: appFetch }, undefined, '/app');

    expect(
      await (await wrapped.fetch(makeEnvelopeRequest(`http://localhost:3000/custom${getTunnelPath(DSN)}`))).text(),
    ).toBe('forwarded');
  });
});
