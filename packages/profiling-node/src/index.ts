import { addExtensionMethods } from './hubextensions';
import { ProfilingIntegration } from './integration';

// Treeshakable guard to remove all code related to profiling
declare const __SENTRY_PROFILING: boolean;

// Guard for tree
if (typeof __SENTRY_PROFILING === 'undefined' || __SENTRY_PROFILING) {
  addExtensionMethods();
}

export { ProfilingIntegration };
