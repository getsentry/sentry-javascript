import type { Context } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import type { CapturedErrorContext } from 'nitropack';

/**
 *  Extracts the relevant context information from the error context (H3Event in Nitro Error)
 *  and created a structured context object.
 */
export function extractErrorContext(errorContext: CapturedErrorContext): Context {
  const structuredContext: Context = {
    method: undefined,
    path: undefined,
    tags: undefined,
  };

  if (errorContext && errorContext.event) {
    if (errorContext.event) {
      structuredContext.method = errorContext.event._method || undefined;
      structuredContext.path = errorContext.event._path || undefined;
    }

    if (Array.isArray(errorContext.tags)) {
      structuredContext.tags = errorContext.tags || undefined;
    }
  }

  return dropUndefinedKeys(structuredContext);
}
