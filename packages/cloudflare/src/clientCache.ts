import { GLOBAL_OBJ } from '@sentry/core';
import type { CloudflareClient } from './client';

const GLOBAL_CLIENT_KEY = '__SENTRY_CLOUDFLARE_CLIENT__' as const;

type GlobalWithCloudflareClient = typeof GLOBAL_OBJ & {
  [GLOBAL_CLIENT_KEY]?: CloudflareClient;
};

/** Returns the one cached Cloudflare client for this isolate. */
export function getCachedClient(): CloudflareClient | undefined {
  return (GLOBAL_OBJ as GlobalWithCloudflareClient)[GLOBAL_CLIENT_KEY];
}

/** Stores the one Cloudflare client reused by every invocation in this isolate. */
export function cacheClient(client: CloudflareClient): void {
  (GLOBAL_OBJ as GlobalWithCloudflareClient)[GLOBAL_CLIENT_KEY] = client;
}

/** @hidden Only for testing - clears the isolate's cached Cloudflare client. */
export function _clearGlobalClientCache(): void {
  (GLOBAL_OBJ as GlobalWithCloudflareClient)[GLOBAL_CLIENT_KEY] = undefined;
}
