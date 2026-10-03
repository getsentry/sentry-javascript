import type { EventProcessor } from '@sentry/core';
import { isPrerenderControlFlowError } from '../nextNavigationErrorUtils';

/** Drops the errors that React and Next.js throw for control flow: postpones, prerender aborts and Suspense exceptions. */
export const dropReactControlFlowErrorsEventProcessor: EventProcessor = Object.assign(
  ((event, hint) => {
    if (event.type !== undefined) {
      return event;
    }

    const originalException = hint.originalException;

    const isPostponeError =
      typeof originalException === 'object' &&
      originalException !== null &&
      '$$typeof' in originalException &&
      originalException.$$typeof === Symbol.for('react.postpone');

    if (isPostponeError) {
      // Postpone errors are used for partial-pre-rendering (PPR)
      return null;
    }

    if (isPrerenderControlFlowError(originalException)) {
      // Next.js aborts prerenders by rejecting the promises it handed out (e.g. `fetch()` under Cache
      // Components) and throws to bail out of static rendering. These never reach the user, so drop them
      // here as well - the wrappers cannot cover every path they escape through.
      return null;
    }

    // We don't want to capture suspense errors as they are simply used by React/Next.js for control flow
    const exceptionMessage = event.exception?.values?.[0]?.value;
    if (
      exceptionMessage?.includes('Suspense Exception: This is not a real error!') ||
      exceptionMessage?.includes('Suspense Exception: This is not a real error, and should not leak')
    ) {
      return null;
    }

    return event;
  }) satisfies EventProcessor,
  { id: 'DropReactControlFlowErrors' },
);
