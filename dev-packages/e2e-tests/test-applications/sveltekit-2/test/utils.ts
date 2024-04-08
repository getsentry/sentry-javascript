import { Page } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';

/**
 * Helper function that waits for the initial pageload to complete.
 *
 * This function
 * - loads the given route ("/" by default)
 * - waits for SvelteKit's hydration
 * - waits for the pageload transaction to be sent (doesn't assert on it though)
 *
 * Useful for tests that test outcomes of _navigations_ after an initial pageload.
 * Waiting on the pageload transaction excludes edge cases where navigations occur
 * so quickly that the pageload idle transaction is still active. This might lead
 * to cases where the routing span would be attached to the pageload transaction
 * and hence eliminates a lot of flakiness.
 *
 */
export async function waitForInitialPageload(
  page: Page,
  opts?: { route?: string; parameterizedRoute?: string; debug?: boolean },
) {
  const route = opts?.route ?? '/';
  const txnName = opts?.parameterizedRoute ?? route;
  const debug = opts?.debug ?? false;

  const clientPageloadTxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
    debug &&
      console.log({
        txn: txnEvent?.transaction,
        op: txnEvent.contexts?.trace?.op,
        trace: txnEvent.contexts?.trace?.trace_id,
        span: txnEvent.contexts?.trace?.span_id,
        parent: txnEvent.contexts?.trace?.parent_span_id,
      });

    return txnEvent?.transaction === txnName && txnEvent.contexts?.trace?.op === 'pageload';
  });

  await Promise.all([
    page.goto(route),
    // the test app adds the "hydrated" class to the body when hydrating
    page.waitForSelector('body.hydrated'),
    // also waiting for the initial pageload txn so that later navigations don't interfere
    clientPageloadTxnEventPromise,
  ]);

  debug && console.log('hydrated');
}
