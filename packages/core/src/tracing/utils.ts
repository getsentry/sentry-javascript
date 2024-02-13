import type { Transaction } from '@sentry/types';

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
