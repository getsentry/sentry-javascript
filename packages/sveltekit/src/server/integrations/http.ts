import type { IntegrationFn } from '@sentry/core';
import { httpIntegration as originalHttpIntegration } from '@sentry/node';

type HttpOptions = Parameters<typeof originalHttpIntegration>[0];

/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs and spans for outgoing HTTP requests which will be attached to the currently active span.
 *
 * For SvelteKit, does not create spans for incoming requests but instead we use SvelteKit's own spans.
 * If you need to create incoming spans, set the `disableIncomingRequestSpans` option to `false`.
 * (You likely don't need this!)
 *
 */
export const httpIntegration = ((options: HttpOptions = {}) => {
  /*
   * This is a slightly modified version of the original httpIntegration: We avoid creating
   * incoming request spans because:
   *
   *   - If Kit-tracing is available and enabled, we take the `sveltekit.handle.root` span
   *     as the root span and make it the `http.server` span. This gives us a single root
   *     span across all deployment plaftorms (while httpIntegration doesn't apply on e.g.
   *     AWS Lambda or edge)
   *   - If Kit-tracing is N/A or disabled and users follow the current/old docs, httpIntegration
   *     does nothing anyway, so this isn't a concern.
   *   - Which leaves the undocumented case that users --import an instrument.mjs file
   *     in which they initialize the SDK. IMHO it's fine to ignore this for now since it was
   *     well ... undocumented. Given in the future there won't be be an easy way for us
   *     to detect where the SDK is initialized, we should simply redirect users to use
   *     instrumentation.server.ts instead. If users want to, they can simply import and
   *     register `httpIntegration` and explicitly enable incoming request spans.
   */

  return originalHttpIntegration({
    // We disable incoming request spans here, because otherwise we'd end up with duplicate spans.
    disableIncomingRequestSpans: true,
    ...options,
  });
}) satisfies IntegrationFn;
