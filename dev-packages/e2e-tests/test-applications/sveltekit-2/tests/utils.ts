import { Page } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

/**
 * Helper function that waits for the initial pageload to complete.
 *
 * This function
 * - loads the given route ("/" by default)
 * - waits for SvelteKit's hydration
 * - waits for the pageload span to be sent (doesn't assert on it though)
 *
 * Useful for tests that test outcomes of _navigations_ after an initial pageload.
 * Waiting on the pageload span excludes edge cases where navigations occur
 * so quickly that the pageload idle span is still active. This might lead
 * to cases where the routing span would be attached to the pageload span
 * and hence eliminates a lot of flakiness.
 *
 */
export async function waitForInitialPageload(
  page: Page,
  opts?: { route?: string; parameterizedRoute?: string; debug?: boolean },
) {
  const route = opts?.route ?? '/';
  const spanName = opts?.parameterizedRoute ?? route;
  const debug = opts?.debug ?? false;

  const clientPageloadSpanPromise = waitForStreamedSpan('sveltekit-2', span => {
    debug &&
      console.log({
        name: span.name,
        op: getSpanOp(span),
        trace: span.trace_id,
        span: span.span_id,
        parent: span.parent_span_id,
      });

    return span.name === spanName && getSpanOp(span) === 'pageload' && span.is_segment;
  });

  await Promise.all([
    page.goto(route),
    // the test app adds the "hydrated" class to the body when hydrating
    page.waitForSelector('body.hydrated'),
    // also waiting for the initial pageload span so that later navigations don't interfere
    clientPageloadSpanPromise,
  ]);

  debug && console.log('hydrated');
}
