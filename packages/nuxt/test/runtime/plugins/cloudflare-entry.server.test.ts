import { getIsolationScope } from '@sentry/core';
import type { NitroApp } from 'nitropack';
import { afterEach, describe, expect, it } from 'vitest';
import cloudflareEntryPlugin from '../../../src/runtime/plugins/cloudflare-entry.server';

type HookCallback = (arg: unknown) => void;

describe('cloudflare-entry.server', () => {
  afterEach(() => {
    getIsolationScope().setTransactionName(undefined);
    delete (globalThis as { __SENTRY_NUXT_CLOUDFLARE_ENTRY_WRAPPED__?: boolean })
      .__SENTRY_NUXT_CLOUDFLARE_ENTRY_WRAPPED__;
  });

  it('names the transaction after the method and the path without the query of an h3 v1 event', () => {
    const nitroHooks: Record<string, HookCallback> = {};
    cloudflareEntryPlugin({
      hooks: { hook: (name: string, callback: HookCallback) => (nitroHooks[name] = callback) },
    } as unknown as NitroApp);

    nitroHooks.request?.({ method: 'GET', path: '/api/users/42?include=profile#details' });

    expect(getIsolationScope().getScopeData().transactionName).toBe('GET /api/users/42');
  });

  it('names the transaction after the method and the path of an h3 v2 event', () => {
    const nitroHooks: Record<string, HookCallback> = {};
    const url = 'https://example.com/api/users/42?include=profile';
    cloudflareEntryPlugin({
      hooks: { hook: (name: string, callback: HookCallback) => (nitroHooks[name] = callback) },
    } as unknown as NitroApp);

    nitroHooks.request?.({ req: new Request(url, { method: 'POST' }), url: new URL(url) });

    expect(getIsolationScope().getScopeData().transactionName).toBe('POST /api/users/42');
  });
});
