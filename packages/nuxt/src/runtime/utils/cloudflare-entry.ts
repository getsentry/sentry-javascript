import { GLOBAL_OBJ } from '@sentry/core';

const CLOUDFLARE_ENTRY_WRAPPED_FLAG = '__SENTRY_NUXT_CLOUDFLARE_ENTRY_WRAPPED__';

type GlobalWithCloudflareEntryFlag = typeof GLOBAL_OBJ & { [CLOUDFLARE_ENTRY_WRAPPED_FLAG]?: boolean };

/** Records that the Sentry Nuxt module wrapped the Worker entry with `withSentry`. */
export function markCloudflareEntryWrapped(): void {
  (GLOBAL_OBJ as GlobalWithCloudflareEntryFlag)[CLOUDFLARE_ENTRY_WRAPPED_FLAG] = true;
}

/** Whether the Sentry Nuxt module wrapped the Worker entry with `withSentry`. */
export function isCloudflareEntryWrapped(): boolean {
  return (GLOBAL_OBJ as GlobalWithCloudflareEntryFlag)[CLOUDFLARE_ENTRY_WRAPPED_FLAG] === true;
}
