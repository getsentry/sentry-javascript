import { addExtensionMethods, wrapTransactionWithProfiling } from './hubextensions';
import { BrowserProfilingIntegration } from './integration';

// This is a side effect, it patches the global object and injects the Profiling extensions methods
addExtensionMethods();

export { BrowserProfilingIntegration };
export { wrapTransactionWithProfiling };
