export * from '@sentry-internal/tracing';

import { addExtensionMethods } from '@sentry-internal/tracing';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

// Guard for tree
if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
  // We are patching the global object with our hub extension methods
  addExtensionMethods();
}

export { addExtensionMethods };
