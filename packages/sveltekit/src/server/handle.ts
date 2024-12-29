import { continueTrace } from '@sentry/core';
import type { Handle } from '@sveltejs/kit';

import { sentryHandleGeneric, SentryHandleOptions } from '../server-common/handle';

/**
 * A SvelteKit handle function that wraps the request for Sentry error and
 * performance monitoring.
 *
 * Usage:
 * ```
 * // src/hooks.server.ts
 * import { sentryHandle } from '@sentry/sveltekit';
 *
 * export const handle = sentryHandle();
 *
 * // Optionally use the `sequence` function to add additional handlers.
 * // export const handle = sequence(sentryHandle(), yourCustomHandler);
 * ```
 */
export function sentryHandle(handlerOptions?: SentryHandleOptions): Handle {
  const sentryRequestHandler = sentryHandleGeneric(continueTrace, handlerOptions);

  return sentryRequestHandler;
}

/** Documented in `worker/handle.ts` */
export function initCloudflareSentryHandle(_options: any): Handle {
  return ({ event, resolve }) => resolve(event);
}
