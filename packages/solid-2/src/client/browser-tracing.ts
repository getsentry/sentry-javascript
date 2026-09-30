import { browserTracingIntegration } from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';

/** Clients whose navigation spans `solidTracingIntegration` starts from the runtime's records. */
const NAVIGATION_CLIENTS = new WeakSet<Client>();

/**
 * `browserTracingIntegration` with its navigation instrumentation handed to
 * Solid's records: the browser SDK stops starting a navigation span on
 * `history.pushState`, and `solidTracingIntegration` starts it from the
 * router's `"navigation"` record instead — named by the route pattern
 * (`/users/:id`, source `route`), starting at the write that requested it
 * and ending when the runtime settled it.
 *
 * The history hook is the wrong instant for a Solid router: the URL is
 * committed with the transition, after the destination's data landed, so a
 * span started there begins when the navigation is effectively over and
 * misses the work. The record has the request time, the route, the params,
 * the outcome and the holds, so the span is built from it retroactively with
 * explicit timestamps. Page loads keep the browser SDK's own span; the
 * record of the route the document arrived on renames it.
 *
 * `instrumentNavigation: false` here means what it means on the browser
 * integration: no navigation transactions. `solidTracingIntegration` then
 * paints the record as a span of its own, as it does with no browser tracing
 * at all.
 */
export function solidBrowserTracingIntegration(
  options: Parameters<typeof browserTracingIntegration>[0] = {},
): Integration {
  const integration = browserTracingIntegration({ ...options, instrumentNavigation: false });
  const { instrumentNavigation = true } = options;
  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup?.(client);
      if (instrumentNavigation) NAVIGATION_CLIENTS.add(client);
    },
  };
}

/** Whether `solidBrowserTracingIntegration` handed this client's navigation spans to the records. */
export function drivesNavigationSpans(client: Client): boolean {
  return NAVIGATION_CLIENTS.has(client);
}
