import { GLOBAL_OBJ } from '@sentry/core';

const SENTRY_SERVER_INSTRUMENTATION_FLAG = '__sentryReactRouterServerInstrumentationUsed';
const SENTRY_OTEL_SPAN_CREATION_FLAG = '__sentryReactRouterOtelSpanCreationEnabled';

type GlobalObjWithFlag = typeof GLOBAL_OBJ & {
  [SENTRY_SERVER_INSTRUMENTATION_FLAG]?: boolean;
  [SENTRY_OTEL_SPAN_CREATION_FLAG]?: boolean;
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

/**
 * Enable OTEL data-loader span creation for React Router server.
 * @internal
 */
export function enableOtelDataLoaderSpanCreation(): void {
  (GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_OTEL_SPAN_CREATION_FLAG] = true;
}

/**
 * Check if OTEL data-loader span creation is enabled for React Router server.
 * @internal
 */
export function isOtelDataLoaderSpanCreationEnabled(): boolean {
  return !!(GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_OTEL_SPAN_CREATION_FLAG];
}
