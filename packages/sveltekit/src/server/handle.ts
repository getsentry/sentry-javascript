import type { Handle } from '@sveltejs/kit';

/**
 * actual implementation in ../worker/handle.ts
 * @return no-op handler when initCLoudflareSentryHandle is called via node/server entry point
 */
export function initCloudflareSentryHandle(_options: unknown): Handle {
  return ({ event, resolve }) => resolve(event);
}
