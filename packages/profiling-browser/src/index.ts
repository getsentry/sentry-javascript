import { addExtensionMethods, wrapTransactionWithProfiling } from './hubextensions';
import { BrowserProfilingIntegration } from './integration';

// Side effect that patches the global object and injects the Profiling extensions methods
addExtensionMethods();

export { BrowserProfilingIntegration };
// Export wrapTransactionWithProfiling for integration with browser tracing which uses idleTransaction
// and not the profiling patched startTransaction method.
export { wrapTransactionWithProfiling };
