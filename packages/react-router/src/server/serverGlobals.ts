import { GLOBAL_OBJ } from '@sentry/core';

const SENTRY_SERVER_INSTRUMENTATION_FLAG = '__sentryReactRouterServerInstrumentationUsed';

type GlobalObjWithFlag = typeof GLOBAL_OBJ & {
  [SENTRY_SERVER_INSTRUMENTATION_FLAG]?: boolean;
};

/**
 * Mark that the React Router instrumentation API is being used on the server.
 * @internal
 */
export function markInstrumentationApiUsed(): void {
  (GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_SERVER_INSTRUMENTATION_FLAG] = true;
}

/**
 * Check if React Router's instrumentation API is being used on the server.
 * @experimental
 */
export function isInstrumentationApiUsed(): boolean {
  return !!(GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_SERVER_INSTRUMENTATION_FLAG];
}
