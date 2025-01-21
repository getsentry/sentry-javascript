import type { Handle } from '@sveltejs/kit';

/** Documented in `worker/handle.ts` */
export function initCloudflareSentryHandle(_options: unknown): Handle {
  return ({ event, resolve }) => resolve(event);
}
