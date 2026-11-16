import { GLOBAL_OBJ } from '@sentry/core';

type GlobalWithRuntimes = typeof GLOBAL_OBJ & { Bun?: unknown; Deno?: unknown };

/** Whether the SDK runs in Bun. */
export function isBun(): boolean {
  return typeof (GLOBAL_OBJ as GlobalWithRuntimes).Bun !== 'undefined';
}

/** Whether the SDK runs in Deno. */
export function isDeno(): boolean {
  return typeof (GLOBAL_OBJ as GlobalWithRuntimes).Deno !== 'undefined';
}

/** Whether the SDK runs in Cloudflare Workers. */
export function isCloudflareWorkers(): boolean {
  return GLOBAL_OBJ.navigator?.userAgent === 'Cloudflare-Workers';
}
