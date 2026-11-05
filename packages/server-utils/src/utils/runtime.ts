import { GLOBAL_OBJ } from '@sentry/core';

const globalWithRuntimes = GLOBAL_OBJ as typeof GLOBAL_OBJ & { Bun?: unknown; Deno?: unknown };

/** Whether the SDK runs in Bun. */
export function isBun(): boolean {
  return typeof globalWithRuntimes.Bun !== 'undefined';
}

/** Whether the SDK runs in Deno. */
export function isDeno(): boolean {
  return typeof globalWithRuntimes.Deno !== 'undefined';
}

/** Whether the SDK runs in Cloudflare Workers. */
export function isCloudflareWorkers(): boolean {
  return GLOBAL_OBJ.navigator?.userAgent === 'Cloudflare-Workers';
}
