import type { Transaction } from '@sentry/types';
import { extractTraceparentData as _extractTraceparentData } from '@sentry/utils';

import type { Hub } from '../hub';
import { getCurrentHub } from '../hub';

/**
 * Grabs active transaction off scope.
 *
 * @deprecated You should not rely on the transaction, but just use `startSpan()` APIs instead.
 */
export function getActiveTransaction<T extends Transaction>(maybeHub?: Hub): T | undefined {
  // eslint-disable-next-line deprecation/deprecation
  const hub = maybeHub || getCurrentHub();
  // eslint-disable-next-line deprecation/deprecation
  const scope = hub.getScope();
  // eslint-disable-next-line deprecation/deprecation
  return scope.getTransaction() as T | undefined;
}

// so it can be used in manual instrumentation without necessitating a hard dependency on @sentry/utils
export { stripUrlQueryAndFragment } from '@sentry/utils';

/**
 * The `extractTraceparentData` function and `TRACEPARENT_REGEXP` constant used
 * to be declared in this file. It was later moved into `@sentry/utils` as part of a
 * move to remove `@sentry/tracing` dependencies from `@sentry/node` (`extractTraceparentData`
 * is the only tracing function used by `@sentry/node`).
 *
 * These exports are kept here for backwards compatability's sake.
 *
 * See https://github.com/getsentry/sentry-javascript/issues/4642 for more details.
 *
 * @deprecated Import this function from `@sentry/utils` instead
 */
export const extractTraceparentData = _extractTraceparentData;
